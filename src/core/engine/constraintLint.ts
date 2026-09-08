import type { JSONContent } from "@tiptap/core";
import {
  type Condition,
  type ConstraintDef,
  eachCondition,
  eachMetric,
  type Metric,
} from "../schema/constraint";
import { collectNodes } from "../schema/references";
import type { Ruleset } from "../schema/ruleset";

/**
 * Design-time checks for the authoring UI — not part of validation. Nothing
 * here inspects a list; these are static properties of a `ConstraintDef` and
 * the ruleset it lives in.
 */
export interface LintIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  /**
   * Which record carries the constraint. `category` is only produced by
   * `lintConstraint` / `lintDraftConstraint` — `lintRuleset` does not yet walk
   * `CategoryDef.constraints` (the engine does not expand those onto instances).
   */
  host: { kind: "nodeDef" | "categoryRecord" | "format" | "category"; id: string };
  constraintId: string;
}

interface Host {
  kind: LintIssue["host"]["kind"];
  id: string;
  constraints: ConstraintDef[];
}

/** Everything a single constraint needs to be linted outside a full `lintRuleset` pass. */
export interface LintConstraintCtx {
  host: { kind: LintIssue["host"]["kind"]; id: string };
  /** Declared resource ids — an unknown `resourceLimit` / `costSum` id is an error. */
  resourceIds: Set<string>;
  /** Every constraint id an `overrides` entry may legally name. */
  knownConstraintIds: Set<string>;
}

export function lintRuleset(ruleset: Ruleset): LintIssue[] {
  const hosts = constraintHosts(ruleset);
  const resourceIds = new Set((ruleset.listBuilding?.resources ?? []).map((r) => r.id));
  const knownConstraintIds = new Set(hosts.flatMap((h) => h.constraints.map((c) => c.id)));

  const issues: LintIssue[] = [];
  for (const host of hosts) {
    for (const constraint of host.constraints) {
      issues.push(...lintConstraint(constraint, { host, resourceIds, knownConstraintIds }));
    }
  }
  return issues;
}

/**
 * Lint one constraint — possibly a not-yet-persisted draft from the constraint
 * editor. `resourceIds` comes from the ruleset; `knownConstraintIds` must
 * already include the draft's own id and its host siblings so `overrides`
 * self/sibling references validate.
 */
export function lintDraftConstraint(
  c: ConstraintDef,
  ruleset: Ruleset,
  host: { kind: LintIssue["host"]["kind"]; id: string },
): LintIssue[] {
  const resourceIds = new Set((ruleset.listBuilding?.resources ?? []).map((r) => r.id));
  const knownConstraintIds = new Set<string>([c.id]);
  for (const h of constraintHosts(ruleset)) {
    for (const existing of h.constraints) knownConstraintIds.add(existing.id);
  }
  for (const existing of hostConstraints(ruleset, host)) knownConstraintIds.add(existing.id);
  return lintConstraint(c, { host, resourceIds, knownConstraintIds });
}

/** The constraints already on `host`, for sibling-id resolution. */
function hostConstraints(
  ruleset: Ruleset,
  host: { kind: LintIssue["host"]["kind"]; id: string },
): ConstraintDef[] {
  switch (host.kind) {
    case "nodeDef":
      return ruleset.registry.nodeDefs[host.id]?.constraints ?? [];
    case "categoryRecord":
      return ruleset.registry.categoryRecords[host.id]?.constraints ?? [];
    case "format":
      return ruleset.listBuilding?.formats.find((f) => f.id === host.id)?.constraints ?? [];
    case "category":
      return ruleset.listBuilding?.categories.find((c) => c.id === host.id)?.constraints ?? [];
    default:
      return [];
  }
}

export function lintConstraint(c: ConstraintDef, ctx: LintConstraintCtx): LintIssue[] {
  const out: LintIssue[] = [];
  const at = (code: string, severity: LintIssue["severity"], message: string): void => {
    out.push({
      code,
      severity,
      message,
      host: { kind: ctx.host.kind, id: ctx.host.id },
      constraintId: c.id,
    });
  };

  eachConstraintMetric(c, (m) => {
    for (const divisor of divisorsOf(m)) {
      if (divisor.op === "constant" && divisor.value === 0) {
        at("divide-by-zero", "error", "Divides by a constant 0.");
      } else if (!(divisor.op === "constant" && divisor.value !== 0)) {
        at("divisor-may-be-zero", "warning", "Divisor can evaluate to 0; the result would be 0.");
      }
    }
    if (m.op === "resourceLimit" && !ctx.resourceIds.has(m.resourceId)) {
      at(
        "unknown-resource",
        "error",
        `resourceLimit names an undeclared resource "${m.resourceId}".`,
      );
    }
    if (m.op === "costSum" && !ctx.resourceIds.has(m.resourceId)) {
      at("unknown-resource", "error", `costSum names an undeclared resource "${m.resourceId}".`);
    }
    if (m.op === "wholeSubtree" && !c.perPartition) {
      at("whole-subtree-noop", "warning", "wholeSubtree outside perPartition has no effect.");
    }
  });

  eachConstraintCondition(c, (cond) => {
    if (cond.op !== "compare") return;
    const mixed =
      (canBeNonInteger(cond.left) && isCount(cond.right)) ||
      (canBeNonInteger(cond.right) && isCount(cond.left));
    if (mixed) {
      at(
        "fractional-vs-count",
        "warning",
        "Comparing a possibly-fractional value against a count; wrap it in floor/ceil to make the intent explicit.",
      );
    }
  });

  for (const id of c.overrides) {
    if (!ctx.knownConstraintIds.has(id)) {
      at("unknown-override", "error", `overrides names an unknown constraint id "${id}".`);
    }
  }

  if (c.message) {
    const exposed = new Set(Object.keys(c.values));
    if (c.kind === "limit") {
      exposed.add("metric");
      if (c.min != null) exposed.add("min");
      if (c.max != null) exposed.add("max");
    }
    if (c.perPartition) exposed.add("partition");
    for (const node of collectNodes(c.message as JSONContent, "metricRef")) {
      const name = node.attrs?.name;
      if (typeof name !== "string" || !exposed.has(name)) {
        at(
          "unknown-metric-ref",
          "error",
          `Message references "${String(name)}", which is not a declared value.`,
        );
      }
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Traversal + static properties.
// ---------------------------------------------------------------------------

function constraintHosts(ruleset: Ruleset): Host[] {
  const out: Host[] = [];
  for (const def of Object.values(ruleset.registry.nodeDefs)) {
    if (def.constraints.length > 0)
      out.push({ kind: "nodeDef", id: def.id, constraints: def.constraints });
  }
  for (const record of Object.values(ruleset.registry.categoryRecords)) {
    if (record.constraints.length > 0) {
      out.push({ kind: "categoryRecord", id: record.id, constraints: record.constraints });
    }
  }
  for (const format of ruleset.listBuilding?.formats ?? []) {
    if (format.constraints.length > 0) {
      out.push({ kind: "format", id: format.id, constraints: format.constraints });
    }
  }
  return out;
}

/** Every metric anywhere in a constraint — bounds, values, and those inside conditions. */
function eachConstraintMetric(c: ConstraintDef, visit: (m: Metric) => void): void {
  const roots: Metric[] = Object.values(c.values);
  if (c.kind === "limit") {
    roots.push(c.metric);
    if (c.min != null) roots.push(c.min);
    if (c.max != null) roots.push(c.max);
  }
  eachConstraintCondition(c, (cond) => {
    switch (cond.op) {
      case "compare":
        roots.push(cond.left, cond.right);
        return;
      case "inSet":
      case "multipleOf":
        roots.push(cond.metric);
        return;
      default:
        return;
    }
  });
  for (const root of roots) eachMetric(root, visit);
}

function eachConstraintCondition(c: ConstraintDef, visit: (cond: Condition) => void): void {
  if (c.when) eachCondition(c.when, visit);
  if (c.kind === "require") eachCondition(c.condition, visit);
}

/** The operands a metric divides by — `divide`'s tail and `percentOf`'s whole. */
function divisorsOf(m: Metric): Metric[] {
  if (m.op === "divide") return m.operands.slice(1);
  if (m.op === "percentOf") return [m.whole];
  return [];
}

function isCount(m: Metric): boolean {
  return m.op === "count" || m.op === "distinctCount";
}

function canBeNonInteger(m: Metric): boolean {
  switch (m.op) {
    case "divide":
    case "percentOf":
      return true;
    case "constant":
      return !Number.isInteger(m.value);
    case "fieldSum":
    case "fieldMax":
    case "fieldMin":
      return true; // author fields are plain numbers
    case "add":
    case "subtract":
    case "multiply":
      return m.operands.some(canBeNonInteger);
    case "wholeSubtree":
      return canBeNonInteger(m.of);
    default:
      return false; // count, distinctCount, resourceLimit, floor/ceil/round
  }
}
