import { describe, expect, it } from "vitest";
import { createRuleset } from "../../core/schema/createRuleset";
import { ruleset as rulesetSchema } from "../../core/schema/ruleset";
import { categoryEditorView } from "./categoryEditorView";

function rulesetWith(listBuilding: Record<string, unknown>, registry?: Record<string, unknown>) {
  const base = createRuleset("Test");
  return rulesetSchema.parse({
    ...base,
    registry: { ...base.registry, ...registry },
    listBuilding,
  });
}

describe("categoryEditorView", () => {
  it("returns null for an unknown category", () => {
    expect(categoryEditorView(createRuleset("Bare"), "nope000000")).toBeNull();
  });

  it("summarises each field type in the collapsed detail line", () => {
    const rs = rulesetWith({
      categories: [
        { id: "factxxxxxx", name: "Faction", kind: "record" },
        {
          id: "weapxxxxxx",
          name: "Weapon",
          kind: "node",
          fields: [
            { id: "rangexxxxx", name: "Range", type: "number" },
            {
              id: "classxxxxx",
              name: "Class",
              type: "singleValue",
              optionSource: "freeform",
              options: ["Melee", "Missile"],
            },
            {
              id: "ruleskxxxx",
              name: "Rules",
              type: "multiValue",
              optionSource: "keywordRegistry",
            },
            {
              id: "availxxxxx",
              name: "Available to",
              type: "reference",
              categoryId: "factxxxxxx",
              multiple: true,
            },
          ],
        },
      ],
    });

    const view = categoryEditorView(rs, "weapxxxxxx")!;
    expect(view.fields.map((f) => [f.typeLabel, f.detail])).toEqual([
      ["Number", ""],
      ["One of a list", "2 allowed values"],
      ["Several of a list", "keyword registry"],
      ["Reference", "Faction · several"],
    ]);
  });

  it("offers only record-kind categories (not itself) as reference targets", () => {
    const rs = rulesetWith({
      categories: [
        { id: "factxxxxxx", name: "Faction", kind: "record" },
        { id: "subfxxxxxx", name: "Subfaction", kind: "record" },
        { id: "unitxxxxxx", name: "Unit", kind: "node" },
      ],
    });
    const view = categoryEditorView(rs, "factxxxxxx")!;
    expect(view.referenceTargets.map((t) => t.name)).toEqual(["Subfaction"]);
  });

  it("splits fields into groups (members in field order) and an ungrouped remainder", () => {
    const rs = rulesetWith({
      categories: [
        {
          id: "modelxxxxx",
          name: "Model",
          kind: "node",
          fields: [
            { id: "mvxxxxxxxx", name: "Mv", type: "number" },
            { id: "pointsxxxx", name: "Points", type: "number" },
            { id: "wsxxxxxxxx", name: "WS", type: "number" },
          ],
          fieldGroups: [
            // fieldIds deliberately out of field order — the view re-sorts to field order
            {
              id: "profxxxxxx",
              name: "Profile",
              layout: "row",
              fieldIds: ["wsxxxxxxxx", "mvxxxxxxxx"],
            },
          ],
        },
      ],
    });

    const view = categoryEditorView(rs, "modelxxxxx")!;
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0].fields.map((f) => f.id)).toEqual(["mvxxxxxxxx", "wsxxxxxxxx"]);
    expect(view.ungroupedFields.map((f) => f.id)).toEqual(["pointsxxxx"]);
    expect(view.fields.find((f) => f.id === "mvxxxxxxxx")?.groupId).toBe("profxxxxxx");
    expect(view.fields.find((f) => f.id === "pointsxxxx")?.groupId).toBeUndefined();
  });

  it("counts instances by the category kind", () => {
    const rs = rulesetWith(
      { categories: [{ id: "unitxxxxxx", name: "Unit", kind: "node" }] },
      {
        nodeDefs: {
          aaaaaaaaaa: { id: "aaaaaaaaaa", categoryId: "unitxxxxxx" },
          bbbbbbbbbb: { id: "bbbbbbbbbb", categoryId: "unitxxxxxx" },
          cccccccccc: { id: "cccccccccc" },
        },
      },
    );
    const view = categoryEditorView(rs, "unitxxxxxx")!;
    expect(view.instanceCount).toBe(2);
    expect(view.instanceNoun).toBe("node types");
  });
});
