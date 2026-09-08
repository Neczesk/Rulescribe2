import type { Condition, ConstraintDef, Metric } from "../../core/schema/listBuilding";
import type { Selector } from "../../core/schema/selector";
import { assertNever } from "../../core/engine/assertNever";

/**
 * Recipes are the constraint editor's friendly entry vocabulary — "cap a count",
 * "one per N", "share of a resource". They are a lossy *projection* of the
 * constraint algebra, not part of it: `compileRecipe` builds a canonical
 * `ConstraintDef` core from filled slots, and `recipeOf` recognises those exact
 * canonical shapes on the way back. A constraint `recipeOf` cannot classify
 * (hand-built, or edited in the tree face beyond the grammar) is still fully
 * editable — just as a structure, not a sentence.
 *
 * Kept in the feature (not `core/`) precisely because it is an authoring
 * convenience the engine never sees; `describeConstraint` is the piece that
 * earns a place in `core/`.
 */

export type RecipeId = "cap" | "require" | "ratio" | "share" | "ifthen" | "blank";

/**
 * A slot's current value. `""` is unset. Selector slots use `"all"`,
 * `"cat:<categoryId>"` or `"node:<nodeDefId>"`; number slots a numeric string;
 * the `resource` slot a bare `resourceId`; the `bound` slot `"max"` | `"min"`.
 */
export type SlotValue = string;
export type RecipeSlots = Record<string, SlotValue>;

export type SlotKind = "selector" | "number" | "resource" | "bound";
export type SelectorAccept = "all" | "category" | "nodeDef" | "resource";

export type RecipeToken =
  | { kind: "text"; text: string }
  | { kind: "slot"; slotId: string; slotKind: SlotKind; accepts?: SelectorAccept[] };

export interface RecipeDef {
  id: RecipeId;
  title: string;
  blurb: string;
  tokens: RecipeToken[];
  /** Fresh-draft slot values. */
  defaults: RecipeSlots;
  /** Slots that must be non-empty before the constraint means anything (Save gate). */
  required: string[];
}

const SUBJECT: SelectorAccept[] = ["all", "category", "nodeDef"];

export const RECIPES: RecipeDef[] = [
  {
    id: "cap",
    title: "Cap a count",
    blurb: "At most N of a category or node type.",
    tokens: [
      { kind: "text", text: "At most" },
      { kind: "slot", slotId: "n", slotKind: "number" },
      { kind: "text", text: "of" },
      { kind: "slot", slotId: "subject", slotKind: "selector", accepts: SUBJECT },
    ],
    defaults: { n: "3", subject: "" },
    required: ["subject", "n"],
  },
  {
    id: "require",
    title: "Require at least",
    blurb: "Must contain at least N of something.",
    tokens: [
      { kind: "text", text: "At least" },
      { kind: "slot", slotId: "n", slotKind: "number" },
      { kind: "text", text: "of" },
      { kind: "slot", slotId: "subject", slotKind: "selector", accepts: SUBJECT },
      { kind: "text", text: "must be inside" },
    ],
    defaults: { n: "1", subject: "" },
    required: ["subject", "n"],
  },
  {
    id: "ratio",
    title: "Ratio to another count",
    blurb: "At most one, per N of something else.",
    tokens: [
      { kind: "text", text: "At most one" },
      { kind: "slot", slotId: "subject", slotKind: "selector", accepts: SUBJECT },
      { kind: "text", text: "per" },
      { kind: "slot", slotId: "n", slotKind: "number" },
      { kind: "slot", slotId: "per", slotKind: "selector", accepts: SUBJECT },
    ],
    defaults: { n: "10", subject: "", per: "" },
    required: ["subject", "per", "n"],
  },
  {
    id: "share",
    title: "Share of a resource",
    blurb: "No more than N% of a resource's spend on one thing.",
    tokens: [
      { kind: "text", text: "At most" },
      { kind: "slot", slotId: "n", slotKind: "number" },
      { kind: "text", text: "% of" },
      { kind: "slot", slotId: "resource", slotKind: "resource" },
      { kind: "text", text: "may go on" },
      { kind: "slot", slotId: "subject", slotKind: "selector", accepts: SUBJECT },
    ],
    defaults: { n: "25", resource: "", subject: "" },
    required: ["subject", "resource", "n"],
  },
  {
    id: "ifthen",
    title: "If this, then that",
    blurb: "One thing being present makes another required.",
    tokens: [
      { kind: "text", text: "If" },
      { kind: "slot", slotId: "ifSubject", slotKind: "selector", accepts: SUBJECT },
      { kind: "text", text: "is inside, then" },
      { kind: "slot", slotId: "thenSubject", slotKind: "selector", accepts: SUBJECT },
      { kind: "text", text: "must be too" },
    ],
    defaults: { ifSubject: "", thenSubject: "" },
    required: ["ifSubject", "thenSubject"],
  },
  {
    id: "blank",
    title: "Blank sentence",
    blurb: "Start from an empty limit and shape it yourself.",
    tokens: [
      { kind: "slot", slotId: "bound", slotKind: "bound" },
      { kind: "slot", slotId: "n", slotKind: "number" },
      { kind: "text", text: "of" },
      { kind: "slot", slotId: "subject", slotKind: "selector", accepts: SUBJECT },
    ],
    defaults: { bound: "max", n: "", subject: "" },
    required: ["subject"],
  },
];

export const RECIPE_BY_ID: Record<RecipeId, RecipeDef> = Object.fromEntries(
  RECIPES.map((r) => [r.id, r]),
) as Record<RecipeId, RecipeDef>;

// ---------------------------------------------------------------------------
// Selector slot <-> Selector.
// ---------------------------------------------------------------------------

export function selectorFromSlot(value: SlotValue): Selector {
  if (value.startsWith("cat:")) return { type: "nodeCategory", categoryId: value.slice(4) };
  if (value.startsWith("node:")) return { type: "nodeDefId", ids: [value.slice(5)] };
  return { type: "all" };
}

export function slotFromSelector(selector: Selector): SlotValue | null {
  switch (selector.type) {
    case "all":
      return "all";
    case "nodeCategory":
      return `cat:${selector.categoryId}`;
    case "nodeDefId":
      return selector.ids.length === 1 ? `node:${selector.ids[0]}` : null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// compileRecipe — slots -> canonical constraint core (unparsed, no decorations).
// ---------------------------------------------------------------------------

/** The recipe-owned part of a constraint: `kind` plus `metric`/`condition` and bounds. */
export type ConstraintCore = Record<string, unknown>;

const K = (value: number): Metric => ({ op: "constant", value });

function toNumber(value: SlotValue, fallback: number): number {
  const n = Number(value);
  return value.trim() !== "" && Number.isFinite(n) ? n : fallback;
}

function countGte(selector: Selector, value: number): Condition {
  return { op: "compare", left: { op: "count", selector }, cmp: "gte", right: K(value) };
}

export function compileRecipe(recipeId: RecipeId, slots: RecipeSlots): ConstraintCore {
  const s = (id: string) => selectorFromSlot(slots[id] ?? "");
  const n = (id: string, fallback: number) => toNumber(slots[id] ?? "", fallback);

  switch (recipeId) {
    case "cap":
      return { kind: "limit", metric: { op: "count", selector: s("subject") }, max: K(n("n", 1)) };
    case "require":
      return { kind: "limit", metric: { op: "count", selector: s("subject") }, min: K(n("n", 1)) };
    case "ratio":
      return {
        kind: "limit",
        metric: { op: "count", selector: s("subject") },
        max: {
          op: "floor",
          of: { op: "divide", operands: [{ op: "count", selector: s("per") }, K(n("n", 1))] },
        },
      };
    case "share":
      return {
        kind: "limit",
        metric: {
          op: "percentOf",
          part: { op: "costSum", selector: s("subject"), resourceId: slots.resource ?? "" },
          whole: { op: "costSum", selector: { type: "all" }, resourceId: slots.resource ?? "" },
        },
        max: K(n("n", 1)),
      };
    case "ifthen":
      return {
        kind: "require",
        condition: {
          op: "or",
          conditions: [
            { op: "not", condition: countGte(s("ifSubject"), 1) },
            countGte(s("thenSubject"), 1),
          ],
        },
      };
    case "blank": {
      const bound = (slots.bound ?? "max") === "min" ? "min" : "max";
      const core: ConstraintCore = {
        kind: "limit",
        metric: { op: "count", selector: s("subject") },
      };
      if ((slots.n ?? "").trim() !== "") core[bound] = K(n("n", 0));
      return core;
    }
    default:
      return assertNever(recipeId);
  }
}

// ---------------------------------------------------------------------------
// recipeOf — canonical shape -> recipe + slots, or null.
// ---------------------------------------------------------------------------

export interface RecipeMatch {
  recipeId: RecipeId;
  slots: RecipeSlots;
}

const isConst = (m: Metric): m is Extract<Metric, { op: "constant" }> => m.op === "constant";
const isCount = (m: Metric): m is Extract<Metric, { op: "count" }> => m.op === "count";

export function recipeOf(c: ConstraintDef): RecipeMatch | null {
  if (c.generatedFor || Object.keys(c.values).length > 0) return null;
  return matchCap(c) ?? matchRequire(c) ?? matchRatio(c) ?? matchShare(c) ?? matchIfThen(c);
}

function matchCap(c: ConstraintDef): RecipeMatch | null {
  if (c.kind !== "limit" || c.min != null || c.max == null) return null;
  if (!isCount(c.metric) || !isConst(c.max)) return null;
  const subject = slotFromSelector(c.metric.selector);
  if (subject == null) return null;
  return { recipeId: "cap", slots: { subject, n: String(c.max.value) } };
}

function matchRequire(c: ConstraintDef): RecipeMatch | null {
  if (c.kind !== "limit" || c.max != null || c.min == null) return null;
  if (!isCount(c.metric) || !isConst(c.min)) return null;
  const subject = slotFromSelector(c.metric.selector);
  if (subject == null) return null;
  return { recipeId: "require", slots: { subject, n: String(c.min.value) } };
}

function matchRatio(c: ConstraintDef): RecipeMatch | null {
  if (c.kind !== "limit" || c.min != null || c.max == null) return null;
  if (!isCount(c.metric)) return null;
  const subject = slotFromSelector(c.metric.selector);
  if (subject == null) return null;
  const max = c.max;
  if (max.op !== "floor" || max.of.op !== "divide" || max.of.operands.length !== 2) return null;
  const [perMetric, nMetric] = max.of.operands;
  if (!isCount(perMetric) || !isConst(nMetric)) return null;
  const per = slotFromSelector(perMetric.selector);
  if (per == null) return null;
  return { recipeId: "ratio", slots: { subject, per, n: String(nMetric.value) } };
}

function matchShare(c: ConstraintDef): RecipeMatch | null {
  if (c.kind !== "limit" || c.min != null || c.max == null || !isConst(c.max)) return null;
  const m = c.metric;
  if (m.op !== "percentOf" || m.part.op !== "costSum" || m.whole.op !== "costSum") return null;
  if (m.whole.selector.type !== "all" || m.part.resourceId !== m.whole.resourceId) return null;
  const subject = slotFromSelector(m.part.selector);
  if (subject == null) return null;
  return {
    recipeId: "share",
    slots: { subject, resource: m.part.resourceId, n: String(c.max.value) },
  };
}

function matchIfThen(c: ConstraintDef): RecipeMatch | null {
  if (c.kind !== "require" || c.condition.op !== "or" || c.condition.conditions.length !== 2) {
    return null;
  }
  const [first, second] = c.condition.conditions;
  if (first.op !== "not") return null;
  const ifSide = asCountGte(first.condition);
  const thenSide = asCountGte(second);
  if (!ifSide || !thenSide || ifSide.value !== 1 || thenSide.value !== 1) return null;
  return {
    recipeId: "ifthen",
    slots: { ifSubject: ifSide.subject, thenSubject: thenSide.subject },
  };
}

function asCountGte(cond: Condition): { subject: SlotValue; value: number } | null {
  if (cond.op !== "compare" || cond.cmp !== "gte") return null;
  if (!isCount(cond.left) || !isConst(cond.right)) return null;
  const subject = slotFromSelector(cond.left.selector);
  return subject == null ? null : { subject, value: cond.right.value };
}
