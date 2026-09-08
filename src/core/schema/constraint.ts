import * as z from "zod";
import { shortId } from "../../util/nanoid";
import { richText } from "./richText";
import { selector, type Selector } from "./selector";

/**
 * The constraint algebra. A `ConstraintDef` is either a `limit` (a computed
 * `Metric` bounded by `min` / `max`, themselves Metrics) or a `require` (a
 * `Condition` that must hold). Both share a base carrying `when` (a gate),
 * `perPartition` (evaluate once per bucket), `overrides`, author-named `values`
 * for message interpolation, and an optional rich-text `message`.
 *
 * Everything is scoped to the **subtree of the node that collected the
 * constraint** — selectors walk `effectiveChildren` deep from that root, root
 * included. Records are never instanced, so a record's constraints always
 * evaluate against the node whose `reference` field pulled them in.
 *
 * Lives in its own module (not `./listBuilding`) so it depends on nothing but
 * the two leaves `./selector` and `./richText`; `listBuilding` imports it.
 */

const ID = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

// ---------------------------------------------------------------------------
// Partition keys — how matches are bucketed, for `perPartition` and
// `distinctCount`.
// ---------------------------------------------------------------------------

/**
 * A `field` key on a `multiValue` field yields one bucket per member; on a
 * `reference` field it buckets by **record id** (stable for `expectedKeys` —
 * the record's name is resolved at message-render time).
 */
export const partitionKeySpec = z.discriminatedUnion("type", [
  z.object({ type: z.literal("nodeDefId") }),
  z.object({ type: z.literal("nodeCategory") }),
  z.object({ type: z.literal("field"), fieldId: z.string() }),
]);
export type PartitionKeySpec = z.infer<typeof partitionKeySpec>;

// ---------------------------------------------------------------------------
// Metric — anything that evaluates to a number over a candidate set.
// ---------------------------------------------------------------------------

/**
 * Hand-written tagged union: `z.infer` cannot resolve a recursive discriminated
 * union in TS 6.0.3 (same note as `./selector` and `./selection`). The recursive
 * members below annotate their getters against this, and `metric` stays a real
 * `z.discriminatedUnion` so the engine switches on `.op`.
 */
export type Metric =
  | { op: "count"; selector: Selector }
  | { op: "fieldSum" | "fieldMax" | "fieldMin"; selector: Selector; fieldId: string }
  | { op: "costSum"; selector: Selector; resourceId: string }
  | { op: "distinctCount"; selector: Selector; key: PartitionKeySpec }
  /** The effective cap for this resource; unresolvable makes the constraint inactive. */
  | { op: "resourceLimit"; resourceId: string }
  | { op: "constant"; value: number }
  | { op: "add" | "subtract" | "multiply" | "divide"; operands: Metric[] }
  /** Yields 0–100. `whole` of 0 evaluates to 0. */
  | { op: "percentOf"; part: Metric; whole: Metric }
  | { op: "floor" | "ceil" | "round"; of: Metric }
  /** Escape `perPartition` bucketing — re-evaluate `of` against the whole subtree. */
  | { op: "wholeSubtree"; of: Metric };

const arithMetric = (op: "add" | "subtract" | "multiply" | "divide") =>
  z.object({
    op: z.literal(op),
    get operands(): z.ZodType<Metric[]> {
      return z.array(metric);
    },
  });

const roundMetric = (op: "floor" | "ceil" | "round") =>
  z.object({
    op: z.literal(op),
    get of(): z.ZodType<Metric> {
      return metric;
    },
  });

export const metric: z.ZodType<Metric> = z.discriminatedUnion("op", [
  z.object({ op: z.literal("count"), selector }),
  z.object({ op: z.literal("fieldSum"), selector, fieldId: z.string() }),
  z.object({ op: z.literal("fieldMax"), selector, fieldId: z.string() }),
  z.object({ op: z.literal("fieldMin"), selector, fieldId: z.string() }),
  z.object({ op: z.literal("costSum"), selector, resourceId: z.string() }),
  z.object({ op: z.literal("distinctCount"), selector, key: partitionKeySpec }),
  z.object({ op: z.literal("resourceLimit"), resourceId: z.string() }),
  z.object({ op: z.literal("constant"), value: z.number() }),
  arithMetric("add"),
  arithMetric("subtract"),
  arithMetric("multiply"),
  arithMetric("divide"),
  z.object({
    op: z.literal("percentOf"),
    get part(): z.ZodType<Metric> {
      return metric;
    },
    get whole(): z.ZodType<Metric> {
      return metric;
    },
  }),
  roundMetric("floor"),
  roundMetric("ceil"),
  roundMetric("round"),
  z.object({
    op: z.literal("wholeSubtree"),
    get of(): z.ZodType<Metric> {
      return metric;
    },
  }),
]);

// ---------------------------------------------------------------------------
// Condition — anything that evaluates to a boolean. Depends on `Metric`, never
// the other way round, which is what keeps `nOf` (k-of-n with both bounds)
// enough to avoid mutual recursion between the two schemas.
// ---------------------------------------------------------------------------

export type Condition =
  | { op: "compare"; left: Metric; cmp: "lt" | "lte" | "eq" | "gte" | "gt"; right: Metric }
  | { op: "inSet"; metric: Metric; values: number[] }
  | { op: "multipleOf"; metric: Metric; step: number }
  | { op: "and" | "or"; conditions: Condition[] }
  | { op: "not"; condition: Condition }
  /** k-of-n: how many of `conditions` hold must fall within `min` / `max`. */
  | { op: "nOf"; conditions: Condition[]; min?: number; max?: number };

const groupCondition = (op: "and" | "or") =>
  z.object({
    op: z.literal(op),
    get conditions(): z.ZodType<Condition[]> {
      return z.array(condition);
    },
  });

export const condition: z.ZodType<Condition> = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("compare"),
    left: metric,
    cmp: z.enum(["lt", "lte", "eq", "gte", "gt"]),
    right: metric,
  }),
  z.object({ op: z.literal("inSet"), metric, values: z.array(z.number()).default([]) }),
  z.object({ op: z.literal("multipleOf"), metric, step: z.number().positive() }),
  groupCondition("and"),
  groupCondition("or"),
  z.object({
    op: z.literal("not"),
    get condition(): z.ZodType<Condition> {
      return condition;
    },
  }),
  z.object({
    op: z.literal("nOf"),
    get conditions(): z.ZodType<Condition[]> {
      return z.array(condition);
    },
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
  }),
]);

/** Depth-first walk of a condition tree, itself included. */
export function eachCondition(root: Condition, visit: (c: Condition) => void): void {
  visit(root);
  switch (root.op) {
    case "and":
    case "or":
    case "nOf":
      for (const sub of root.conditions) eachCondition(sub, visit);
      return;
    case "not":
      eachCondition(root.condition, visit);
      return;
    default:
      return;
  }
}

/** Depth-first walk of a metric tree, itself included. */
export function eachMetric(root: Metric, visit: (m: Metric) => void): void {
  visit(root);
  switch (root.op) {
    case "add":
    case "subtract":
    case "multiply":
    case "divide":
      for (const sub of root.operands) eachMetric(sub, visit);
      return;
    case "percentOf":
      eachMetric(root.part, visit);
      eachMetric(root.whole, visit);
      return;
    case "floor":
    case "ceil":
    case "round":
    case "wholeSubtree":
      eachMetric(root.of, visit);
      return;
    default:
      return;
  }
}

// ---------------------------------------------------------------------------
// ConstraintDef.
// ---------------------------------------------------------------------------

const constraintDefBase = {
  id: ID.default(shortId),
  severity: z.enum(["error", "warning"]).default("error"),
  /** Gate. Evaluated unpartitioned; false makes the constraint inactive — and its `overrides` suppress nothing. */
  when: condition.optional(),
  /**
   * Evaluate once per bucket; metrics see only that bucket's candidates unless
   * wrapped in `wholeSubtree`. `expectedKeys` forces evaluation of listed
   * buckets even when they are empty.
   *
   * Buckets are formed from **every candidate in the subtree, the root
   * included** — so keying on `nodeDefId` gives the root a bucket of its own. Key
   * on a field or category the root does not carry when that isn't wanted; a
   * `null` key drops a candidate from every bucket.
   */
  perPartition: z
    .object({ key: partitionKeySpec, expectedKeys: z.array(z.string()).optional() })
    .optional(),
  /** Ids this constraint supersedes, within this root's subtree only. */
  overrides: z.array(z.string()).default([]),
  /** Author-named metrics, resolved into the violation for `metricRef` message interpolation. */
  values: z.record(z.string(), metric).default({}),
  /** Author override; may contain `metricRef` nodes naming `values` or an auto-exposed key. */
  message: richText.optional(),
  /**
   * Set on engine-generated resource-limit constraints. Drives idempotent
   * regeneration by `syncResourceConstraints` and the distinct
   * `resource-over-cap` violation code.
   */
  generatedFor: z.object({ resourceId: z.string() }).optional(),
};

const limitConstraint = z.object({
  ...constraintDefBase,
  kind: z.literal("limit"),
  metric,
  min: metric.optional(),
  max: metric.optional(),
});

const requireConstraint = z.object({
  ...constraintDefBase,
  kind: z.literal("require"),
  condition,
});

/**
 * A single top-level `.superRefine` carries both cross-field rules — a
 * per-member `.refine` would make the member a `ZodEffects` and break
 * `discriminatedUnion` (the same reason the old `countLimit` check lived here).
 */
export const constraintDef = z
  .discriminatedUnion("kind", [limitConstraint, requireConstraint])
  .superRefine((c, ctx) => {
    if (c.kind === "limit" && c.min == null && c.max == null) {
      ctx.addIssue({ code: "custom", message: "limit requires at least one of min / max" });
    }
    const roots: Condition[] = [];
    if (c.when) roots.push(c.when);
    if (c.kind === "require") roots.push(c.condition);
    for (const root of roots) {
      eachCondition(root, (cond) => {
        if (cond.op === "nOf" && cond.min == null && cond.max == null) {
          ctx.addIssue({ code: "custom", message: "nOf requires at least one of min / max" });
        }
      });
    }
  });

export type ConstraintDef = z.infer<typeof constraintDef>;
export type LimitConstraint = Extract<ConstraintDef, { kind: "limit" }>;
export type RequireConstraint = Extract<ConstraintDef, { kind: "require" }>;
export type ConstraintPartition = NonNullable<ConstraintDef["perPartition"]>;
