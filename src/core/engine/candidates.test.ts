import { describe, expect, it } from "vitest";
import { nodeDef, type NodeDef } from "../schema/listBuilding";
import type { SelectionEntry } from "../schema/selection";
import { flattenSubtree, matchCandidate, sumOwnCost } from "./candidates";

const g = (defId: string, count: number, slotId = "s"): SelectionEntry => ({
  kind: "group",
  slotId,
  defId,
  count,
});
const i = (
  instanceId: string,
  defId: string,
  children: SelectionEntry[] = [],
  optionIds: string[] = [],
  slotId = "s",
): SelectionEntry => ({
  kind: "instance",
  slotId,
  instanceId,
  defId,
  children,
  appliedOptions: optionIds.map((optionId) => ({ optionId })),
});

const nodeDefs: Record<string, NodeDef> = {
  army000000: nodeDef.parse({ id: "army000000", baseCosts: { pts: 10 } }),
  squad00000: nodeDef.parse({
    id: "squad00000",
    categoryId: "unit000000",
    baseCosts: { pts: 65 },
    fields: { role: "core" },
    options: [
      { id: "addbanner0", kind: "addChild", slotId: "s", addNodeId: "banner0000" },
      {
        id: "perhead000",
        kind: "toggleFieldValue",
        fieldId: "x",
        fieldValue: "y",
        direction: "add",
        cost: { type: "perChild", resourceId: "pts", amountPerUnit: 2, slotId: "s" },
      },
    ],
  }),
  trooper000: nodeDef.parse({ id: "trooper000", baseCosts: { pts: 8 } }),
  banner0000: nodeDef.parse({ id: "banner0000", baseCosts: { pts: 5 } }),
};
const ctx = { nodeDefs };

describe("flattenSubtree", () => {
  const tree: SelectionEntry[] = [
    i("aaaaaaaaaa", "army000000", [i("bbbbbbbbbb", "squad00000", [g("trooper000", 3)])]),
  ];

  it("emits depth-first with index matching array position", () => {
    const flat = flattenSubtree(tree, ctx);
    expect(flat.map((c) => c.defId)).toEqual(["army000000", "squad00000", "trooper000"]);
    expect(flat.map((c) => c.index)).toEqual([0, 1, 2]);
  });

  it("subtreeEnd spans exactly the node's own subtree, itself included", () => {
    const flat = flattenSubtree(tree, ctx);
    expect(flat.map((c) => [c.index, c.subtreeEnd])).toEqual([
      [0, 3],
      [1, 3],
      [2, 3],
    ]);
  });

  it("a group contributes its count, an instance 1", () => {
    const flat = flattenSubtree(tree, ctx);
    expect(flat.map((c) => c.count)).toEqual([1, 1, 3]);
  });

  it("ownCost holds only the node's own contribution, groups multiplied by count", () => {
    const flat = flattenSubtree(tree, ctx);
    expect(flat.map((c) => c.ownCost)).toEqual([{ pts: 10 }, { pts: 65 }, { pts: 24 }]);
  });

  it("deep:false keeps only the entries given", () => {
    expect(flattenSubtree(tree, ctx, false).map((c) => c.defId)).toEqual(["army000000"]);
  });

  it("descends effectiveChildren, so an option-added node is present and costed", () => {
    const withOption: SelectionEntry[] = [i("bbbbbbbbbb", "squad00000", [], ["addbanner0"])];
    const flat = flattenSubtree(withOption, ctx);
    expect(flat.map((c) => c.defId)).toEqual(["squad00000", "banner0000"]);
    expect(flat[1]?.ownCost).toEqual({ pts: 5 });
  });

  it("folds a perChild option surcharge into the parent's ownCost", () => {
    const flat = flattenSubtree(
      [i("bbbbbbbbbb", "squad00000", [g("trooper000", 4)], ["perhead000"])],
      ctx,
    );
    expect(flat[0]?.ownCost).toEqual({ pts: 65 + 2 * 4 });
  });
});

describe("sumOwnCost", () => {
  const flat = flattenSubtree(
    [i("aaaaaaaaaa", "army000000", [i("bbbbbbbbbb", "squad00000", [g("trooper000", 3)])])],
    ctx,
  );

  it("sums a subtree range, and works against a slice", () => {
    expect(sumOwnCost(flat, "pts", 0, 3)).toBe(10 + 65 + 24);
    expect(sumOwnCost(flat, "pts", 1, 3)).toBe(65 + 24);
    expect(sumOwnCost(flat.slice(1), "pts", 1, 3)).toBe(65 + 24);
  });

  it("is 0 for an unknown resource", () => {
    expect(sumOwnCost(flat, "cp", 0, 3)).toBe(0);
  });
});

describe("matchCandidate", () => {
  it("reads NodeDef.fields for a group and carries no applied options", () => {
    const cand = matchCandidate(g("squad00000", 2), ctx);
    expect(cand).toMatchObject({ defId: "squad00000", categoryId: "unit000000" });
    expect(cand.fields).toEqual({ role: "core" });
    expect(cand.appliedOptionIds.size).toBe(0);
  });

  it("reads effective fields and applied options for an instance", () => {
    const cand = matchCandidate(i("bbbbbbbbbb", "squad00000", [], ["addbanner0"]), ctx);
    expect([...cand.appliedOptionIds]).toEqual(["addbanner0"]);
  });
});
