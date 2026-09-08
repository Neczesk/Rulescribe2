import { describe, expect, it } from "vitest";
import { constraintDef, listBuilding, nodeDef } from "../../core/schema/listBuilding";
import { createRuleset } from "../../core/schema/createRuleset";
import type { Ruleset } from "../../core/schema/ruleset";
import { constraintEditorView, type ConstraintEditorSnapshot } from "./constraintEditorView";
import { coreOf, type Decorations } from "./state/constraintEditor";

const PTS = "pts0000000";
const MODEL_CAT = "modelcatx0";
const HERO_CAT = "herocatxx0";

function ruleset(): Ruleset {
  const rs = createRuleset("Test");
  return {
    ...rs,
    registry: {
      ...rs.registry,
      nodeDefs: { bannernod0: nodeDef.parse({ id: "bannernod0", name: "Battle Standard" }) },
    },
    listBuilding: listBuilding.parse({
      resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
      categories: [
        { id: MODEL_CAT, name: "Model", kind: "node" },
        { id: HERO_CAT, name: "Hero", kind: "node" },
      ],
    }),
  };
}

const deco = (over: Partial<Decorations> = {}): Decorations => ({
  id: "draft00001",
  severity: "error",
  overrides: [],
  ...over,
});

const newCapSnapshot = (slots: Record<string, string>): ConstraintEditorSnapshot => ({
  open: true,
  host: { kind: "category", id: MODEL_CAT },
  mode: "new",
  face: "sentence",
  draft: { mode: "recipe", recipeId: "cap", slots },
  decorations: deco(),
  readOnly: false,
  armedSlotId: null,
});

describe("constraintEditorView — new recipe draft", () => {
  it("blocks Save until the subject slot is filled", () => {
    const vm = constraintEditorView(ruleset(), newCapSnapshot({ n: "3", subject: "" }));
    expect(vm.canSave).toBe(false);
    expect(vm.blockingReasons).toContain("Choose what this counts.");
  });

  it("is saveable once slots are filled, and the ref token shows the category name", () => {
    const vm = constraintEditorView(
      ruleset(),
      newCapSnapshot({ n: "3", subject: `cat:${MODEL_CAT}` }),
    );
    expect(vm.canSave).toBe(true);
    expect(vm.finalizedDef?.kind).toBe("limit");
    const ref = vm.tokens.find((t) => t.kind === "ref");
    expect(ref).toMatchObject({ kind: "ref", filled: true, label: "Model" });
    expect(vm.saveLabel).toBe("Add constraint");
  });

  it("exposes the armed-slot picker with Categories and Node types, no Resources", () => {
    const snapshot = { ...newCapSnapshot({ n: "3", subject: "" }), armedSlotId: "subject" };
    const vm = constraintEditorView(ruleset(), snapshot);
    expect(vm.armedSlot?.slotId).toBe("subject");
    expect(vm.armedSlot?.groups.map((g) => g.label)).toEqual(["", "Categories", "Node types"]);
    expect(vm.tokens.find((t) => t.kind === "ref" && t.slotId === "subject")).toMatchObject({
      armed: true,
    });
  });
});

describe("constraintEditorView — existing unclassifiable constraint", () => {
  it("falls back to a read-only description and the tree face", () => {
    const c = constraintDef.parse({
      id: "cwild00001",
      kind: "limit",
      metric: {
        op: "count",
        selector: {
          type: "and",
          selectors: [
            { type: "nodeCategory", categoryId: MODEL_CAT },
            { type: "not", selector: { type: "nodeDefId", ids: ["bannernod0"] } },
          ],
        },
      },
      max: { op: "constant", value: 2 },
    });
    const snapshot: ConstraintEditorSnapshot = {
      open: true,
      host: { kind: "nodeDef", id: "bannernod0" },
      mode: "existing",
      face: "sentence",
      draft: { mode: "structure", core: coreOf(c) },
      decorations: deco({ id: c.id }),
      readOnly: true,
      armedSlotId: null,
    };
    const vm = constraintEditorView(ruleset(), snapshot);
    expect(vm.sentenceReadOnly).toBe(true);
    expect(vm.heading).toBe("Constraint");
    expect(vm.readOnlyText.length).toBeGreaterThan(0);
    expect(vm.tokens).toEqual([]);
    expect(vm.destructiveLabel).toBe("Delete");
  });
});

describe("constraintEditorView — clauses", () => {
  it("lists sibling constraints, excluding the draft itself and generated ones", () => {
    const rs = ruleset();
    const other = constraintDef.parse({
      id: "csib000001",
      kind: "limit",
      metric: { op: "count", selector: { type: "all" } },
      max: { op: "constant", value: 1 },
    });
    const generated = constraintDef.parse({
      id: "cgen000001",
      kind: "limit",
      metric: { op: "costSum", selector: { type: "all" }, resourceId: PTS },
      max: { op: "resourceLimit", resourceId: PTS },
      generatedFor: { resourceId: PTS },
    });
    const self = constraintDef.parse({
      id: "draft00001",
      kind: "limit",
      metric: { op: "count", selector: { type: "all" } },
      max: { op: "constant", value: 2 },
    });
    rs.listBuilding!.categories[0].constraints = [other, generated, self];

    const vm = constraintEditorView(rs, newCapSnapshot({ n: "1", subject: "all" }));
    expect(vm.clauses.siblings.map((s) => s.id)).toEqual(["csib000001"]);
  });

  it("resolves the host label", () => {
    const catVm = constraintEditorView(ruleset(), newCapSnapshot({ n: "1", subject: "all" }));
    expect(catVm.hostLabel).toBe("every Model");

    const rs = ruleset();
    const formatId = rs.listBuilding!.formats[0]?.id;
    if (!formatId) {
      rs.listBuilding = listBuilding.parse({
        ...rs.listBuilding,
        formats: [{ id: "fmt0000001", name: "Combined Arms" }],
      });
    }
    const formatVm = constraintEditorView(rs, {
      ...newCapSnapshot({ n: "1", subject: "all" }),
      host: { kind: "format", id: "fmt0000001" },
    });
    expect(formatVm.hostLabel).toBe("Combined Arms");
  });
});

describe("constraintEditorView — perPartition.expectedKeys options", () => {
  const withPartition = (perPartition: Decorations["perPartition"]): ConstraintEditorSnapshot => ({
    ...newCapSnapshot({ n: "1", subject: "all" }),
    decorations: deco({ perPartition }),
  });

  it("node-type key → every node type as options; label resolves for chips", () => {
    const vm = constraintEditorView(
      ruleset(),
      withPartition({ key: { type: "nodeDefId" }, expectedKeys: ["bannernod0"] }),
    );
    expect(vm.clauses.expectedKeyFreeform).toBe(false);
    expect(vm.clauses.expectedKeyChips).toEqual([
      { value: "bannernod0", label: "Battle Standard" },
    ]);
    // already-selected excluded from options
    expect(vm.clauses.expectedKeyOptions.find((o) => o.value === "bannernod0")).toBeUndefined();
  });

  it("category key → every category as options", () => {
    const vm = constraintEditorView(
      ruleset(),
      withPartition({ key: { type: "nodeCategory" }, expectedKeys: [] }),
    );
    expect(vm.clauses.expectedKeyOptions.map((o) => o.label).sort()).toEqual(["Hero", "Model"]);
  });

  it("field key on a freeform list → the field's values as options, freeform on", () => {
    const rs = ruleset();
    rs.listBuilding!.categories[0].fields = [
      {
        id: "rolefield0",
        name: "Role",
        type: "singleValue",
        optionSource: "freeform",
        options: ["Core", "Rare"],
      },
    ] as never;
    const vm = constraintEditorView(
      rs,
      withPartition({ key: { type: "field", fieldId: "rolefield0" }, expectedKeys: [] }),
    );
    expect(vm.clauses.expectedKeyFreeform).toBe(true);
    expect(vm.clauses.expectedKeyOptions.map((o) => o.value)).toEqual(["Core", "Rare"]);
  });

  it("no perPartition → empty expectedKeys view", () => {
    const vm = constraintEditorView(ruleset(), newCapSnapshot({ n: "1", subject: "all" }));
    expect(vm.clauses.expectedKeys).toBeUndefined();
    expect(vm.clauses.expectedKeyChips).toEqual([]);
  });
});

describe("constraintEditorView — hasWhenBranch", () => {
  it("is true only when the structure-mode core carries a when", () => {
    const withWhen: ConstraintEditorSnapshot = {
      ...newCapSnapshot({ n: "1", subject: "all" }),
      face: "tree",
      draft: {
        mode: "structure",
        core: {
          kind: "limit",
          metric: { op: "count", selector: { type: "all" } },
          max: { op: "constant", value: 1 },
          when: {
            op: "compare",
            left: { op: "count", selector: { type: "all" } },
            cmp: "gte",
            right: { op: "constant", value: 1 },
          },
        },
      },
    };
    expect(constraintEditorView(ruleset(), withWhen).hasWhenBranch).toBe(true);
    expect(constraintEditorView(ruleset(), withWhen).treeRows[0].label).toBe("only when");

    const noWhen = {
      ...withWhen,
      draft: {
        mode: "structure" as const,
        core: {
          kind: "limit",
          metric: { op: "count", selector: { type: "all" } },
          max: { op: "constant", value: 1 },
        },
      },
    };
    expect(constraintEditorView(ruleset(), noWhen).hasWhenBranch).toBe(false);
  });
});
