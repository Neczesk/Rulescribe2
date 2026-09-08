import { describe, expect, it } from "vitest";
import { createRuleset } from "../../core/schema/createRuleset";
import { ruleset as rulesetSchema } from "../../core/schema/ruleset";
import { capLabel, resourceRows } from "./resourcesView";

function rulesetWith(overrides: Record<string, unknown>) {
  return rulesetSchema.parse({ ...createRuleset("Test"), ...overrides });
}

describe("capLabel", () => {
  it("describes each cap shape", () => {
    expect(capLabel({ type: "none" })).toBe("Cap set per format");
    expect(capLabel({ type: "fixed", value: 12 })).toBe("Fixed cap 12");
    expect(capLabel({ type: "playerChosen" })).toBe("Player sets the cap");
  });
});

describe("resourceRows", () => {
  it("is empty when the ruleset has no listBuilding block", () => {
    expect(resourceRows(createRuleset("Bare"))).toEqual([]);
  });

  it("carries the cap value only for a fixed cap", () => {
    const rs = rulesetWith({
      listBuilding: {
        resources: [
          { id: "pointsaaaa", name: "Points", cap: { type: "none" } },
          { id: "cpaaaaaaaa", name: "Command Points", cap: { type: "fixed", value: 12 } },
        ],
      },
    });
    const rows = resourceRows(rs);
    expect(rows.map((r) => [r.name, r.capType, r.capValue])).toEqual([
      ["Points", "none", 0],
      ["Command Points", "fixed", 12],
    ]);
  });

  it("counts node types that spend the resource via a base cost or an option cost", () => {
    const rs = rulesetWith({
      registry: {
        ...createRuleset("Test").registry,
        nodeDefs: {
          n1aaaaaaaa: { id: "n1aaaaaaaa", name: "Squad", baseCosts: { pointsaaaa: 50 } },
          n2aaaaaaaa: {
            id: "n2aaaaaaaa",
            name: "Upgrade",
            options: [
              {
                kind: "toggleFieldValue",
                fieldId: "kwaaaaaaaa",
                fieldValue: "Elite",
                direction: "add",
                cost: { type: "flat", resourceId: "pointsaaaa", amount: 10 },
              },
            ],
          },
          n3aaaaaaaa: { id: "n3aaaaaaaa", name: "Free" },
        },
      },
      listBuilding: { resources: [{ id: "pointsaaaa", name: "Points", cap: { type: "none" } }] },
    });
    expect(resourceRows(rs)[0].usedByCount).toBe(2);
  });
});
