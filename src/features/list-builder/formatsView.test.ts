import { describe, expect, it } from "vitest";
import { createRuleset } from "../../core/schema/createRuleset";
import { ruleset as rulesetSchema } from "../../core/schema/ruleset";
import { formatRows } from "./formatsView";

function rulesetWith(overrides: Record<string, unknown>) {
  return rulesetSchema.parse({ ...createRuleset("Test"), ...overrides });
}

describe("formatRows", () => {
  it("is empty when the ruleset has no listBuilding block", () => {
    expect(formatRows(createRuleset("Bare"))).toEqual([]);
  });

  it("lists one cap entry per declared resource, null when the format sets none", () => {
    const rs = rulesetWith({
      listBuilding: {
        resources: [
          { id: "pointsaaaa", name: "Points", cap: { type: "none" } },
          { id: "cpaaaaaaaa", name: "Command Points", cap: { type: "fixed", value: 12 } },
        ],
        formats: [{ id: "patrolaaaa", name: "Patrol", resourceCaps: { pointsaaaa: 500 } }],
      },
    });
    const [patrol] = formatRows(rs);
    expect(patrol.caps).toEqual([
      {
        resourceId: "pointsaaaa",
        resourceName: "Points",
        value: 500,
        resourceCapType: "none",
        resourceFixedValue: 0,
      },
      {
        resourceId: "cpaaaaaaaa",
        resourceName: "Command Points",
        value: null,
        resourceCapType: "fixed",
        resourceFixedValue: 12,
      },
    ]);
  });

  it("counts only the author's own list constraints, not generated cap constraints", () => {
    const rs = rulesetWith({
      listBuilding: {
        resources: [{ id: "pointsaaaa", name: "Points", cap: { type: "none" } }],
        formats: [
          {
            id: "onslaughtx",
            name: "Onslaught",
            constraints: [
              {
                kind: "limit",
                generatedFor: { resourceId: "pointsaaaa" },
                metric: { op: "costSum", selector: { type: "all" }, resourceId: "pointsaaaa" },
                max: { op: "resourceLimit", resourceId: "pointsaaaa" },
              },
              {
                kind: "limit",
                metric: { op: "count", selector: { type: "all" } },
                max: { op: "constant", value: 6 },
              },
            ],
          },
        ],
      },
    });
    expect(formatRows(rs)[0].listConstraintCount).toBe(1);
  });
});
