import { beforeEach, describe, expect, it } from "vitest";
import { createRuleset } from "../schema/createRuleset";
import { ruleset as rulesetSchema } from "../schema/ruleset";
import { currentRulesetStore } from "./currentRuleset";

const ID_RE = /^[A-Za-z0-9_-]{10}$/;
const store = () => currentRulesetStore.getState();

beforeEach(() => {
  currentRulesetStore.setState({ ruleset: createRuleset("Test") });
});

describe("resource actions", () => {
  it("addResource lazily creates listBuilding on a ruleset that predates it", () => {
    expect(store().ruleset?.listBuilding).toBeUndefined();

    const id = store().addResource({ name: "Points" });

    expect(id).toMatch(ID_RE);
    const lb = store().ruleset?.listBuilding;
    expect(lb?.resources).toEqual([{ id, name: "Points", cap: { type: "none" } }]);
    expect(lb).toMatchObject({ categories: [], formats: [], fields: [] });
  });

  it("addResource appends to an existing block", () => {
    const first = store().addResource({ name: "Points" });
    const second = store().addResource({ name: "Command Points" });
    expect(store().ruleset?.listBuilding?.resources.map((r) => r.id)).toEqual([first, second]);
  });

  it("updateResource patches name and cap by id", () => {
    const id = store().addResource()!;
    store().updateResource(id, { name: "Command Points", cap: { type: "fixed", value: 12 } });
    expect(store().ruleset?.listBuilding?.resources[0]).toEqual({
      id,
      name: "Command Points",
      cap: { type: "fixed", value: 12 },
    });
  });

  it("updateResource / deleteResource ignore an unknown id without touching state", () => {
    store().addResource({ name: "Points" });
    const before = store().ruleset;
    store().updateResource("zzzzzzzzzz", { name: "x" });
    store().deleteResource("zzzzzzzzzz");
    expect(store().ruleset).toBe(before);
  });

  it("deleteResource removes only the named resource", () => {
    const a = store().addResource({ name: "A" })!;
    const b = store().addResource({ name: "B" })!;
    store().deleteResource(a);
    expect(store().ruleset?.listBuilding?.resources.map((r) => r.id)).toEqual([b]);
  });
});

const generatedFor = (formatId: string) =>
  (
    store().ruleset?.listBuilding?.formats.find((f) => f.id === formatId)?.constraints ?? []
  ).flatMap((c) => (c.generatedFor ? [c.generatedFor.resourceId] : []));

describe("format actions", () => {
  it("addFormat lazily creates listBuilding and a generated cap constraint per resource", () => {
    const points = store().addResource({ name: "Points" })!;
    const cp = store().addResource({ name: "Command Points" })!;

    const formatId = store().addFormat({ name: "Patrol" })!;

    expect(formatId).toMatch(ID_RE);
    const format = store().ruleset?.listBuilding?.formats[0];
    expect(format).toMatchObject({ id: formatId, name: "Patrol", resourceCaps: {} });
    expect(generatedFor(formatId).sort()).toEqual([cp, points].sort());
  });

  it("adding a resource after a format backfills that format's generated constraints", () => {
    const points = store().addResource({ name: "Points" })!;
    const formatId = store().addFormat({ name: "Strike Force" })!;
    expect(generatedFor(formatId)).toEqual([points]);

    const cp = store().addResource({ name: "Command Points" })!;
    expect(generatedFor(formatId).sort()).toEqual([cp, points].sort());

    store().deleteResource(points);
    expect(generatedFor(formatId)).toEqual([cp]);
  });

  it("updateFormat patches name and resourceCaps by id", () => {
    const points = store().addResource({ name: "Points" })!;
    const formatId = store().addFormat({ name: "x" })!;
    store().updateFormat(formatId, { name: "Onslaught", resourceCaps: { [points]: 2000 } });
    const format = store().ruleset?.listBuilding?.formats[0];
    expect(format).toMatchObject({ name: "Onslaught", resourceCaps: { [points]: 2000 } });
  });

  it("deleteFormat removes only the named format; unknown ids are no-ops", () => {
    const a = store().addFormat({ name: "A" })!;
    const b = store().addFormat({ name: "B" })!;
    const before = store().ruleset;
    store().updateFormat("zzzzzzzzzz", { name: "x" });
    store().deleteFormat("zzzzzzzzzz");
    expect(store().ruleset).toBe(before);
    store().deleteFormat(a);
    expect(store().ruleset?.listBuilding?.formats.map((f) => f.id)).toEqual([b]);
  });
});

const categoryFields = (categoryId: string) =>
  store().ruleset?.listBuilding?.categories.find((c) => c.id === categoryId)?.fields ?? [];

describe("category actions", () => {
  it("addCategory lazily creates listBuilding and defaults kind to node", () => {
    const nodeCat = store().addCategory({ name: "Weapon" });
    const recCat = store().addCategory({ name: "Faction", kind: "record" });

    expect(nodeCat).toMatch(ID_RE);
    const cats = store().ruleset?.listBuilding?.categories ?? [];
    expect(cats.map((c) => [c.name, c.kind])).toEqual([
      ["Weapon", "node"],
      ["Faction", "record"],
    ]);
    expect(cats[0]).toMatchObject({ description: "", fields: [], constraints: [] });
    expect(recCat).toMatch(ID_RE);
  });

  it("updateCategory patches name / kind / description by id", () => {
    const id = store().addCategory({ name: "x" })!;
    store().updateCategory(id, { name: "Unit", kind: "record", description: "A regiment." });
    expect(store().ruleset?.listBuilding?.categories[0]).toMatchObject({
      name: "Unit",
      kind: "record",
      description: "A regiment.",
    });
  });

  it("deleteCategory removes it and clears categoryId on instances that pointed at it", () => {
    const base = createRuleset("Test");
    currentRulesetStore.setState({
      ruleset: rulesetSchema.parse({
        ...base,
        registry: {
          ...base.registry,
          nodeDefs: {
            n1aaaaaaaa: { id: "n1aaaaaaaa", categoryId: "catxxxxxxx" },
            n2aaaaaaaa: { id: "n2aaaaaaaa", categoryId: "other00000" },
          },
          categoryRecords: {
            r1aaaaaaaa: { id: "r1aaaaaaaa", categoryId: "catxxxxxxx", values: {} },
          },
        },
        listBuilding: { categories: [{ id: "catxxxxxxx", name: "Doomed", kind: "node" }] },
      }),
    });

    store().deleteCategory("catxxxxxxx");

    expect(store().ruleset?.listBuilding?.categories).toEqual([]);
    expect(store().ruleset?.registry.nodeDefs.n1aaaaaaaa.categoryId).toBeUndefined();
    expect(store().ruleset?.registry.nodeDefs.n2aaaaaaaa.categoryId).toBe("other00000");
    expect(store().ruleset?.registry.categoryRecords.r1aaaaaaaa.categoryId).toBeUndefined();
  });

  it("adds, patches, reorders and deletes fields on a category", () => {
    const id = store().addCategory({ name: "Weapon" })!;
    const range = store().addCategoryField(id, { type: "number" })!;
    const rules = store().addCategoryField(id, { type: "multiValue" })!;

    expect(categoryFields(id).map((f) => [f.id, f.type])).toEqual([
      [range, "number"],
      [rules, "multiValue"],
    ]);

    store().updateCategoryField(id, range, { name: "Range" });
    expect(categoryFields(id)[0].name).toBe("Range");

    store().moveCategoryField(id, rules, "up");
    expect(categoryFields(id).map((f) => f.id)).toEqual([rules, range]);
    store().moveCategoryField(id, rules, "up"); // already first — no-op
    expect(categoryFields(id).map((f) => f.id)).toEqual([rules, range]);

    store().deleteCategoryField(id, rules);
    expect(categoryFields(id).map((f) => f.id)).toEqual([range]);
  });

  it("field ops on an unknown category or field are no-ops", () => {
    const id = store().addCategory({ name: "Weapon" })!;
    const before = store().ruleset;
    store().addCategoryField("zzzzzzzzzz", { type: "text" });
    store().updateCategoryField(id, "nofieldxxx", { name: "x" });
    store().deleteCategoryField(id, "nofieldxxx");
    store().moveCategoryField(id, "nofieldxxx", "down");
    expect(store().ruleset).toBe(before);
  });

  it("reorderCategoryFields applies a permutation and rejects anything else", () => {
    const id = store().addCategory({ name: "Weapon" })!;
    const a = store().addCategoryField(id)!;
    const b = store().addCategoryField(id)!;
    const c = store().addCategoryField(id)!;

    store().reorderCategoryFields(id, [c, a, b]);
    expect(categoryFields(id).map((f) => f.id)).toEqual([c, a, b]);

    const before = store().ruleset;
    store().reorderCategoryFields(id, [c, a]); // wrong length
    store().reorderCategoryFields(id, [c, a, "zzzzzzzzzz"]); // unknown id
    store().reorderCategoryFields(id, [c, a, b]); // same order
    expect(store().ruleset).toBe(before);
  });

  it("duplicateCategory deep-copies with fresh ids and remapped groups", () => {
    const id = store().addCategory({ name: "Weapon", kind: "node" })!;
    store().updateCategory(id, { description: "Any weapon." });
    const f1 = store().addCategoryField(id, { type: "number" })!;
    const f2 = store().addCategoryField(id, { type: "text" })!;
    const g = store().addFieldGroup(id, { name: "Profile" })!;
    store().setFieldGroup(id, f1, g);

    const copyId = store().duplicateCategory(id)!;
    const cats = store().ruleset!.listBuilding!.categories;
    expect(cats.map((c) => c.id)).toEqual([id, copyId]); // inserted right after

    const copy = cats[1];
    expect(copy).toMatchObject({ name: "Weapon (copy)", kind: "node", description: "Any weapon." });
    expect(copy.fields.map((f) => f.id)).not.toContain(f1);
    expect(copy.fields.map((f) => f.id)).not.toContain(f2);
    expect(copy.fields.map((f) => f.type)).toEqual(["number", "text"]);
    // group remapped to the copy's own field id
    expect(copy.fieldGroups).toHaveLength(1);
    expect(copy.fieldGroups[0].id).not.toBe(g);
    expect(copy.fieldGroups[0].fieldIds).toEqual([copy.fields[0].id]);
  });

  it("manages field groups: add, rename, assign, move-between, delete", () => {
    const id = store().addCategory({ name: "Model" })!;
    const mv = store().addCategoryField(id)!;
    const ws = store().addCategoryField(id)!;
    const g1 = store().addFieldGroup(id, { name: "Profile" })!;
    const g2 = store().addFieldGroup(id)!;

    store().updateFieldGroup(id, g2, { name: "Stats", layout: "row" });
    const groups = () =>
      store().ruleset!.listBuilding!.categories.find((c) => c.id === id)!.fieldGroups;
    expect(groups().map((x) => [x.name, x.layout])).toEqual([
      ["Profile", "stacked"],
      ["Stats", "row"],
    ]);

    store().setFieldGroup(id, mv, g1);
    store().setFieldGroup(id, ws, g1);
    expect(groups()[0].fieldIds).toEqual([mv, ws]);

    // moving ws to g2 removes it from g1
    store().setFieldGroup(id, ws, g2);
    expect(groups()[0].fieldIds).toEqual([mv]);
    expect(groups()[1].fieldIds).toEqual([ws]);

    // ungroup
    store().setFieldGroup(id, mv, null);
    expect(groups()[0].fieldIds).toEqual([]);

    // deleting a group leaves the fields alone
    store().deleteFieldGroup(id, g2);
    expect(groups().map((x) => x.id)).toEqual([g1]);
    expect(categoryFields(id).map((f) => f.id)).toEqual([mv, ws]);
  });
});

const nodeDefs = () => store().ruleset?.registry.nodeDefs ?? {};
const records = () => store().ruleset?.registry.categoryRecords ?? {};

describe("list-builder instance actions", () => {
  it("creates, names, values, costs and deletes a NodeDef", () => {
    const id = store().addNodeDef({ categoryId: "unit000000", name: "Halberdiers" })!;
    expect(id).toMatch(ID_RE);
    expect(nodeDefs()[id]).toMatchObject({ name: "Halberdiers", categoryId: "unit000000" });

    store().updateNodeDef(id, { name: "Halberdier Regiment" });
    store().setNodeDefFieldValue(id, "role000000", "Core");
    store().setNodeDefBaseCost(id, "points0000", 90);
    expect(nodeDefs()[id]).toMatchObject({
      name: "Halberdier Regiment",
      fields: { role000000: "Core" },
      baseCosts: { points0000: 90 },
    });

    // undefined clears
    store().setNodeDefFieldValue(id, "role000000", undefined);
    store().setNodeDefBaseCost(id, "points0000", undefined);
    expect(nodeDefs()[id].fields).toEqual({});
    expect(nodeDefs()[id].baseCosts).toEqual({});

    store().deleteNodeDef(id);
    expect(nodeDefs()[id]).toBeUndefined();
  });

  it("creates, names, values and deletes a CategoryRecord", () => {
    const id = store().addCategoryRecord({ categoryId: "fact000000", name: "Empire of Man" })!;
    expect(records()[id]).toMatchObject({
      name: "Empire of Man",
      categoryId: "fact000000",
      values: {},
    });

    store().updateCategoryRecord(id, { name: "The Empire" });
    store().setCategoryRecordValue(id, "short00000", "Empire");
    expect(records()[id]).toMatchObject({ name: "The Empire", values: { short00000: "Empire" } });

    store().deleteCategoryRecord(id);
    expect(records()[id]).toBeUndefined();
  });

  it("instance ops on an unknown id are no-ops", () => {
    store().addNodeDef({ categoryId: "c" });
    const before = store().ruleset;
    store().updateNodeDef("zzzzzzzzzz", { name: "x" });
    store().setNodeDefFieldValue("zzzzzzzzzz", "f", "v");
    store().setNodeDefBaseCost("zzzzzzzzzz", "r", 1);
    store().deleteNodeDef("zzzzzzzzzz");
    store().updateCategoryRecord("zzzzzzzzzz", { name: "x" });
    store().deleteCategoryRecord("zzzzzzzzzz");
    expect(store().ruleset).toBe(before);
  });
});
