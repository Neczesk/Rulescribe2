import { describe, expect, it } from "vitest";
import { nodeDef, type NodeDef } from "../schema/listBuilding";
import type { AppliedOption, SelectionEntry } from "../schema/selection";
import { evaluateSelector } from "./selectorEval";

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
  appliedOptions: AppliedOption[] = [],
  slotId = "s",
): SelectionEntry => ({ kind: "instance", slotId, instanceId, defId, children, appliedOptions });

const nodeDefs: Record<string, NodeDef> = {
  squad00000: nodeDef.parse({
    id: "squad00000",
    fields: { role: "Troops", keywords: ["Infantry", "Order"], wounds: 1 },
  }),
  charact000: nodeDef.parse({ id: "charact000", fields: { role: "HQ", wounds: 5 } }),
  meltagun00: nodeDef.parse({
    id: "meltagun00",
    options: [
      {
        id: "hotshot000",
        kind: "toggleFieldValue",
        fieldId: "keywords",
        fieldValue: "HotShot",
        direction: "add",
      },
    ],
  }),
};
const ctx = { nodeDefs };

const tree: SelectionEntry[] = [
  i("aaaaaaaaaa", "squad00000", [
    g("meltagun00", 2),
    i("bbbbbbbbbb", "meltagun00", [], [{ optionId: "hotshot000" }]),
  ]),
  g("charact000", 1),
];

describe("evaluateSelector", () => {
  it("`all` counts every entry, groups contributing their count", () => {
    expect(evaluateSelector({ type: "all" }, tree, ctx).count).toBe(5);
  });

  it("stops at direct children when deep:false", () => {
    expect(evaluateSelector({ type: "all" }, tree, ctx, { deep: false }).count).toBe(2);
  });

  it("matches nodeDefId across nesting", () => {
    expect(evaluateSelector({ type: "nodeDefId", ids: ["meltagun00"] }, tree, ctx).count).toBe(3);
  });

  it("matches fieldEquals / fieldCompare against NodeDef.fields", () => {
    expect(
      evaluateSelector({ type: "fieldEquals", fieldId: "role", value: "HQ" }, tree, ctx).count,
    ).toBe(1);
    expect(
      evaluateSelector({ type: "fieldCompare", fieldId: "wounds", op: "gte", value: 5 }, tree, ctx)
        .count,
    ).toBe(1);
  });

  it("matches fieldIncludes on a multiValue field", () => {
    expect(
      evaluateSelector({ type: "fieldIncludes", fieldId: "keywords", value: "Order" }, tree, ctx)
        .count,
    ).toBe(1);
  });

  it("matches optionTaken on an instance but never on a group", () => {
    const r = evaluateSelector({ type: "optionTaken", optionId: "hotshot000" }, tree, ctx);
    expect(r.count).toBe(1);
    expect(r.instances.map((x) => x.instanceId)).toEqual(["bbbbbbbbbb"]);
  });

  it("sees a toggleFieldValue-added keyword via effectiveFields", () => {
    expect(
      evaluateSelector({ type: "fieldIncludes", fieldId: "keywords", value: "HotShot" }, tree, ctx)
        .count,
    ).toBe(1);
  });

  it("combines with and / or / not", () => {
    expect(
      evaluateSelector(
        {
          type: "and",
          selectors: [
            { type: "nodeDefId", ids: ["meltagun00"] },
            { type: "not", selector: { type: "optionTaken", optionId: "hotshot000" } },
          ],
        },
        tree,
        ctx,
      ).count,
    ).toBe(2);
    expect(
      evaluateSelector(
        {
          type: "or",
          selectors: [
            { type: "nodeDefId", ids: ["charact000"] },
            { type: "nodeDefId", ids: ["squad00000"] },
          ],
        },
        tree,
        ctx,
      ).count,
    ).toBe(2);
  });
});

describe("evaluateSelector — nodeCategory", () => {
  const nd: Record<string, NodeDef> = {
    swordsmen0: nodeDef.parse({ id: "swordsmen0", categoryId: "unit000000" }),
    knights000: nodeDef.parse({ id: "knights000", categoryId: "unit000000" }),
    greatsword: nodeDef.parse({ id: "greatsword", categoryId: "weapon0000" }),
    untagged00: nodeDef.parse({ id: "untagged00" }),
  };
  const cat = { nodeDefs: nd };
  const roster: SelectionEntry[] = [
    i("aaaaaaaaaa", "swordsmen0", [g("knights000", 2), g("greatsword", 3), g("untagged00", 1)]),
  ];

  it("matches every node in the category across nesting, groups included", () => {
    expect(
      evaluateSelector({ type: "nodeCategory", categoryId: "unit000000" }, roster, cat).count,
    ).toBe(3);
  });

  it("does not match a different category or an untagged NodeDef", () => {
    expect(
      evaluateSelector({ type: "nodeCategory", categoryId: "weapon0000" }, roster, cat).count,
    ).toBe(3);
    expect(
      evaluateSelector({ type: "nodeCategory", categoryId: "missing000" }, roster, cat).count,
    ).toBe(0);
  });
});

describe("evaluateSelector — partitionKey", () => {
  const nd: Record<string, NodeDef> = {
    troops0000: nodeDef.parse({ id: "troops0000", fields: { role: "core" } }),
    knights000: nodeDef.parse({ id: "knights000", fields: { role: "special" } }),
  };
  const c = { nodeDefs: nd };
  const roster: SelectionEntry[] = [g("troops0000", 10), g("knights000", 4)];

  it("buckets matches by nodeDefId, groups keeping their count", () => {
    const r = evaluateSelector({ type: "all" }, roster, c, {
      partitionKey: (cand) => cand.defId,
    });
    expect(r.count).toBe(14);
    expect([...(r.partitions ?? [])].map(([k, v]) => [k, v.count]).sort()).toEqual([
      ["knights000", 4],
      ["troops0000", 10],
    ]);
  });

  it("buckets by a field value", () => {
    const r = evaluateSelector({ type: "all" }, roster, c, {
      partitionKey: (cand) => (cand.fields.role == null ? null : String(cand.fields.role)),
    });
    expect([...(r.partitions ?? [])].map(([k, v]) => [k, v.count]).sort()).toEqual([
      ["core", 10],
      ["special", 4],
    ]);
  });

  it("buckets by nodeCategory, which needs the candidate's categoryId", () => {
    const nd: Record<string, NodeDef> = {
      sword00000: nodeDef.parse({ id: "sword00000", categoryId: "unit000000" }),
      bow0000000: nodeDef.parse({ id: "bow0000000", categoryId: "unit000000" }),
      banner0000: nodeDef.parse({ id: "banner0000" }),
    };
    const r = evaluateSelector(
      { type: "all" },
      [g("sword00000", 2), g("bow0000000", 3), g("banner0000", 1)],
      { nodeDefs: nd },
      { partitionKey: (cand) => cand.categoryId ?? null },
    );
    // The uncategorised banner lands in no bucket.
    expect([...(r.partitions ?? [])].map(([k, v]) => [k, v.count])).toEqual([["unit000000", 5]]);
    expect(r.count).toBe(6);
  });

  it("a partitionKey returning string[] drops the match into every listed bucket", () => {
    const nd: Record<string, NodeDef> = {
      guard00000: nodeDef.parse({ id: "guard00000", fields: { kw: ["Infantry", "Order"] } }),
    };
    const r = evaluateSelector(
      { type: "all" },
      [g("guard00000", 5)],
      { nodeDefs: nd },
      {
        partitionKey: (cand) => {
          const v = cand.fields.kw;
          return Array.isArray(v) ? v.map(String) : null;
        },
      },
    );
    expect([...(r.partitions ?? [])].map(([k, v]) => [k, v.count]).sort()).toEqual([
      ["Infantry", 5],
      ["Order", 5],
    ]);
  });
});

describe("evaluateSelector — descends via effectiveChildren", () => {
  const reg: Record<string, NodeDef> = {
    unit000000: nodeDef.parse({
      id: "unit000000",
      options: [
        {
          id: "swap000000",
          kind: "replaceChild",
          slotId: "s",
          removeNodeId: "bolter0000",
          addNodeId: "melta00000",
        },
        { id: "add0000000", kind: "addChild", slotId: "s", addNodeId: "banner0000" },
      ],
    }),
    bolter0000: nodeDef.parse({ id: "bolter0000" }),
    melta00000: nodeDef.parse({ id: "melta00000" }),
    banner0000: nodeDef.parse({ id: "banner0000" }),
  };
  const c = { nodeDefs: reg };

  it("a replaceChild option makes the new def match and the old one not", () => {
    const t: SelectionEntry[] = [
      i("aaaaaaaaaa", "unit000000", [g("bolter0000", 1)], [{ optionId: "swap000000" }]),
    ];
    expect(evaluateSelector({ type: "nodeDefId", ids: ["melta00000"] }, t, c).count).toBe(1);
    expect(evaluateSelector({ type: "nodeDefId", ids: ["bolter0000"] }, t, c).count).toBe(0);
  });

  it("an addChild option adds to the count", () => {
    const t: SelectionEntry[] = [
      i("aaaaaaaaaa", "unit000000", [g("bolter0000", 1)], [{ optionId: "add0000000" }]),
    ];
    expect(evaluateSelector({ type: "nodeDefId", ids: ["banner0000"] }, t, c).count).toBe(1);
    expect(evaluateSelector({ type: "all" }, t, c).count).toBe(3); // unit + bolter + banner
  });
});
