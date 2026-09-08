import type { Condition, Metric, PartitionKeySpec } from "../schema/constraint";
import type { FormatDef, ResourceDef } from "../schema/listBuilding";
import type { List } from "../schema/list";
import type { Ruleset } from "../schema/ruleset";
import { assertNever } from "./assertNever";
import { type Candidate, type EvalCtx, sumOwnCost } from "./candidates";
import { findFieldDef } from "./resolve";
import type { PartitionKey } from "./selectorEval";
import { matchesSelector } from "./selectorMatch";

/**
 * `Metric` / `Condition` evaluation over a flattened candidate set.
 *
 * **`null` means "cannot be computed"** — it comes from an unresolvable
 * `resourceLimit` (a resource with no effective cap, or no such resource) and
 * propagates through every operator, including `and` / `or`. A constraint whose
 * `when`, bound, or condition evaluates `null` is *inactive*: no violation, and
 * its `overrides` suppress nothing. Propagating unconditionally rather than
 * short-circuiting keeps the rule simple — never report a violation you could
 * not fully compute.
 */
export interface MetricCtx {
  ruleset: Ruleset;
  list: List;
  format: FormatDef | undefined;
  /** The whole root subtree, indexed by `Candidate.index`. What `wholeSubtree` restores. */
  all: Candidate[];
  /** The active set: `all`, or one `perPartition` bucket's members. */
  scope: Candidate[];
  evalCtx: EvalCtx;
}

export function evaluateMetric(m: Metric, ctx: MetricCtx): number | null {
  switch (m.op) {
    case "constant":
      return m.value;

    case "count": {
      let total = 0;
      for (const cand of ctx.scope) if (matchesSelector(m.selector, cand)) total += cand.count;
      return total;
    }

    case "fieldSum": {
      let total = 0;
      for (const cand of ctx.scope) {
        if (!matchesSelector(m.selector, cand)) continue;
        const v = cand.fields[m.fieldId];
        if (typeof v === "number") total += v * cand.count;
      }
      return total;
    }

    case "fieldMax":
    case "fieldMin": {
      // Count-independent: five identical models have one Strength, not five.
      const values: number[] = [];
      for (const cand of ctx.scope) {
        if (!matchesSelector(m.selector, cand)) continue;
        const v = cand.fields[m.fieldId];
        if (typeof v === "number") values.push(v);
      }
      if (values.length === 0) return 0; // aggregates over an empty set are 0
      return m.op === "fieldMax" ? Math.max(...values) : Math.min(...values);
    }

    case "costSum": {
      // Each match contributes its whole subtree; a match already inside an
      // earlier one is skipped, so nested matches never double-count. Depth-first
      // ranges are properly nested or disjoint, which is what makes this work.
      const matched = ctx.scope
        .filter((c) => matchesSelector(m.selector, c))
        .sort((a, b) => a.index - b.index);
      let total = 0;
      let coveredUntil = -1;
      for (const cand of matched) {
        if (cand.index < coveredUntil) continue;
        total += sumOwnCost(ctx.all, m.resourceId, cand.index, cand.subtreeEnd);
        coveredUntil = cand.subtreeEnd;
      }
      return total;
    }

    case "distinctCount": {
      const keyOf = partitionKeyFn(m.key, ctx.ruleset);
      const seen = new Set<string>();
      for (const cand of ctx.scope) {
        if (!matchesSelector(m.selector, cand)) continue;
        for (const key of keysOf(keyOf, cand)) seen.add(key);
      }
      return seen.size;
    }

    case "resourceLimit": {
      const resource = ctx.ruleset.listBuilding?.resources.find((r) => r.id === m.resourceId);
      if (!resource) return null;
      return effectiveCap(resource, ctx.format, ctx.list);
    }

    case "add":
    case "subtract":
    case "multiply":
    case "divide": {
      const operands: number[] = [];
      for (const operand of m.operands) {
        const v = evaluateMetric(operand, ctx);
        if (v == null) return null;
        operands.push(v);
      }
      return fold(m.op, operands);
    }

    case "percentOf": {
      const part = evaluateMetric(m.part, ctx);
      const whole = evaluateMetric(m.whole, ctx);
      if (part == null || whole == null) return null;
      return whole === 0 ? 0 : (part / whole) * 100;
    }

    case "floor":
    case "ceil":
    case "round": {
      const v = evaluateMetric(m.of, ctx);
      if (v == null) return null;
      return m.op === "floor" ? Math.floor(v) : m.op === "ceil" ? Math.ceil(v) : Math.round(v);
    }

    case "wholeSubtree":
      return evaluateMetric(m.of, { ...ctx, scope: ctx.all });

    default:
      return assertNever(m);
  }
}

export function evaluateCondition(c: Condition, ctx: MetricCtx): boolean | null {
  switch (c.op) {
    case "compare": {
      const left = evaluateMetric(c.left, ctx);
      const right = evaluateMetric(c.right, ctx);
      if (left == null || right == null) return null;
      switch (c.cmp) {
        case "lt":
          return left < right;
        case "lte":
          return left <= right;
        case "eq":
          return left === right;
        case "gte":
          return left >= right;
        case "gt":
          return left > right;
        default:
          return assertNever(c.cmp);
      }
    }

    case "inSet": {
      const v = evaluateMetric(c.metric, ctx);
      return v == null ? null : c.values.includes(v);
    }

    case "multipleOf": {
      const v = evaluateMetric(c.metric, ctx);
      if (v == null) return null;
      const ratio = v / c.step;
      return Math.abs(ratio - Math.round(ratio)) < 1e-9;
    }

    case "and":
    case "or": {
      const results: boolean[] = [];
      for (const sub of c.conditions) {
        const r = evaluateCondition(sub, ctx);
        if (r == null) return null;
        results.push(r);
      }
      return c.op === "and" ? results.every(Boolean) : results.some(Boolean);
    }

    case "not": {
      const r = evaluateCondition(c.condition, ctx);
      return r == null ? null : !r;
    }

    case "nOf": {
      let held = 0;
      for (const sub of c.conditions) {
        const r = evaluateCondition(sub, ctx);
        if (r == null) return null;
        if (r) held += 1;
      }
      if (c.min != null && held < c.min) return false;
      if (c.max != null && held > c.max) return false;
      return true;
    }

    default:
      return assertNever(c);
  }
}

/**
 * Build the bucketing function for a `PartitionKeySpec`. A `multiValue` field
 * yields one key per member; a `reference` field buckets by record id.
 */
export function partitionKeyFn(spec: PartitionKeySpec, ruleset: Ruleset | undefined): PartitionKey {
  switch (spec.type) {
    case "nodeDefId":
      return (cand) => cand.defId;
    case "nodeCategory":
      return (cand) => cand.categoryId ?? null;
    case "field": {
      const { fieldId } = spec;
      const isMulti = ruleset ? findFieldDef(fieldId, ruleset)?.type === "multiValue" : false;
      return (cand) => {
        const v = cand.fields[fieldId];
        if (v == null) return null;
        if (Array.isArray(v)) return v.map((x) => String(x));
        return isMulti ? [String(v)] : String(v);
      };
    }
    default:
      return assertNever(spec);
  }
}

/**
 * The cap in force for a resource. A player's `list.resourceCaps` entry applies
 * **only** to a `playerChosen` resource — a format cap or a `fixed` resource cap
 * is authoritative and cannot be raised. `null` = uncapped.
 */
export function effectiveCap(
  resource: ResourceDef,
  format: FormatDef | undefined,
  list: List,
): number | null {
  const formatCap = format?.resourceCaps[resource.id];
  switch (resource.cap.type) {
    case "playerChosen": {
      const override = list.resourceCaps[resource.id];
      if (typeof override === "number") return override;
      return typeof formatCap === "number" ? formatCap : null;
    }
    case "fixed":
      return typeof formatCap === "number" ? formatCap : resource.cap.value;
    case "none":
      return typeof formatCap === "number" ? formatCap : null;
    default:
      return assertNever(resource.cap);
  }
}

function keysOf(keyOf: PartitionKey, cand: Candidate): string[] {
  const raw = keyOf(cand);
  return raw == null ? [] : Array.isArray(raw) ? raw : [raw];
}

function fold(op: "add" | "subtract" | "multiply" | "divide", operands: number[]): number {
  const [first, ...rest] = operands;
  if (first === undefined) return 0;
  switch (op) {
    case "add":
      return operands.reduce((a, b) => a + b, 0);
    case "subtract":
      return rest.reduce((a, b) => a - b, first);
    case "multiply":
      return operands.reduce((a, b) => a * b, 1);
    case "divide":
      // Division by zero yields 0 rather than Infinity/NaN, so a constraint
      // never depends on a non-finite bound.
      return rest.reduce((a, b) => (b === 0 ? 0 : a / b), first);
    default:
      return assertNever(op);
  }
}
