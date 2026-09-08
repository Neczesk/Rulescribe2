import * as z from "zod";
import { shortId } from "../../util/nanoid";
import { constraintDef } from "./constraint";
import { fieldValue, selector } from "./selector";

/**
 * The rules-agnostic list-building model. Everything a player can select is a
 * `NodeDef` — a platoon, a team, a detachment, a model, the army list itself.
 * Nesting (`childSlots`) and cost (`baseCosts` / option `cost`) are the only
 * things that vary between games; the engine understands no game-specific
 * concepts (faction, unit type, force org) — those fall out of author-defined
 * `fields`, `childSlots`, and `constraints`.
 *
 * - **Options** describe what a node can do to its own instance.
 * - **Constraints** describe what's allowed elsewhere in that node's *own
 *   descendant subtree* — never siblings, never ancestors. Their algebra lives
 *   in `./constraint`, re-exported here for the three schemas that embed it.
 */

export {
  condition,
  constraintDef,
  metric,
  partitionKeySpec,
  type Condition,
  type ConstraintDef,
  type ConstraintPartition,
  type LimitConstraint,
  type Metric,
  type PartitionKeySpec,
  type RequireConstraint,
} from "./constraint";

const ID = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

// ---------------------------------------------------------------------------
// Resources — Points, Command Points, Detachment Points, … (plural by design).
// ---------------------------------------------------------------------------

const fixedCap = z.object({
  type: z.literal("fixed"),
  value: z.number().int().nonnegative().default(0),
});
const playerChosenCap = z.object({ type: z.literal("playerChosen") });
const noneCap = z.object({ type: z.literal("none") });

export const resourceCap = z.discriminatedUnion("type", [fixedCap, playerChosenCap, noneCap]);
export type ResourceCap = z.infer<typeof resourceCap>;

export const resourceDef = z.object({
  id: ID.default(shortId),
  name: z.string().default(""),
  cap: resourceCap.default({ type: "none" }),
});
export type ResourceDef = z.infer<typeof resourceDef>;

// ---------------------------------------------------------------------------
// Fields — the author-defined "what a node has" schema. No built-in notion of
// characteristics; `optionSource: "keywordRegistry"` reuses the keyword
// registry (and its rich-text definitions) for a field's allowed values.
// ---------------------------------------------------------------------------

export const fieldDef = z.object({
  id: ID.default(shortId),
  name: z.string().default(""),
  type: z
    .enum([
      "number",
      "boolean",
      "text",
      "singleValue",
      "multiValue",
      "reference",
      "articleReference",
    ])
    .default("text"),
  optionSource: z.enum(["freeform", "keywordRegistry"]).optional(),
  /** Freeform strings, or keyword ids when `optionSource === "keywordRegistry"`. */
  options: z.array(z.string()).default([]),
  /** `reference` only: restrict values to `CategoryRecord`s of this `CategoryDef`. */
  categoryId: z.string().optional(),
  /** `reference` / `articleReference`: allow more than one (value becomes `string[]`). */
  multiple: z.boolean().optional(),
  /** Player may change this field's value on an instance. Enforced by `listEngine.setFieldValue`. */
  editableByPlayer: z.boolean().optional(),
  /**
   * Copied from the parent instance's resolved value for the same field id when
   * this node is placed as a child — denormalized by `listEngine.addChild` at
   * add-time. Only safe for values that never need to change after the node
   * (and its subtree) exist.
   */
  inherited: z.boolean().optional(),
});
export type FieldDef = z.infer<typeof fieldDef>;

// ---------------------------------------------------------------------------
// Cost expressions.
// ---------------------------------------------------------------------------

const flatCost = z.object({
  type: z.literal("flat"),
  resourceId: z.string(),
  /** Negative = refund; no special case needed. */
  amount: z.number().default(0),
});

/**
 * Scales with however many children currently occupy `slotId` (optionally
 * filtered). This is what makes "remove Green for 2pts per model" work: the
 * option lives on the Unit, `slotId` points at the Unit's own Models slot.
 */
const perChildCost = z.object({
  type: z.literal("perChild"),
  resourceId: z.string(),
  amountPerUnit: z.number().default(0),
  slotId: z.string(),
  filter: selector.optional(),
});

export const costExpr = z.discriminatedUnion("type", [flatCost, perChildCost]);
export type CostExpr = z.infer<typeof costExpr>;

// ---------------------------------------------------------------------------
// Child slots — structural composition. What's present by default and what may
// fill a slot.
// ---------------------------------------------------------------------------

export const childSlotDef = z.object({
  id: ID.default(shortId),
  name: z.string().default(""),
  min: z.number().int().nonnegative().default(0),
  max: z.number().int().nonnegative().nullable().default(null),
  /** Which `NodeDef`s may fill this slot. */
  eligibility: selector.default({ type: "all" }),
  /** e.g. a Platoon starts with 3 Rifle Teams. */
  defaults: z
    .array(z.object({ nodeId: z.string(), count: z.number().int().nonnegative().default(1) }))
    .default([]),
});
export type ChildSlotDef = z.infer<typeof childSlotDef>;

// ---------------------------------------------------------------------------
// Options — player-facing actions applied to a node instance. Additive,
// subtractive, or substitutive; each independently costed.
// ---------------------------------------------------------------------------

const optionDefBase = {
  id: ID.default(shortId),
  name: z.string().default(""),
  /** 0 = optional. */
  min: z.number().int().nonnegative().default(0),
  /** Times this option can be taken; null = unbounded. */
  max: z.number().int().nonnegative().nullable().default(null),
  cost: costExpr.default({ type: "flat", resourceId: "", amount: 0 }),
  // TODO scope: whether min/max is per-instance (current assumption) or
  // per-parent-scope has not been stress-tested against a real ruleset.
};

const addChildOption = z.object({
  ...optionDefBase,
  kind: z.literal("addChild"),
  slotId: z.string(),
  addNodeId: z.string(),
});

const removeChildOption = z.object({
  ...optionDefBase,
  kind: z.literal("removeChild"),
  slotId: z.string(),
  removeNodeId: z.string(),
});

const replaceChildOption = z.object({
  ...optionDefBase,
  kind: z.literal("replaceChild"),
  slotId: z.string(),
  addNodeId: z.string(),
  removeNodeId: z.string(),
});

const toggleFieldValueOption = z.object({
  ...optionDefBase,
  kind: z.literal("toggleFieldValue"),
  fieldId: z.string(),
  fieldValue: fieldValue,
  direction: z.enum(["add", "remove"]),
});

export const optionDef = z.discriminatedUnion("kind", [
  addChildOption,
  removeChildOption,
  replaceChildOption,
  toggleFieldValueOption,
]);
export type OptionDef = z.infer<typeof optionDef>;

// ---------------------------------------------------------------------------
// Categories — reusable field schemas. A `CategoryDef` names a set of
// `FieldDef`s that pure data records (`CategoryRecord`, e.g. a Faction) or
// `NodeDef`s (via `NodeDef.categoryId`, e.g. every Weapon) can conform to.
// ---------------------------------------------------------------------------

/**
 * Purely organizational display metadata — groups related `FieldDef`s (e.g. a
 * profile block: Mv, S, WS, BS, …) so the authoring UI can render them as one
 * compact unit. Nothing in the engine (Selectors, constraints, cost) operates
 * above individual field ids, so this is additive with no validation ripple.
 */
export const fieldGroupDef = z.object({
  id: ID.default(shortId),
  name: z.string().default(""),
  /** Ordered; reference this Category's own `FieldDef` ids. A field belongs to at most one group. */
  fieldIds: z.array(z.string()).default([]),
  /** Authoring-UI rendering hint. */
  layout: z.enum(["row", "stacked"]).default("stacked"),
});
export type FieldGroupDef = z.infer<typeof fieldGroupDef>;

export const categoryDef = z.object({
  id: ID.default(shortId),
  name: z.string().default(""),
  /**
   * Whether instances of this category are `NodeDef`s (a cost, slots, options —
   * things a player selects) or pure-data `CategoryRecord`s (fields only). Both
   * kinds are just a named field schema; this only drives how the authoring UI
   * groups and lists them. Authored, not inferred from usage.
   */
  kind: z.enum(["node", "record"]).default("node"),
  /** Free text shown to co-authors and wherever the category is surfaced to players. */
  description: z.string().default(""),
  fields: z.array(fieldDef).default([]),
  /** Optional grouping of `fields` for the authoring UI; ungrouped fields render individually. */
  fieldGroups: z.array(fieldGroupDef).default([]),
  /**
   * Constraints that apply to every instance of this category, wherever it lands
   * in a list — the ones an author would otherwise repeat on each `NodeDef`.
   * The engine does not expand these onto instances yet; the authoring UI just
   * stores them.
   */
  constraints: z.array(constraintDef).default([]),
});
export type CategoryDef = z.infer<typeof categoryDef>;

export const categoryRecord = z.object({
  id: ID.default(shortId),
  /** Display name — the table's name column. The engine falls back to `id` where this is blank. */
  name: z.string().default(""),
  /** Which `CategoryDef` this instantiates. */
  categoryId: z.string(),
  values: z.record(z.string(), fieldValue).default({}),
  /**
   * Rules contributed by this record when it is referenced by a node's
   * `reference` field. `validateList` collects these (transitively, through
   * `reference` fields on the record itself) and evaluates them against the
   * referencing node's subtree.
   */
  constraints: z.array(constraintDef).default([]),
});
export type CategoryRecord = z.infer<typeof categoryRecord>;

// ---------------------------------------------------------------------------
// NodeDef — the universal building block.
// ---------------------------------------------------------------------------

export const nodeDef = z.object({
  id: ID.default(shortId),
  name: z.string().default(""),
  /** Which `CategoryDef`'s field schema this conforms to (authoring aid only). */
  categoryId: z.string().optional(),
  /** Characteristics, if any — shape is entirely author-configured. */
  fields: z.record(z.string(), fieldValue).default({}),
  /** resourceId -> cost when this node is selected. */
  baseCosts: z.record(z.string(), z.number()).default({}),
  /** Structural: what can exist inside. */
  childSlots: z.array(childSlotDef).default([]),
  /** Operational: what a player can do to an instance. */
  options: z.array(optionDef).default([]),
  /** Scoped to this node's own descendant subtree. */
  constraints: z.array(constraintDef).default([]),
});
export type NodeDef = z.infer<typeof nodeDef>;

// ---------------------------------------------------------------------------
// Formats. Force organization is not a built-in concept — a format restricting
// which detachments are legal is an ordinary `countLimit` + `nodeCategory` /
// `not` Selector composition in `constraints`, not a bespoke allow-list.
// ---------------------------------------------------------------------------

export const formatDef = z.object({
  id: ID.default(shortId),
  name: z.string().default(""),
  /** resourceId -> cap for this format. */
  resourceCaps: z.record(z.string(), z.number()).default({}),
  /** Rules evaluated against the whole list; same downward-only semantics. */
  constraints: z.array(constraintDef).default([]),
});
export type FormatDef = z.infer<typeof formatDef>;

// ---------------------------------------------------------------------------
// The `ruleset.listBuilding` block. Constraints and options live on individual
// NodeDefs, not listed here.
// ---------------------------------------------------------------------------

export const listBuilding = z.object({
  resources: z.array(resourceDef).default([]),
  fields: z.array(fieldDef).default([]),
  categories: z.array(categoryDef).default([]),
  formats: z.array(formatDef).default([]),
});
export type ListBuilding = z.infer<typeof listBuilding>;
