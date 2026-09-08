import type { JSONContent } from "@tiptap/core";
import type { ConstraintDef } from "../schema/constraint";
import type { FormatDef, NodeDef } from "../schema/listBuilding";
import type { InstanceSelection } from "../schema/selection";
import type { Ruleset } from "../schema/ruleset";
import type { FieldValue } from "../schema/selector";
import type { List } from "../schema/list";
import { type Candidate, type EvalCtx, flattenSubtree } from "./candidates";
import { computeListCost } from "./cost";
import {
  effectiveCap,
  evaluateCondition,
  evaluateMetric,
  type MetricCtx,
  partitionKeyFn,
} from "./metric";
import { effectiveChildren, effectiveFields, findFieldDef, resolveReference } from "./resolve";
import { partitionCandidates } from "./selectorEval";

export interface Issue {
  code: string;
  message: string;
  /** `instanceId` of the node the issue is anchored to, when applicable. */
  path?: string;
  /** The `ConstraintDef` that produced this, when one did. */
  constraintId?: string;
  /** The `perPartition` bucket this violation belongs to, when partitioned. */
  partitionKey?: string;
  /**
   * Resolved placeholders for message rendering. A `limit` auto-exposes
   * `metric` / `min` / `max`, `perPartition` auto-exposes `partition`, and the
   * constraint's own `values` merge on top.
   */
  values?: Record<string, number | string>;
}

export interface ValidationResult {
  errors: Issue[];
  warnings: Issue[];
}

/** One constraint queued for evaluation against a specific root subtree. */
interface ConstraintTask {
  constraint: ConstraintDef;
  subject: string;
  anchorPath: string | undefined;
  /** The root's subtree, root included — the candidate set every selector sees. */
  candidates: Candidate[];
  /** This task's own position, for deciding whether another task's `overrides` reach it. */
  at: number;
  /** The range this task's own `overrides` reach: `[from, to)`. */
  from: number;
  to: number;
}

interface RunEnv {
  ruleset: Ruleset;
  list: List;
  format: FormatDef | undefined;
  evalCtx: EvalCtx;
}

/**
 * List validator. Checks, in order:
 *
 * 1. resource caps — but **only for a list with no `formatId`**; with a format
 *    present its generated `limit` constraints are authoritative, so deleting
 *    one genuinely means "no cap";
 * 2. every constraint that applies — each `NodeDef`'s own, the `constraints` on
 *    every `CategoryRecord` a node's `reference` fields point at (collected
 *    transitively), and `FormatDef.constraints` — gated by `when`, bucketed by
 *    `perPartition`, with `overrides` resolved within the overriding
 *    constraint's own root subtree;
 * 3. `ChildSlotDef` and `OptionDef` `min` / `max` occupancy.
 *
 * A constraint whose `when`, metric or bound cannot be computed (an
 * unresolvable `resourceLimit`) is inactive — no violations, and its
 * `overrides` suppress nothing. Pure; the caller decides when to run it.
 */
export function validateList(list: List, ruleset: Ruleset): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const nodeDefs = ruleset.registry.nodeDefs;
  const evalCtx: EvalCtx = { nodeDefs, ruleset };
  const lb = ruleset.listBuilding;
  const format = lb?.formats.find((f) => f.id === list.formatId);
  const env: RunEnv = { ruleset, list, format, evalCtx };

  const emit = (severity: "error" | "warning", issues: Issue[]): void => {
    (severity === "error" ? errors : warnings).push(...issues);
  };

  // 1. Resource caps, only where no format carries generated constraints.
  if (!list.formatId) {
    const spend = computeListCost(list, ruleset);
    for (const resource of lb?.resources ?? []) {
      const cap = effectiveCap(resource, undefined, list);
      const spent = spend[resource.id] ?? 0;
      if (cap != null && spent > cap) {
        errors.push({
          code: "resource-over-cap",
          message: `${resource.name || resource.id}: ${spent} exceeds cap of ${cap}`,
        });
      }
    }
  }

  // 2/3. One flatten of the whole list feeds every task: each node's subtree is
  //      the contiguous slice `[index, subtreeEnd)`, root included.
  const all = flattenSubtree(list.root ? [list.root] : [], evalCtx);
  const tasks: ConstraintTask[] = [];

  for (const cand of all) {
    if (cand.entry.kind !== "instance") continue;
    const instance = cand.entry;
    const def = nodeDefs[instance.defId];
    if (!def) continue;
    const subject = def.name || instance.defId;
    const candidates = all.slice(cand.index, cand.subtreeEnd);

    for (const constraint of [...def.constraints, ...collectRecordConstraints(instance, ruleset)]) {
      tasks.push({
        constraint,
        subject,
        anchorPath: instance.instanceId,
        candidates,
        at: cand.index,
        from: cand.index,
        to: cand.subtreeEnd,
      });
    }

    errors.push(...checkSlots(instance, def, nodeDefs, subject));
    errors.push(...checkOptions(instance, def, subject));
  }

  // Format tasks sit outside the tree: `at: -1` puts them beyond the reach of
  // any node's range, while their own range spans everything.
  for (const constraint of format?.constraints ?? []) {
    tasks.push({
      constraint,
      subject: format?.name || "format",
      anchorPath: undefined,
      candidates: all,
      at: -1,
      from: -1,
      to: all.length,
    });
  }

  // `when` first — an inactive constraint contributes no overrides.
  const active = tasks.filter((task) => {
    const when = task.constraint.when;
    if (!when) return true;
    return evaluateCondition(when, metricCtx(task, task.candidates, env)) === true;
  });

  for (const task of active) {
    const suppressed = active.some(
      (other) =>
        other !== task &&
        other.constraint.overrides.includes(task.constraint.id) &&
        other.from <= task.at &&
        task.at < other.to,
    );
    if (suppressed) continue;
    emit(task.constraint.severity, runConstraint(task, env));
  }

  return { errors, warnings };
}

function metricCtx(task: ConstraintTask, scope: Candidate[], env: RunEnv): MetricCtx {
  return { ...env, all: task.candidates, scope };
}

function runConstraint(task: ConstraintTask, env: RunEnv): Issue[] {
  const issues: Issue[] = [];
  for (const bucket of bucketsFor(task, env)) {
    issues.push(...evaluateInBucket(task, bucket.key, metricCtx(task, bucket.scope, env)));
  }
  return issues;
}

/** One bucket per `perPartition` key (plus unobserved `expectedKeys`), or a single whole-subtree bucket. */
function bucketsFor(
  task: ConstraintTask,
  env: RunEnv,
): Array<{ key: string | null; scope: Candidate[] }> {
  const partition = task.constraint.perPartition;
  if (!partition) return [{ key: null, scope: task.candidates }];

  const grouped = partitionCandidates(task.candidates, partitionKeyFn(partition.key, env.ruleset));
  const out = [...grouped].map(([key, scope]) => ({ key, scope }));
  for (const key of partition.expectedKeys ?? []) {
    if (!grouped.has(key)) out.push({ key, scope: [] });
  }
  return out;
}

function evaluateInBucket(
  task: ConstraintTask,
  partitionKey: string | null,
  ctx: MetricCtx,
): Issue[] {
  const c = task.constraint;
  const values: Record<string, number | string> = {};
  if (partitionKey !== null) values.partition = partitionKey;
  for (const [name, m] of Object.entries(c.values)) {
    const v = evaluateMetric(m, ctx);
    if (v != null) values[name] = v;
  }

  const where = partitionKey === null ? "" : ` [${partitionKey}]`;
  const issue = (code: string, fallback: string): Issue => ({
    code,
    message: c.message ? renderMessage(c.message, values) : fallback,
    path: task.anchorPath,
    constraintId: c.id,
    ...(partitionKey !== null ? { partitionKey } : {}),
    values: { ...values },
  });

  if (c.kind === "require") {
    return evaluateCondition(c.condition, ctx) === false
      ? [issue("require-unmet", `${task.subject}${where}: requirement not met`)]
      : [];
  }

  const value = evaluateMetric(c.metric, ctx);
  if (value == null) return [];
  values.metric = value;

  // Resolve both bounds before emitting, so every issue carries the full set.
  let min: number | null = null;
  if (c.min != null) {
    min = evaluateMetric(c.min, ctx);
    if (min == null) return [];
    values.min = min;
  }
  let max: number | null = null;
  if (c.max != null) {
    max = evaluateMetric(c.max, ctx);
    if (max == null) return [];
    values.max = max;
  }

  const issues: Issue[] = [];
  if (min != null && value < min) {
    issues.push(
      issue("limit-below-min", `${task.subject}${where}: expected at least ${min}, found ${value}`),
    );
  }
  if (max != null && value > max) {
    const generated = c.generatedFor;
    if (generated) {
      const resource = ctx.ruleset.listBuilding?.resources.find(
        (r) => r.id === generated.resourceId,
      );
      const name = resource?.name || generated.resourceId;
      issues.push(issue("resource-over-cap", `${name}: ${value} exceeds cap of ${max}`));
    } else {
      issues.push(
        issue(
          "limit-above-max",
          `${task.subject}${where}: expected at most ${max}, found ${value}`,
        ),
      );
    }
  }
  return issues;
}

/**
 * Flatten an author's rich-text message, substituting `metricRef` nodes with
 * their resolved value. A ref naming something absent renders empty — the
 * design-time lint is what catches that.
 */
function renderMessage(doc: JSONContent, values: Record<string, number | string>): string {
  let out = "";
  const walk = (node: JSONContent): void => {
    if (node.type === "text" && node.text) out += node.text;
    if (node.type === "metricRef") {
      const name = node.attrs?.name;
      const v = typeof name === "string" ? values[name] : undefined;
      if (v !== undefined) out += String(v);
    }
    node.content?.forEach(walk);
  };
  walk(doc);
  return out.trim();
}

/**
 * Constraints contributed by the `CategoryRecord`s an instance's `reference`
 * fields point at, collected transitively through `reference` fields on the
 * records themselves (Subfaction → Faction stacking). Cycle-guarded.
 */
function collectRecordConstraints(instance: InstanceSelection, ruleset: Ruleset): ConstraintDef[] {
  if (!ruleset.listBuilding) return [];
  const out: ConstraintDef[] = [];
  const seen = new Set<string>();

  const visit = (values: Record<string, FieldValue>): void => {
    for (const [fieldId, value] of Object.entries(values)) {
      if (findFieldDef(fieldId, ruleset)?.type !== "reference") continue;
      for (const record of resolveReference(value, ruleset)) {
        if (seen.has(record.id)) continue;
        seen.add(record.id);
        out.push(...record.constraints);
        visit(record.values);
      }
    }
  };

  visit(effectiveFields(instance, ruleset.registry.nodeDefs, ruleset));
  return out;
}

/** `ChildSlotDef` occupancy (grouped + individuated) must fall within `min`/`max`. */
function checkSlots(
  instance: InstanceSelection,
  def: NodeDef,
  nodeDefs: Record<string, NodeDef>,
  subject: string,
): Issue[] {
  if (def.childSlots.length === 0) return [];
  const kids = effectiveChildren(instance, nodeDefs);
  const issues: Issue[] = [];
  for (const slot of def.childSlots) {
    const occ = kids
      .filter((c) => c.slotId === slot.id)
      .reduce((n, c) => n + (c.kind === "group" ? c.count : 1), 0);
    const where = slot.name || slot.id;
    if (occ < slot.min) {
      issues.push({
        code: "slot-below-min",
        message: `${subject} / ${where}: needs at least ${slot.min}, has ${occ}`,
        path: instance.instanceId,
      });
    }
    if (slot.max != null && occ > slot.max) {
      issues.push({
        code: "slot-above-max",
        message: `${subject} / ${where}: allows at most ${slot.max}, has ${occ}`,
        path: instance.instanceId,
      });
    }
  }
  return issues;
}

/**
 * `OptionDef` application counts must fall within `min`/`max`. `min` is a
 * per-instance aggregate; `max` is checked per distinct `targetInstanceId` when
 * any applied entry carries one, else per instance.
 */
function checkOptions(instance: InstanceSelection, def: NodeDef, subject: string): Issue[] {
  if (def.options.length === 0) return [];
  const issues: Issue[] = [];
  for (const opt of def.options) {
    const applied = instance.appliedOptions.filter((a) => a.optionId === opt.id);
    const total = applied.length;
    const name = opt.name || opt.id;

    if (opt.min > 0 && total < opt.min) {
      issues.push({
        code: "option-below-min",
        message: `${subject} / ${name}: must be taken at least ${opt.min}, taken ${total}`,
        path: instance.instanceId,
      });
    }

    if (opt.max == null) continue;
    if (applied.some((a) => a.targetInstanceId != null)) {
      const perTarget = new Map<string, number>();
      for (const a of applied) {
        const k = a.targetInstanceId ?? "*";
        perTarget.set(k, (perTarget.get(k) ?? 0) + 1);
      }
      for (const [k, n] of perTarget) {
        if (n > opt.max) {
          issues.push({
            code: "option-above-max",
            message: `${subject} / ${name}: allows at most ${opt.max} per target, ${k} has ${n}`,
            path: instance.instanceId,
          });
        }
      }
    } else if (total > opt.max) {
      issues.push({
        code: "option-above-max",
        message: `${subject} / ${name}: allows at most ${opt.max}, taken ${total}`,
        path: instance.instanceId,
      });
    }
  }
  return issues;
}
