import { describe, expect, it } from "vitest";
import {
  categoryDef,
  categoryRecord,
  childSlotDef,
  constraintDef,
  costExpr,
  fieldDef,
  fieldGroupDef,
  formatDef,
  listBuilding,
  nodeDef,
  optionDef,
  resourceCap,
  resourceDef,
} from "./listBuilding";

const ID_RE = /^[A-Za-z0-9_-]{10}$/;
const DOC = { type: "doc", content: [{ type: "paragraph" }] };

describe("resourceDef / resourceCap", () => {
  it("defaults an id, empty name and a `none` cap", () => {
    const r = resourceDef.parse({});
    expect(r.id).toMatch(ID_RE);
    expect(r.name).toBe("");
    expect(r.cap).toEqual({ type: "none" });
  });

  it("parses each cap variant", () => {
    expect(resourceCap.parse({ type: "fixed" })).toEqual({ type: "fixed", value: 0 });
    expect(resourceCap.parse({ type: "fixed", value: 2000 })).toEqual({
      type: "fixed",
      value: 2000,
    });
    expect(resourceCap.parse({ type: "playerChosen" })).toEqual({ type: "playerChosen" });
    expect(resourceCap.parse({ type: "none" })).toEqual({ type: "none" });
  });

  it("rejects an unknown cap type", () => {
    expect(resourceCap.safeParse({ type: "percentage" }).success).toBe(false);
  });
});

describe("fieldDef", () => {
  it("defaults type to text, options to [] and leaves optionSource undefined", () => {
    const f = fieldDef.parse({});
    expect(f.type).toBe("text");
    expect(f.options).toEqual([]);
    expect(f.optionSource).toBeUndefined();
  });
});

describe("costExpr", () => {
  it("parses flat with a defaulted, sign-agnostic amount", () => {
    expect(costExpr.parse({ type: "flat", resourceId: "pts" })).toEqual({
      type: "flat",
      resourceId: "pts",
      amount: 0,
    });
    const flat = costExpr.parse({ type: "flat", resourceId: "pts", amount: -5 });
    if (flat.type === "flat") expect(flat.amount).toBe(-5);
  });

  it("parses perChild, with filter optional", () => {
    const c = costExpr.parse({ type: "perChild", resourceId: "pts", slotId: "models" });
    expect(c).toEqual({ type: "perChild", resourceId: "pts", slotId: "models", amountPerUnit: 0 });
    expect(
      costExpr.safeParse({
        type: "perChild",
        resourceId: "pts",
        slotId: "models",
        filter: { type: "all" },
      }).success,
    ).toBe(true);
  });

  it("rejects an unknown type", () => {
    expect(costExpr.safeParse({ type: "percent", resourceId: "pts" }).success).toBe(false);
  });
});

describe("childSlotDef", () => {
  it("defaults max null, eligibility all, defaults []", () => {
    const s = childSlotDef.parse({});
    expect(s.max).toBeNull();
    expect(s.eligibility).toEqual({ type: "all" });
    expect(s.defaults).toEqual([]);
  });

  it("defaults a slot default's count to 1", () => {
    const s = childSlotDef.parse({ defaults: [{ nodeId: "rifleteam0" }] });
    expect(s.defaults[0]).toEqual({ nodeId: "rifleteam0", count: 1 });
  });
});

describe("optionDef discriminated union", () => {
  it("parses each kind and applies base defaults on a minimal addChild", () => {
    const o = optionDef.parse({ kind: "addChild", slotId: "wargear", addNodeId: "meltabomb0" });
    expect(o.min).toBe(0);
    expect(o.max).toBeNull();
    expect(o.cost).toEqual({ type: "flat", resourceId: "", amount: 0 });

    expect(
      optionDef.safeParse({ kind: "removeChild", slotId: "s", removeNodeId: "n" }).success,
    ).toBe(true);
    expect(
      optionDef.safeParse({ kind: "replaceChild", slotId: "s", addNodeId: "a", removeNodeId: "r" })
        .success,
    ).toBe(true);
    expect(
      optionDef.safeParse({
        kind: "toggleFieldValue",
        fieldId: "kw",
        fieldValue: "Green",
        direction: "remove",
      }).success,
    ).toBe(true);
  });

  it("rejects addChild missing addNodeId", () => {
    expect(optionDef.safeParse({ kind: "addChild", slotId: "wargear" }).success).toBe(false);
  });

  it("rejects toggleFieldValue missing direction", () => {
    expect(
      optionDef.safeParse({ kind: "toggleFieldValue", fieldId: "kw", fieldValue: "Green" }).success,
    ).toBe(false);
  });

  it("rejects an unknown kind", () => {
    expect(optionDef.safeParse({ kind: "renameChild", slotId: "s" }).success).toBe(false);
  });
});

describe("constraintDef re-export", () => {
  // The algebra itself is covered in ./constraint.test.ts; this only asserts
  // that `listBuilding` still surfaces the schema its three embedders use.
  it("accepts a limit and a RichText message override", () => {
    expect(
      constraintDef.safeParse({
        kind: "limit",
        metric: { op: "count", selector: { type: "all" } },
        max: { op: "constant", value: 1 },
        message: DOC,
      }).success,
    ).toBe(true);
  });
});

describe("nodeDef / listBuilding empty-object parse", () => {
  it("nodeDef.parse({}) yields an all-empty node", () => {
    const n = nodeDef.parse({});
    expect(n.id).toMatch(ID_RE);
    expect(n).toMatchObject({
      name: "",
      fields: {},
      baseCosts: {},
      childSlots: [],
      options: [],
      constraints: [],
    });
  });

  it("listBuilding.parse({}) yields four empty arrays", () => {
    expect(listBuilding.parse({})).toEqual({
      resources: [],
      fields: [],
      categories: [],
      formats: [],
    });
  });
});

describe("fieldDef — reference type", () => {
  it("parses type 'reference' with categoryId + multiple", () => {
    const f = fieldDef.parse({
      name: "Faction",
      type: "reference",
      categoryId: "faction000",
      multiple: true,
    });
    expect(f).toMatchObject({ type: "reference", categoryId: "faction000", multiple: true });
  });

  it("leaves categoryId / multiple undefined when omitted", () => {
    const f = fieldDef.parse({ name: "Faction", type: "reference" });
    expect(f.categoryId).toBeUndefined();
    expect(f.multiple).toBeUndefined();
  });
});

describe("fieldDef — articleReference / editableByPlayer / inherited", () => {
  it("parses type 'articleReference', alone and with multiple", () => {
    expect(fieldDef.parse({ name: "Rules Article", type: "articleReference" }).type).toBe(
      "articleReference",
    );
    const multi = fieldDef.parse({
      name: "Rules Article",
      type: "articleReference",
      multiple: true,
    });
    expect(multi).toMatchObject({ type: "articleReference", multiple: true });
  });

  it("leaves editableByPlayer / inherited undefined when omitted, round-trips them when set", () => {
    const bare = fieldDef.parse({ name: "Faction", type: "reference" });
    expect(bare.editableByPlayer).toBeUndefined();
    expect(bare.inherited).toBeUndefined();

    const set = fieldDef.parse({
      name: "Faction",
      type: "reference",
      editableByPlayer: true,
      inherited: true,
    });
    expect(fieldDef.parse(JSON.parse(JSON.stringify(set)))).toEqual(set);
  });

  it("rejects an unknown field type", () => {
    expect(fieldDef.safeParse({ name: "x", type: "hyperlink" }).success).toBe(false);
  });
});

describe("fieldGroupDef", () => {
  it("parse({}) defaults an id, empty name/fieldIds, stacked layout", () => {
    const g = fieldGroupDef.parse({});
    expect(g.id).toMatch(ID_RE);
    expect(g).toMatchObject({ name: "", fieldIds: [], layout: "stacked" });
  });

  it("rejects an unknown layout", () => {
    expect(fieldGroupDef.safeParse({ layout: "grid" }).success).toBe(false);
  });
});

describe("categoryDef / categoryRecord", () => {
  it("categoryDef.parse({}) yields an all-empty category, kind defaulting to node", () => {
    const c = categoryDef.parse({});
    expect(c.id).toMatch(ID_RE);
    expect(c).toMatchObject({
      name: "",
      kind: "node",
      description: "",
      fields: [],
      fieldGroups: [],
      constraints: [],
    });
  });

  it("categoryDef accepts kind 'record' and rejects any other kind", () => {
    expect(categoryDef.parse({ kind: "record" }).kind).toBe("record");
    expect(categoryDef.safeParse({ kind: "detachment" }).success).toBe(false);
  });

  it("round-trips a category carrying fieldGroups", () => {
    const original = categoryDef.parse({
      name: "Profile",
      fields: [
        { id: "mvxxxxxxxx", name: "Mv" },
        { id: "sxxxxxxxxx", name: "S" },
      ],
      fieldGroups: [
        {
          id: "profxxxxxx",
          name: "Profile",
          fieldIds: ["mvxxxxxxxx", "sxxxxxxxxx"],
          layout: "row",
        },
      ],
    });
    expect(categoryDef.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });

  it("categoryRecord defaults values {} and constraints []", () => {
    const r = categoryRecord.parse({ categoryId: "faction000" });
    expect(r.id).toMatch(ID_RE);
    expect(r).toMatchObject({ name: "", categoryId: "faction000", values: {}, constraints: [] });
  });

  it("rejects a categoryRecord with no categoryId", () => {
    expect(categoryRecord.safeParse({}).success).toBe(false);
  });

  it("round-trips a record carrying values and a constraint", () => {
    const original = categoryRecord.parse({
      categoryId: "faction000",
      values: { name: "Empire", characterCapPct: 25 },
      constraints: [
        {
          kind: "limit",
          max: { op: "constant", value: 1 },
          metric: {
            op: "count",
            selector: { type: "nodeCategory", categoryId: "hq0000000" },
          },
        },
      ],
    });
    expect(categoryRecord.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});

describe("formatDef — constraints", () => {
  it("defaults constraints to []", () => {
    expect(formatDef.parse({}).constraints).toEqual([]);
  });

  it("accepts a partitioned limit in a format", () => {
    const f = formatDef.parse({
      name: "Combined Arms",
      constraints: [
        {
          kind: "limit",
          max: { op: "constant", value: 6 },
          perPartition: { key: { type: "nodeDefId" } },
          metric: {
            op: "count",
            selector: { type: "nodeCategory", categoryId: "unit000000" },
          },
        },
      ],
    });
    expect(f.constraints).toHaveLength(1);
  });
});

describe("nodeDef round-trip", () => {
  it("survives JSON.stringify -> parse with populated slots, options and constraints", () => {
    const original = nodeDef.parse({
      name: "Rifle Platoon",
      fields: { role: "Troops", keywords: ["Infantry", "Order"] },
      baseCosts: { pts: 0 },
      childSlots: [
        {
          name: "Teams",
          min: 2,
          max: 5,
          eligibility: { type: "nodeDefId", ids: ["rifleteam00"] },
          defaults: [{ nodeId: "rifleteam00", count: 3 }],
        },
      ],
      options: [
        {
          kind: "addChild",
          name: "Attach HQ",
          slotId: "teams00000",
          addNodeId: "hqteam0000",
          cost: { type: "flat", resourceId: "pts", amount: 25 },
        },
        {
          kind: "toggleFieldValue",
          name: "Drop Order",
          fieldId: "keywords00",
          fieldValue: "Order",
          direction: "remove",
          cost: { type: "perChild", resourceId: "pts", amountPerUnit: -2, slotId: "teams00000" },
        },
      ],
      constraints: [
        {
          kind: "limit",
          max: { op: "constant", value: 1 },
          metric: { op: "count", selector: { type: "nodeDefId", ids: ["hqteam0000"] } },
        },
        {
          kind: "require",
          when: {
            op: "compare",
            left: { op: "count", selector: { type: "optionTaken", optionId: "attachhq00" } },
            cmp: "gte",
            right: { op: "constant", value: 1 },
          },
          condition: {
            op: "compare",
            left: { op: "count", selector: { type: "nodeDefId", ids: ["rifleteam00"] } },
            cmp: "gte",
            right: { op: "constant", value: 1 },
          },
        },
      ],
    });
    const revived = nodeDef.parse(JSON.parse(JSON.stringify(original)));
    expect(revived).toEqual(original);
  });
});
