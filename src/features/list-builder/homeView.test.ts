import { describe, expect, it } from "vitest";
import { createRuleset } from "../../core/schema/createRuleset";
import { ruleset as rulesetSchema } from "../../core/schema/ruleset";
import { listBuildingHomeView } from "./homeView";

function rulesetWith(overrides: Record<string, unknown>) {
  const base = createRuleset("Test");
  return rulesetSchema.parse({ ...base, ...overrides });
}

describe("listBuildingHomeView", () => {
  it("returns empty sections when the ruleset has no listBuilding block", () => {
    const view = listBuildingHomeView(createRuleset("Bare"));
    expect(view.nodeCategories).toEqual([]);
    expect(view.recordCategories).toEqual([]);
    expect(view.foundations.map((f) => [f.key, f.count])).toEqual([
      ["categories", 0],
      ["formats", 0],
      ["resources", 0],
    ]);
  });

  it("splits categories by kind and counts what points at each", () => {
    const base = createRuleset("Full");
    const rs = rulesetWith({
      registry: {
        ...base.registry,
        nodeDefs: {
          n1aaaaaaaa: { id: "n1aaaaaaaa", name: "A", categoryId: "cat0000001" },
          n2aaaaaaaa: { id: "n2aaaaaaaa", name: "B", categoryId: "cat0000001" },
        },
        categoryRecords: {
          r1aaaaaaaa: { id: "r1aaaaaaaa", categoryId: "cat0000002", values: {} },
        },
      },
      listBuilding: {
        categories: [
          { id: "cat0000001", name: "Warband", kind: "node" },
          { id: "cat0000002", name: "Allegiance", kind: "record" },
        ],
        formats: [{ id: "fmt0000001", name: "Skirmish" }],
        resources: [{ id: "res0000001", name: "Ducats" }],
      },
    });

    const view = listBuildingHomeView(rs);
    expect(view.nodeCategories).toEqual([{ id: "cat0000001", name: "Warband", count: 2 }]);
    expect(view.recordCategories).toEqual([{ id: "cat0000002", name: "Allegiance", count: 1 }]);
    expect(view.foundations.map((f) => f.count)).toEqual([2, 1, 1]);
    expect(view.foundations[0].items).toEqual(["Warband", "Allegiance"]);
  });

  it("treats a category with no explicit kind as a node category", () => {
    const rs = rulesetWith({ listBuilding: { categories: [{ id: "cat0000003", name: "Relic" }] } });
    const view = listBuildingHomeView(rs);
    expect(view.nodeCategories.map((c) => c.id)).toEqual(["cat0000003"]);
    expect(view.recordCategories).toEqual([]);
  });
});
