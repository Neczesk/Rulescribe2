import { createStore } from "zustand/vanilla";
import { useStore } from "zustand/react";
import type { Condition, ConstraintDef, PartitionKeySpec } from "../../../core/schema/listBuilding";
import { constraintDef } from "../../../core/schema/listBuilding";
import type { RichText } from "../../../core/schema/richText";
import type { ConstraintHost } from "../../../core/state/currentRuleset";
import { shortId } from "../../../util/nanoid";
import {
  compileRecipe,
  RECIPE_BY_ID,
  type RecipeId,
  type RecipeSlots,
  recipeOf,
} from "../constraintRecipes";
import { applyTreeTransform, type TreeTransform } from "../constraintTreeView";

/**
 * Transient UI state for the one shared constraint-editor panel: which host it
 * is open on, which face is showing, and the working draft. Ruleset data only
 * enters on Save (via `currentRulesetStore`), never here — this store is the
 * `editorUi.ts` pattern for "interaction state that isn't ruleset data".
 */

export type Face = "recipes" | "sentence" | "tree";

/** The orthogonal clause state, edited independently of the recipe/structure core. */
export interface Decorations {
  id: string;
  severity: "error" | "warning";
  /** In structure mode this lives on `draft.core.when` instead; see `toStructure` / `toSentence`. */
  when?: Condition;
  perPartition?: { key: PartitionKeySpec; expectedKeys?: string[] };
  overrides: string[];
  message?: RichText;
}

const DEFAULT_WHEN: Condition = {
  op: "compare",
  left: { op: "count", selector: { type: "all" } },
  cmp: "gte",
  right: { op: "constant", value: 1 },
};

export type Draft =
  | { mode: "recipe"; recipeId: RecipeId; slots: RecipeSlots }
  | { mode: "structure"; core: Record<string, unknown> };

interface ConstraintEditorState {
  open: boolean;
  host: ConstraintHost | null;
  mode: "new" | "existing";
  originalId: string | null;
  face: Face;
  draft: Draft | null;
  decorations: Decorations | null;
  /** `recipeOf` could not classify an existing constraint — the sentence face is read-only. */
  readOnly: boolean;
  armedSlotId: string | null;

  openForNew: (host: ConstraintHost) => void;
  openForExisting: (host: ConstraintHost, constraint: ConstraintDef) => void;
  close: () => void;
  pickRecipe: (recipeId: RecipeId) => void;
  back: () => void;
  toStructure: () => void;
  toSentence: () => void;
  setSlot: (slotId: string, value: string) => void;
  armSlot: (slotId: string | null) => void;
  setDecorations: (patch: Partial<Decorations>) => void;
  applyTreeTransform: (transform: TreeTransform) => void;
  /** Tree face: add / remove the `only when` gate branch. */
  addWhenBranch: () => void;
  removeWhenBranch: () => void;
}

function decorationsOf(c: ConstraintDef): Decorations {
  return {
    id: c.id,
    severity: c.severity,
    when: c.when,
    perPartition: c.perPartition
      ? { key: c.perPartition.key, expectedKeys: c.perPartition.expectedKeys }
      : undefined,
    overrides: [...c.overrides],
    message: c.message,
  };
}

/** The recipe/structure-owned part of a constraint — `kind` plus metric/bounds or condition. */
export function coreOf(c: ConstraintDef): Record<string, unknown> {
  if (c.kind === "limit") {
    return {
      kind: "limit",
      metric: c.metric,
      ...(c.min !== undefined ? { min: c.min } : {}),
      ...(c.max !== undefined ? { max: c.max } : {}),
    };
  }
  return { kind: "require", condition: c.condition };
}

/** Merge a draft's core and decorations into a plain object ready for `constraintDef.parse`. */
export function draftToInput(draft: Draft, decorations: Decorations): Record<string, unknown> {
  const rawCore = draft.mode === "recipe" ? compileRecipe(draft.recipeId, draft.slots) : draft.core;
  // In structure mode `when` lives on the core (tree-editable); otherwise on decorations.
  const { when: coreWhen, ...core } = rawCore as Record<string, unknown> & { when?: unknown };
  const when = coreWhen ?? decorations.when;
  return {
    ...core,
    id: decorations.id,
    severity: decorations.severity,
    overrides: decorations.overrides,
    ...(when ? { when } : {}),
    ...(decorations.perPartition ? { perPartition: decorations.perPartition } : {}),
    ...(decorations.message ? { message: decorations.message } : {}),
  };
}

export const constraintEditorStore = createStore<ConstraintEditorState>((set, get) => ({
  open: false,
  host: null,
  mode: "new",
  originalId: null,
  face: "recipes",
  draft: null,
  decorations: null,
  readOnly: false,
  armedSlotId: null,

  openForNew: (host) =>
    set({
      open: true,
      host,
      mode: "new",
      originalId: null,
      face: "recipes",
      draft: null,
      decorations: null,
      readOnly: false,
      armedSlotId: null,
    }),

  openForExisting: (host, constraint) => {
    const match = recipeOf(constraint);
    const structureCore = {
      ...coreOf(constraint),
      ...(constraint.when ? { when: constraint.when } : {}),
    };
    set({
      open: true,
      host,
      mode: "existing",
      originalId: constraint.id,
      face: "sentence",
      decorations: decorationsOf(constraint),
      draft: match
        ? { mode: "recipe", recipeId: match.recipeId, slots: match.slots }
        : { mode: "structure", core: structureCore },
      readOnly: match === null,
      armedSlotId: null,
    });
  },

  close: () => set({ open: false, host: null, draft: null, decorations: null, armedSlotId: null }),

  pickRecipe: (recipeId) =>
    set({
      face: "sentence",
      draft: { mode: "recipe", recipeId, slots: { ...RECIPE_BY_ID[recipeId].defaults } },
      decorations: { id: shortId(), severity: "error", overrides: [] },
      armedSlotId: null,
    }),

  back: () => {
    const { face, mode } = get();
    if (face === "tree") {
      set({ face: "sentence" });
    } else if (face === "sentence" && mode === "new") {
      set({ face: "recipes", draft: null, decorations: null, armedSlotId: null });
    }
  },

  toStructure: () => {
    const { draft, decorations } = get();
    if (!draft) return;
    const base =
      draft.mode === "recipe" ? compileRecipe(draft.recipeId, draft.slots) : { ...draft.core };
    // Fold the gate onto the core so the tree face can edit it.
    const core = decorations?.when ? { ...base, when: decorations.when } : base;
    set({ face: "tree", draft: { mode: "structure", core }, armedSlotId: null });
  },

  toSentence: () => {
    const { draft, decorations, readOnly } = get();
    if (draft && draft.mode === "structure" && decorations) {
      // Lift any tree-edited gate back onto decorations, strip it from the core.
      const { when, ...bareCore } = draft.core as Record<string, unknown> & { when?: Condition };
      const nextDecorations = { ...decorations, when };
      const nextDraft: Draft = { mode: "structure", core: bareCore };
      if (!readOnly) {
        const parsed = constraintDef.safeParse(draftToInput(nextDraft, nextDecorations));
        const match = parsed.success ? recipeOf(parsed.data) : null;
        if (match) {
          set({
            face: "sentence",
            decorations: nextDecorations,
            draft: { mode: "recipe", recipeId: match.recipeId, slots: match.slots },
          });
          return;
        }
      }
      set({ face: "sentence", decorations: nextDecorations, draft: nextDraft });
      return;
    }
    set({ face: "sentence" });
  },

  setSlot: (slotId, value) => {
    const { draft } = get();
    if (!draft || draft.mode !== "recipe") return;
    set({ draft: { ...draft, slots: { ...draft.slots, [slotId]: value } }, armedSlotId: null });
  },

  armSlot: (slotId) => set({ armedSlotId: slotId }),

  setDecorations: (patch) => {
    const { decorations } = get();
    if (!decorations) return;
    set({ decorations: { ...decorations, ...patch } });
  },

  applyTreeTransform: (transform) => {
    const { draft } = get();
    if (!draft || draft.mode !== "structure") return;
    set({ draft: { mode: "structure", core: applyTreeTransform(draft.core, transform) } });
  },

  addWhenBranch: () => {
    const { draft } = get();
    if (!draft || draft.mode !== "structure" || draft.core.when !== undefined) return;
    set({ draft: { mode: "structure", core: { ...draft.core, when: DEFAULT_WHEN } } });
  },

  removeWhenBranch: () => {
    const { draft } = get();
    if (!draft || draft.mode !== "structure") return;
    const { when: _when, ...rest } = draft.core as Record<string, unknown> & { when?: Condition };
    set({ draft: { mode: "structure", core: rest } });
  },
}));

export function useConstraintEditor<T>(selector: (state: ConstraintEditorState) => T): T {
  return useStore(constraintEditorStore, selector);
}
