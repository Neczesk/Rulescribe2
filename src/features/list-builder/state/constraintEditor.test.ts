import { beforeEach, describe, expect, it } from "vitest";
import { constraintDef } from "../../../core/schema/listBuilding";
import { constraintEditorStore, draftToInput } from "./constraintEditor";
import { recipeOf } from "../constraintRecipes";

const s = () => constraintEditorStore.getState();
const HOST = { kind: "category" as const, id: "modelcatx0" };

beforeEach(() => {
  s().close();
});

describe("constraintEditorStore — new constraint flow", () => {
  it("recipes → sentence → filled slots → a parseable def", () => {
    s().openForNew(HOST);
    expect(s().face).toBe("recipes");

    s().pickRecipe("cap");
    expect(s().face).toBe("sentence");
    expect(s().draft).toMatchObject({ mode: "recipe", recipeId: "cap" });

    s().setSlot("subject", "cat:modelcatx0");
    s().setSlot("n", "3");

    const input = draftToInput(s().draft!, s().decorations!);
    const parsed = constraintDef.safeParse(input);
    expect(parsed.success).toBe(true);
    expect(recipeOf(parsed.data!)).toEqual({
      recipeId: "cap",
      slots: { subject: "cat:modelcatx0", n: "3" },
    });
  });

  it("back() returns to the recipes face and drops the draft", () => {
    s().openForNew(HOST);
    s().pickRecipe("require");
    s().back();
    expect(s().face).toBe("recipes");
    expect(s().draft).toBeNull();
  });

  it("toStructure compiles the recipe once, toSentence reclassifies it back", () => {
    s().openForNew(HOST);
    s().pickRecipe("cap");
    s().setSlot("subject", "cat:modelcatx0");
    s().toStructure();
    expect(s().face).toBe("tree");
    expect(s().draft).toMatchObject({ mode: "structure" });

    s().toSentence();
    expect(s().face).toBe("sentence");
    expect(s().draft).toMatchObject({ mode: "recipe", recipeId: "cap" });
  });

  it("setDecorations toggles a clause on and off", () => {
    s().openForNew(HOST);
    s().pickRecipe("cap");
    s().setDecorations({ severity: "warning" });
    expect(s().decorations?.severity).toBe("warning");
    s().setDecorations({ perPartition: { key: { type: "nodeDefId" } } });
    expect(s().decorations?.perPartition?.key.type).toBe("nodeDefId");
    s().setDecorations({ perPartition: undefined });
    expect(s().decorations?.perPartition).toBeUndefined();
  });
});

describe("constraintEditorStore — existing constraint", () => {
  it("opens an unclassifiable constraint read-only in structure mode", () => {
    const c = constraintDef.parse({
      id: "cwild00001",
      kind: "limit",
      metric: {
        op: "count",
        selector: { type: "and", selectors: [{ type: "all" }, { type: "all" }] },
      },
      max: { op: "constant", value: 2 },
    });
    s().openForExisting(HOST, c);
    expect(s().readOnly).toBe(true);
    expect(s().draft).toMatchObject({ mode: "structure" });
    expect(s().decorations?.id).toBe("cwild00001");
  });

  it("opens a recipe-shaped constraint straight into the sentence face", () => {
    const c = constraintDef.parse({
      id: "ccap000001",
      kind: "limit",
      metric: { op: "count", selector: { type: "nodeCategory", categoryId: "modelcatx0" } },
      max: { op: "constant", value: 5 },
    });
    s().openForExisting(HOST, c);
    expect(s().readOnly).toBe(false);
    expect(s().face).toBe("sentence");
    expect(s().draft).toMatchObject({
      mode: "recipe",
      recipeId: "cap",
      slots: { subject: "cat:modelcatx0", n: "5" },
    });
  });
});

describe("when in the tree face", () => {
  const WHEN = {
    op: "compare" as const,
    left: { op: "count" as const, selector: { type: "all" as const } },
    cmp: "gte" as const,
    right: { op: "constant" as const, value: 1 },
  };

  it("toStructure folds decorations.when onto the core; toSentence lifts it back and reclassifies", () => {
    s().openForNew(HOST);
    s().pickRecipe("cap");
    s().setSlot("subject", "cat:modelcatx0");
    s().setDecorations({ when: WHEN });

    s().toStructure();
    expect((s().draft as { core: { when?: unknown } }).core.when).toEqual(WHEN);

    s().toSentence();
    expect(s().draft).toMatchObject({ mode: "recipe", recipeId: "cap" });
    expect(s().decorations?.when).toEqual(WHEN);
  });

  it("draftToInput never emits `when` twice", () => {
    s().openForNew(HOST);
    s().pickRecipe("cap");
    s().setSlot("subject", "cat:modelcatx0");
    s().setDecorations({ when: WHEN });
    s().toStructure();

    const input = draftToInput(s().draft!, s().decorations!) as Record<string, unknown>;
    const parsed = constraintDef.parse(input);
    expect(parsed.when).toEqual(WHEN);
  });

  it("addWhenBranch / removeWhenBranch mutate the structure-mode core", () => {
    s().openForNew(HOST);
    s().pickRecipe("cap");
    s().setSlot("subject", "cat:modelcatx0");
    s().toStructure();

    s().addWhenBranch();
    expect((s().draft as { core: { when?: unknown } }).core.when).toBeDefined();
    s().removeWhenBranch();
    expect((s().draft as { core: { when?: unknown } }).core.when).toBeUndefined();
  });
});

describe("perPartition.expectedKeys", () => {
  it("survives a structure ↔ sentence round-trip", () => {
    s().openForNew(HOST);
    s().pickRecipe("cap");
    s().setSlot("subject", "cat:modelcatx0");
    s().setDecorations({
      perPartition: { key: { type: "nodeCategory" }, expectedKeys: ["a", "b"] },
    });
    s().toStructure();
    s().toSentence();
    expect(s().decorations?.perPartition).toEqual({
      key: { type: "nodeCategory" },
      expectedKeys: ["a", "b"],
    });

    const input = draftToInput(s().draft!, s().decorations!) as Record<string, unknown>;
    expect(constraintDef.parse(input).perPartition).toEqual({
      key: { type: "nodeCategory" },
      expectedKeys: ["a", "b"],
    });
  });
});
