import { constraintDef, type ConstraintDef } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";
import { describeConstraint } from "../../core/engine/describeConstraint";
import { lintDraftConstraint } from "../../core/engine/constraintLint";
import type { ConstraintHost } from "../../core/state/currentRuleset";
import { RECIPES, RECIPE_BY_ID, type RecipeDef, type RecipeId } from "./constraintRecipes";
import { CONDITION_OPS, flattenConstraint, METRIC_OPS, type TreeRow } from "./constraintTreeView";
import { hostConstraints } from "./constraintListView";
import type { Decorations, Draft, Face } from "./state/constraintEditor";
import { draftToInput } from "./state/constraintEditor";

/** The slice of the transient store the view-model reads. */
export interface ConstraintEditorSnapshot {
  open: boolean;
  host: ConstraintHost | null;
  mode: "new" | "existing";
  face: Face;
  draft: Draft | null;
  decorations: Decorations | null;
  readOnly: boolean;
  armedSlotId: string | null;
}

export type SentenceToken =
  | { kind: "text"; text: string }
  | { kind: "number"; slotId: string; value: string }
  | { kind: "bound"; slotId: string; value: "max" | "min" }
  | { kind: "ref"; slotId: string; label: string; filled: boolean; armed: boolean };

export interface RefOptionGroup {
  label: string;
  options: { value: string; label: string }[];
}

export interface ClauseOptions {
  severity: "error" | "warning";
  when: ConstraintDef["when"];
  perPartitionKey: NonNullable<ConstraintDef["perPartition"]>["key"] | undefined;
  /** `undefined` = the "check empty buckets" box is off; an array (maybe empty) = on. */
  expectedKeys: string[] | undefined;
  /** Existing `expectedKeys`, each resolved to a display label. */
  expectedKeyChips: { value: string; label: string }[];
  /** Values that could still be added, resolved from the current key type (excludes already-added). */
  expectedKeyOptions: { value: string; label: string }[];
  /** The key type also accepts a typed-in value (a text field, an open value list). */
  expectedKeyFreeform: boolean;
  overrides: string[];
  message: ConstraintDef["message"];
  /** Other constraints on this host (excludes this draft and engine-generated ones). */
  siblings: { id: string; text: string; severity: "error" | "warning" }[];
  /** List-building fields available as a `perPartition` key. */
  partitionFields: { id: string; name: string }[];
  /** Full selector picker, for the when-clause and the armed-slot helper. */
  refGroups: RefOptionGroup[];
}

export interface ConstraintEditorVM {
  open: boolean;
  heading: string;
  hostLabel: string;
  canGoBack: boolean;
  face: Face;

  recipes: { id: RecipeId; title: string; blurb: string }[];

  sentenceReadOnly: boolean;
  readOnlyText: string;
  tokens: SentenceToken[];
  armedSlot: { slotId: string; groups: RefOptionGroup[] } | null;
  clauses: ClauseOptions;

  treeRows: TreeRow[];
  metricOps: readonly string[];
  conditionOps: readonly string[];
  /** Tree face: the structure-mode draft carries an `only when` gate branch. */
  hasWhenBranch: boolean;

  lint: { code: string; severity: "error" | "warning"; message: string }[];
  blockingReasons: string[];
  canSave: boolean;
  saveLabel: string;
  destructiveLabel: string;
  finalizedDef: ConstraintDef | null;
}

export function constraintEditorView(
  ruleset: Ruleset,
  state: ConstraintEditorSnapshot,
): ConstraintEditorVM {
  const names = nameMaps(ruleset);
  const refGroups = buildRefGroups(ruleset, ["all", "category", "nodeDef"]);
  const { draft, decorations, host } = state;

  const input = draft && decorations ? draftToInput(draft, decorations) : null;
  const parsed = input ? constraintDef.safeParse(input) : null;
  const finalizedDef = parsed?.success ? parsed.data : null;

  const recipe = draft?.mode === "recipe" ? RECIPE_BY_ID[draft.recipeId] : undefined;
  const missing = recipe ? missingSlots(recipe, draftSlots(draft)) : [];
  const zodReasons = parsed && !parsed.success ? friendlyZodReasons(parsed.error.issues) : [];
  const blockingReasons = [...new Set([...missing, ...zodReasons])];

  const sentenceReadOnly = state.readOnly || draft?.mode === "structure";
  const structureWhen =
    draft?.mode === "structure" ? (draft.core as { when?: unknown }).when : undefined;
  const expected = resolveExpectedKeys(ruleset, decorations?.perPartition);

  return {
    open: state.open,
    heading:
      state.face === "recipes"
        ? "New constraint"
        : state.face === "tree"
          ? "Exact structure"
          : "Constraint",
    hostLabel: hostLabel(ruleset, host),
    canGoBack: state.face === "tree" || (state.face === "sentence" && state.mode === "new"),
    face: state.face,

    recipes: RECIPES.map((r) => ({ id: r.id, title: r.title, blurb: r.blurb })),

    sentenceReadOnly,
    readOnlyText: finalizedDef ? describeConstraint(finalizedDef, ruleset) : "",
    tokens: recipe ? buildTokens(recipe, draftSlots(draft), state.armedSlotId, names) : [],
    armedSlot: buildArmedSlot(recipe, state.armedSlotId, ruleset),
    clauses: {
      severity: decorations?.severity ?? "error",
      when: decorations?.when,
      perPartitionKey: decorations?.perPartition?.key,
      expectedKeys: decorations?.perPartition?.expectedKeys,
      expectedKeyChips: expected.chips,
      expectedKeyOptions: expected.options,
      expectedKeyFreeform: expected.freeform,
      overrides: decorations?.overrides ?? [],
      message: decorations?.message,
      siblings: hostConstraints(ruleset, host ?? { kind: "nodeDef", id: "" })
        .filter((c) => c.id !== decorations?.id && c.generatedFor == null)
        .map((c) => ({ id: c.id, text: describeConstraint(c, ruleset), severity: c.severity })),
      partitionFields: partitionFieldOptions(ruleset, host),
      refGroups,
    },

    treeRows: draft?.mode === "structure" ? flattenConstraint(draft.core) : [],
    metricOps: METRIC_OPS,
    conditionOps: CONDITION_OPS,
    hasWhenBranch: structureWhen !== undefined,

    lint:
      finalizedDef && host
        ? lintDraftConstraint(finalizedDef, ruleset, host).map((i) => ({
            code: i.code,
            severity: i.severity,
            message: i.message,
          }))
        : [],
    blockingReasons,
    canSave: blockingReasons.length === 0 && finalizedDef != null,
    saveLabel: state.mode === "new" ? "Add constraint" : "Save",
    destructiveLabel: state.mode === "new" ? "Discard" : "Delete",
    finalizedDef,
  };
}

// ---------------------------------------------------------------------------
// Tokens.
// ---------------------------------------------------------------------------

function draftSlots(draft: Draft | null): Record<string, string> {
  return draft?.mode === "recipe" ? draft.slots : {};
}

function buildTokens(
  recipe: RecipeDef,
  slots: Record<string, string>,
  armedSlotId: string | null,
  names: NameMaps,
): SentenceToken[] {
  return recipe.tokens.map((token): SentenceToken => {
    if (token.kind === "text") return { kind: "text", text: token.text };
    const value = slots[token.slotId] ?? "";
    if (token.slotKind === "number") return { kind: "number", slotId: token.slotId, value };
    if (token.slotKind === "bound") {
      return { kind: "bound", slotId: token.slotId, value: value === "min" ? "min" : "max" };
    }
    return {
      kind: "ref",
      slotId: token.slotId,
      label: refLabel(value, names),
      filled: value !== "",
      armed: armedSlotId === token.slotId,
    };
  });
}

function buildArmedSlot(
  recipe: RecipeDef | undefined,
  armedSlotId: string | null,
  ruleset: Ruleset,
): { slotId: string; groups: RefOptionGroup[] } | null {
  if (!recipe || !armedSlotId) return null;
  const token = recipe.tokens.find((t) => t.kind === "slot" && t.slotId === armedSlotId);
  if (!token || token.kind !== "slot") return null;
  const accepts = token.slotKind === "resource" ? (["resource"] as const) : (token.accepts ?? []);
  return { slotId: armedSlotId, groups: buildRefGroups(ruleset, [...accepts]) };
}

function buildRefGroups(
  ruleset: Ruleset,
  accepts: ("all" | "category" | "nodeDef" | "resource")[],
): RefOptionGroup[] {
  const lb = ruleset.listBuilding;
  const groups: RefOptionGroup[] = [];
  if (accepts.includes("all")) {
    groups.push({ label: "", options: [{ value: "all", label: "anything in the subtree" }] });
  }
  if (accepts.includes("category")) {
    groups.push({
      label: "Categories",
      options: (lb?.categories ?? []).map((c) => ({
        value: `cat:${c.id}`,
        label: c.name.trim() || "Untitled category",
      })),
    });
  }
  if (accepts.includes("nodeDef")) {
    groups.push({
      label: "Node types",
      options: Object.values(ruleset.registry.nodeDefs).map((n) => ({
        value: `node:${n.id}`,
        label: n.name.trim() || "Untitled node type",
      })),
    });
  }
  if (accepts.includes("resource")) {
    groups.push({
      label: "Resources",
      options: (lb?.resources ?? []).map((r) => ({
        value: r.id,
        label: r.name.trim() || "Untitled resource",
      })),
    });
  }
  return groups.filter((g) => g.options.length > 0);
}

// ---------------------------------------------------------------------------
// Validation → friendly reasons.
// ---------------------------------------------------------------------------

function missingSlots(recipe: RecipeDef, slots: Record<string, string>): string[] {
  const reasons: string[] = [];
  for (const slotId of recipe.required) {
    if ((slots[slotId] ?? "").trim() !== "") continue;
    if (slotId === "resource") reasons.push("Pick a resource.");
    else if (slotId === "n") reasons.push("Enter a number.");
    else if (slotId === "per" || slotId === "thenSubject") {
      reasons.push("Choose what to compare against.");
    } else reasons.push("Choose what this counts.");
  }
  return reasons;
}

function friendlyZodReasons(issues: { message: string }[]): string[] {
  return issues.map((issue) => {
    if (issue.message.includes("limit requires")) return "Give the limit an upper or lower bound.";
    if (issue.message.includes("nOf requires")) {
      return "Every 'how many of' group needs a minimum or maximum.";
    }
    return issue.message;
  });
}

// ---------------------------------------------------------------------------
// Name resolution.
// ---------------------------------------------------------------------------

interface NameMaps {
  category: Map<string, string>;
  nodeDef: Map<string, string>;
  resource: Map<string, string>;
}

function nameMaps(ruleset: Ruleset): NameMaps {
  const lb = ruleset.listBuilding;
  return {
    category: new Map((lb?.categories ?? []).map((c) => [c.id, c.name])),
    nodeDef: new Map(Object.values(ruleset.registry.nodeDefs).map((n) => [n.id, n.name])),
    resource: new Map((lb?.resources ?? []).map((r) => [r.id, r.name])),
  };
}

function refLabel(value: string, names: NameMaps): string {
  if (value === "") return "pick…";
  if (value === "all") return "anything in the subtree";
  if (value.startsWith("cat:")) {
    return names.category.get(value.slice(4))?.trim() || "an unknown category";
  }
  if (value.startsWith("node:")) {
    return names.nodeDef.get(value.slice(5))?.trim() || "an unknown node type";
  }
  return names.resource.get(value)?.trim() || value;
}

function hostLabel(ruleset: Ruleset, host: ConstraintHost | null): string {
  if (!host) return "";
  const lb = ruleset.listBuilding;
  switch (host.kind) {
    case "category": {
      const name = lb?.categories.find((c) => c.id === host.id)?.name.trim();
      return `every ${name || "instance"}`;
    }
    case "format":
      return lb?.formats.find((f) => f.id === host.id)?.name.trim() || "this format";
    case "nodeDef":
      return ruleset.registry.nodeDefs[host.id]?.name.trim() || "this node type";
    case "categoryRecord":
      return ruleset.registry.categoryRecords[host.id]?.name.trim() || "this record";
    default:
      return "";
  }
}

function partitionFieldOptions(
  ruleset: Ruleset,
  host: ConstraintHost | null,
): { id: string; name: string }[] {
  const lb = ruleset.listBuilding;
  const fields = [...(lb?.fields ?? [])];
  for (const category of lb?.categories ?? []) fields.push(...category.fields);
  if (host?.kind === "category") {
    const category = lb?.categories.find((c) => c.id === host.id);
    if (category) fields.push(...category.fields);
  }
  const seen = new Set<string>();
  return fields.flatMap((f) => {
    if (seen.has(f.id)) return [];
    seen.add(f.id);
    return [{ id: f.id, name: f.name.trim() || "Untitled field" }];
  });
}

// ---------------------------------------------------------------------------
// perPartition.expectedKeys — resolve the current key type to a picker.
// ---------------------------------------------------------------------------

interface ExpectedKeysResolution {
  chips: { value: string; label: string }[];
  options: { value: string; label: string }[];
  freeform: boolean;
}

function resolveExpectedKeys(
  ruleset: Ruleset,
  perPartition: Decorations["perPartition"],
): ExpectedKeysResolution {
  const selected = perPartition?.expectedKeys ?? [];
  const chipsFrom = (label: (v: string) => string) =>
    selected.map((v) => ({ value: v, label: label(v) }));
  const notSelected = (opts: { value: string; label: string }[]) =>
    opts.filter((o) => !selected.includes(o.value));

  if (!perPartition) return { chips: [], options: [], freeform: false };
  const key = perPartition.key;

  if (key.type === "nodeDefId") {
    const nodes = Object.values(ruleset.registry.nodeDefs).map((n) => ({
      value: n.id,
      label: n.name.trim() || "Untitled node type",
    }));
    const byId = new Map(nodes.map((n) => [n.value, n.label]));
    return {
      chips: chipsFrom((v) => byId.get(v) ?? v),
      options: notSelected(nodes),
      freeform: false,
    };
  }

  if (key.type === "nodeCategory") {
    const cats = (ruleset.listBuilding?.categories ?? []).map((c) => ({
      value: c.id,
      label: c.name.trim() || "Untitled category",
    }));
    const byId = new Map(cats.map((c) => [c.value, c.label]));
    return {
      chips: chipsFrom((v) => byId.get(v) ?? v),
      options: notSelected(cats),
      freeform: false,
    };
  }

  // key.type === "field"
  const field = [
    ...(ruleset.listBuilding?.fields ?? []),
    ...(ruleset.listBuilding?.categories ?? []).flatMap((c) => c.fields),
  ].find((f) => f.id === key.fieldId);
  if (!field) return { chips: chipsFrom((v) => v), options: [], freeform: true };

  if (field.type === "reference") {
    const records = Object.values(ruleset.registry.categoryRecords)
      .filter((r) => r.categoryId === field.categoryId)
      .map((r) => ({ value: r.id, label: r.name.trim() || "Untitled record" }));
    const byId = new Map(records.map((r) => [r.value, r.label]));
    return {
      chips: chipsFrom((v) => byId.get(v) ?? v),
      options: notSelected(records),
      freeform: false,
    };
  }

  if (field.type === "singleValue" || field.type === "multiValue") {
    const keyword = field.optionSource === "keywordRegistry";
    const opts = field.options.map((v) => ({
      value: v,
      label: keyword ? ruleset.registry.keywords[v]?.displayName || v : v,
    }));
    const byId = new Map(opts.map((o) => [o.value, o.label]));
    return {
      chips: chipsFrom((v) => byId.get(v) ?? v),
      options: notSelected(opts),
      freeform: !keyword,
    };
  }

  return { chips: chipsFrom((v) => v), options: [], freeform: true };
}
