import * as z from "zod";

/**
 * `Selector` — the one generic "which nodes/options does this apply to?"
 * expression, reused across slot eligibility, constraint scope, and option
 * cost filters. Evaluated against a subtree it walks every descendant at any
 * depth (not just direct children); see `core/engine/selectorEval.ts`.
 *
 * New matching power is added as a new variant here, never as a parallel
 * mechanism.
 */

/** A field's stored value. `multiValue` fields hold `string[]`; the rest scalars. */
export const fieldValue = z.union([z.string(), z.number(), z.boolean(), z.array(z.string())]);

export type FieldValue = z.infer<typeof fieldValue>;

const selectorAll = z.object({ type: z.literal("all") });

const selectorNodeDefId = z.object({
  type: z.literal("nodeDefId"),
  ids: z.array(z.string()).default([]),
});

/** Matches any node whose `NodeDef.categoryId` equals `categoryId`. */
const selectorNodeCategory = z.object({
  type: z.literal("nodeCategory"),
  categoryId: z.string(),
});

const selectorFieldEquals = z.object({
  type: z.literal("fieldEquals"),
  fieldId: z.string(),
  value: fieldValue,
});

/** `multiValue` field contains `value`. */
const selectorFieldIncludes = z.object({
  type: z.literal("fieldIncludes"),
  fieldId: z.string(),
  value: z.string(),
});

const selectorFieldCompare = z.object({
  type: z.literal("fieldCompare"),
  fieldId: z.string(),
  op: z.enum(["gt", "gte", "lt", "lte"]),
  value: z.number(),
});

/**
 * Matches an *instance* that has this option applied. A `GroupedSelection` can
 * never match this — groups have applied nothing by construction.
 */
const selectorOptionTaken = z.object({
  type: z.literal("optionTaken"),
  optionId: z.string(),
});

/**
 * Hand-written tagged union. `z.infer<typeof selector>` cannot resolve for a
 * recursive discriminated union in TS 6.0.3 (a 9-member recursive union is
 * heavier than `structureNode`'s single self-array), so the recursive members
 * below annotate their getter return type against this and `selector` stays a
 * real `z.discriminatedUnion` — the engine still switches on `.type`.
 */
export type Selector =
  | { type: "all" }
  | { type: "nodeDefId"; ids: string[] }
  | { type: "nodeCategory"; categoryId: string }
  | { type: "fieldEquals"; fieldId: string; value: FieldValue }
  | { type: "fieldIncludes"; fieldId: string; value: string }
  | { type: "fieldCompare"; fieldId: string; op: "gt" | "gte" | "lt" | "lte"; value: number }
  | { type: "optionTaken"; optionId: string }
  | { type: "not"; selector: Selector }
  | { type: "and"; selectors: Selector[] }
  | { type: "or"; selectors: Selector[] };

// Recursive members: declared before `selector` and referencing it through a
// getter, so the forward `const` reference resolves lazily at parse time
// (same pattern as `structureNode` in ./ruleset.ts).
const selectorNot = z.object({
  type: z.literal("not"),
  get selector(): z.ZodType<Selector> {
    return selector;
  },
});

const selectorAnd = z.object({
  type: z.literal("and"),
  get selectors(): z.ZodType<Selector[]> {
    return z.array(selector);
  },
});

const selectorOr = z.object({
  type: z.literal("or"),
  get selectors(): z.ZodType<Selector[]> {
    return z.array(selector);
  },
});

export const selector: z.ZodType<Selector> = z.discriminatedUnion("type", [
  selectorAll,
  selectorNodeDefId,
  selectorNodeCategory,
  selectorFieldEquals,
  selectorFieldIncludes,
  selectorFieldCompare,
  selectorOptionTaken,
  selectorNot,
  selectorAnd,
  selectorOr,
  // future: { type: "withinSlot"; slotId } — match only through a specific slot
  // path. Appending a member here is backward-compatible (no old data uses it).
]);
