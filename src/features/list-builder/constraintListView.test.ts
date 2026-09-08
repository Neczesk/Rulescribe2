import { describe, expect, it } from "vitest";
import { constraintDef, listBuilding, nodeDef } from "../../core/schema/listBuilding";
import { createRuleset } from "../../core/schema/createRuleset";
import type { Ruleset } from "../../core/schema/ruleset";
import { constraintListView } from "./constraintListView";

const PTS = "pts0000000";

function rulesetWithNodeConstraints(constraints: unknown[]): Ruleset {
  const rs = createRuleset("Test");
  return {
    ...rs,
    registry: {
      ...rs.registry,
      nodeDefs: {
        army000000: {
          ...nodeDef.parse({ id: "army000000", name: "Army" }),
          constraints: constraints.map((c) => constraintDef.parse(c)),
        },
      },
    },
    listBuilding: listBuilding.parse({
      resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
    }),
  };
}

describe("constraintListView", () => {
  it("summarises each constraint with describeConstraint text and severity", () => {
    const rs = rulesetWithNodeConstraints([
      {
        kind: "limit",
        severity: "warning",
        metric: { op: "count", selector: { type: "all" } },
        max: { op: "constant", value: 3 },
      },
    ]);
    const rows = constraintListView(rs, { kind: "nodeDef", id: "army000000" });
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toContain("must be at most 3");
    expect(rows[0].severity).toBe("warning");
    expect(rows[0].isGenerated).toBe(false);
  });

  it("flags a constraint that lints as an error", () => {
    const rs = rulesetWithNodeConstraints([
      {
        kind: "limit",
        metric: {
          op: "divide",
          operands: [
            { op: "constant", value: 1 },
            { op: "constant", value: 0 },
          ],
        },
        max: { op: "constant", value: 1 },
      },
    ]);
    const rows = constraintListView(rs, { kind: "nodeDef", id: "army000000" });
    expect(rows[0].hasLintError).toBe(true);
  });

  it("marks a format's generated resource-cap constraint", () => {
    const rs = createRuleset("Test");
    const withFormat: Ruleset = {
      ...rs,
      listBuilding: listBuilding.parse({
        resources: [{ id: PTS, name: "Points", cap: { type: "fixed", value: 0 } }],
        formats: [
          {
            id: "fmt0000001",
            name: "Combined Arms",
            constraints: [
              {
                id: "cgen000001",
                kind: "limit",
                metric: { op: "costSum", selector: { type: "all" }, resourceId: PTS },
                max: { op: "resourceLimit", resourceId: PTS },
                generatedFor: { resourceId: PTS },
              },
            ],
          },
        ],
      }),
    };
    const rows = constraintListView(withFormat, { kind: "format", id: "fmt0000001" });
    expect(rows[0].isGenerated).toBe(true);
  });
});
