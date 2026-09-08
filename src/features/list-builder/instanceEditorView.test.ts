import { describe, expect, it } from "vitest";
import { createRuleset } from "../../core/schema/createRuleset";
import { ruleset as rulesetSchema } from "../../core/schema/ruleset";
import { instanceEditorView } from "./instanceEditorView";

function rulesetWith(listBuilding: Record<string, unknown>, registry?: Record<string, unknown>) {
  const base = createRuleset("Test");
  return rulesetSchema.parse({
    ...base,
    registry: { ...base.registry, ...registry },
    listBuilding,
  });
}

const PTS = "pts0000000";

describe("instanceEditorView — node types", () => {
  it("returns null for an unknown node id", () => {
    expect(instanceEditorView(createRuleset("Bare"), "nodeDef", "nope000000")).toBeNull();
  });

  it("resolves the category, field + cost rows, and set values", () => {
    const rs = rulesetWith(
      {
        resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
        categories: [
          {
            id: "modelcatx0",
            name: "Model",
            kind: "node",
            fields: [
              { id: "wsxxxxxxxx", name: "WS", type: "number" },
              {
                id: "rolexxxxx0",
                name: "Role",
                type: "singleValue",
                optionSource: "freeform",
                options: ["Core", "Special"],
              },
            ],
          },
        ],
      },
      {
        nodeDefs: {
          halbxxxxx0: {
            id: "halbxxxxx0",
            name: "Halberdier",
            categoryId: "modelcatx0",
            baseCosts: { [PTS]: 6 },
            fields: { rolexxxxx0: "Core" },
          },
        },
      },
    );

    const view = instanceEditorView(rs, "nodeDef", "halbxxxxx0")!;
    expect(view.noun).toBe("node type");
    expect(view.name).toBe("Halberdier");
    expect(view.categoryName).toBe("Model");
    expect(view.fieldRows.map((r) => r.column.kind)).toEqual(["cost", "field", "field"]);
    expect(view.fieldRows.find((r) => r.column.kind === "cost")?.value).toBe(6);
    expect(view.fieldRows.find((r) => r.column.fieldId === "rolexxxxx0")?.value).toBe("Core");
    expect(view.baseCostSummary).toBe("Points 6");
  });

  it("handles a node with no category", () => {
    const rs = rulesetWith(
      { categories: [] },
      { nodeDefs: { lonexxxxx0: { id: "lonexxxxx0", name: "Loner" } } },
    );
    const view = instanceEditorView(rs, "nodeDef", "lonexxxxx0")!;
    expect(view.category).toBeNull();
    expect(view.categoryName).toBe("No category");
    expect(view.fieldRows).toEqual([]);
    expect(view.inheritedConstraints).toEqual([]);
  });
});

describe("instanceEditorView — records", () => {
  it("reads values from record.values and emits no cost rows", () => {
    const rs = rulesetWith(
      {
        categories: [
          {
            id: "factcatxx0",
            name: "Faction",
            kind: "record",
            fields: [{ id: "motxxxxxx0", name: "Motto", type: "text" }],
            constraints: [
              {
                id: "cinh000001",
                kind: "limit",
                severity: "warning",
                metric: { op: "count", selector: { type: "all" } },
                max: { op: "constant", value: 2 },
              },
            ],
          },
        ],
      },
      {
        categoryRecords: {
          empirxxxx0: {
            id: "empirxxxx0",
            name: "Empire",
            categoryId: "factcatxx0",
            values: { motxxxxxx0: "Sigmar guide us" },
          },
        },
      },
    );

    const view = instanceEditorView(rs, "categoryRecord", "empirxxxx0")!;
    expect(view.noun).toBe("record");
    expect(view.name).toBe("Empire");
    expect(view.fieldRows.every((r) => r.column.kind === "field")).toBe(true);
    expect(view.fieldRows[0].value).toBe("Sigmar guide us");
    expect(view.baseCostSummary).toBe("");
    expect(view.inheritedConstraints.map((c) => [c.id, c.severity])).toEqual([
      ["cinh000001", "warning"],
    ]);
    expect(view.inheritedConstraints[0].text.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown record id", () => {
    expect(instanceEditorView(createRuleset("Bare"), "categoryRecord", "nope000000")).toBeNull();
  });
});

describe("instanceEditorView — constraint counts + inheritance", () => {
  it("counts only the instance's own non-generated constraints, excludes generated inherited", () => {
    const rs = rulesetWith(
      {
        resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
        categories: [
          {
            id: "unitxxxxx0",
            name: "Unit",
            kind: "node",
            constraints: [
              {
                id: "cerr000001",
                kind: "limit",
                metric: { op: "count", selector: { type: "all" } },
                min: { op: "constant", value: 1 },
              },
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
      },
      {
        nodeDefs: {
          sqxxxxxxx0: {
            id: "sqxxxxxxx0",
            name: "Squad",
            categoryId: "unitxxxxx0",
            constraints: [
              {
                id: "cown000001",
                kind: "limit",
                metric: { op: "count", selector: { type: "all" } },
                max: { op: "constant", value: 1 },
              },
            ],
          },
        },
      },
    );

    const view = instanceEditorView(rs, "nodeDef", "sqxxxxxxx0")!;
    expect(view.constraintCount).toBe(1);
    expect(view.inheritedConstraints.map((c) => c.id)).toEqual(["cerr000001"]);
  });
});
