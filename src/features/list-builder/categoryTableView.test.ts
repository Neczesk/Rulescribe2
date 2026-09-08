import { describe, expect, it } from "vitest";
import { createRuleset } from "../../core/schema/createRuleset";
import { ruleset as rulesetSchema } from "../../core/schema/ruleset";
import { categoryTableView } from "./categoryTableView";

function rulesetWith(listBuilding: Record<string, unknown>, registry?: Record<string, unknown>) {
  const base = createRuleset("Test");
  return rulesetSchema.parse({
    ...base,
    registry: { ...base.registry, ...registry },
    listBuilding,
  });
}

describe("categoryTableView", () => {
  it("returns null for an unknown category or a ruleset with no listBuilding", () => {
    expect(categoryTableView(createRuleset("Bare"), "nope000000")).toBeNull();
  });

  it("builds Name + a cost column per resource + a column per field for a node category", () => {
    const rs = rulesetWith({
      resources: [
        { id: "points0000", name: "Points", cap: { type: "none" } },
        { id: "cp00000000", name: "CP", cap: { type: "none" } },
      ],
      categories: [
        {
          id: "unit000000",
          name: "Unit",
          kind: "node",
          fields: [
            {
              id: "role000000",
              name: "Role",
              type: "singleValue",
              optionSource: "freeform",
              options: ["Core", "Rare"],
            },
            { id: "unique0000", name: "Unique", type: "boolean" },
          ],
        },
      ],
    });

    const view = categoryTableView(rs, "unit000000")!;
    expect(view.columns.map((c) => [c.kind, c.key, c.label, c.align])).toEqual([
      ["name", "name", "Name", "left"],
      ["cost", "cost:points0000", "Points", "right"],
      ["cost", "cost:cp00000000", "CP", "right"],
      ["field", "field:role000000", "Role", "left"],
      ["field", "field:unique0000", "Unique", "center"],
    ]);
    expect(view.columns[3].choices).toEqual([
      { value: "Core", label: "Core" },
      { value: "Rare", label: "Rare" },
    ]);
    expect(view.itemNoun).toBe("node type");
  });

  it("omits cost columns for a record category and reads rows from categoryRecords", () => {
    const rs = rulesetWith(
      {
        resources: [{ id: "points0000", name: "Points", cap: { type: "none" } }],
        categories: [
          {
            id: "fact000000",
            name: "Faction",
            kind: "record",
            fields: [{ id: "short00000", name: "Short name", type: "text" }],
          },
        ],
      },
      {
        categoryRecords: {
          empire0000: {
            id: "empire0000",
            name: "Empire of Man",
            categoryId: "fact000000",
            values: { short00000: "Empire" },
          },
          other00000: { id: "other00000", name: "Elsewhere", categoryId: "zzz0000000", values: {} },
        },
      },
    );

    const view = categoryTableView(rs, "fact000000")!;
    expect(view.columns.map((c) => c.kind)).toEqual(["name", "field"]);
    expect(view.rows).toEqual([
      { id: "empire0000", name: "Empire of Man", cells: { "field:short00000": "Empire" } },
    ]);
  });

  it("resolves reference columns to the target category's records", () => {
    const rs = rulesetWith(
      {
        categories: [
          { id: "fact000000", name: "Faction", kind: "record" },
          {
            id: "unit000000",
            name: "Unit",
            kind: "node",
            fields: [
              {
                id: "avail00000",
                name: "Available to",
                type: "reference",
                categoryId: "fact000000",
              },
            ],
          },
        ],
      },
      {
        categoryRecords: {
          empire0000: {
            id: "empire0000",
            name: "Empire of Man",
            categoryId: "fact000000",
            values: {},
          },
        },
        nodeDefs: {
          halb000000: {
            id: "halb000000",
            name: "Halberdiers",
            categoryId: "unit000000",
            fields: { avail00000: "empire0000" },
          },
        },
      },
    );

    const view = categoryTableView(rs, "unit000000")!;
    const refCol = view.columns.find((c) => c.fieldType === "reference")!;
    expect(refCol.choices).toEqual([{ value: "empire0000", label: "Empire of Man" }]);
    expect(view.rows[0].cells["field:avail00000"]).toBe("empire0000");
  });
});
