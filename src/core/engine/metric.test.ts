import { describe, expect, it } from "vitest";
import type { Condition, Metric } from "../schema/constraint";
import { createRuleset } from "../schema/createRuleset";
import { listBuilding, nodeDef, type NodeDef } from "../schema/listBuilding";
import { LIST_SCHEMA_VERSION, list, type List } from "../schema/list";
import type { Ruleset } from "../schema/ruleset";
import type { SelectionEntry } from "../schema/selection";
import type { Selector } from "../schema/selector";
import { type Candidate, flattenSubtree } from "./candidates";
import { effectiveCap, evaluateCondition, evaluateMetric, type MetricCtx } from "./metric";

const ALL = { type: "all" } as const;
const PTS = "pts0000000";
const k = (value: number): Metric => ({ op: "constant", value });

const nodeDefs: Record<string, NodeDef> = {
  army000000: nodeDef.parse({ id: "army000000" }),
  hero000000: nodeDef.parse({
    id: "hero000000",
    categoryId: "char000000",
    baseCosts: { [PTS]: 120 },
    fields: { w: 5, role: "hq", kw: ["Infantry", "Order"] },
  }),
  wargear000: nodeDef.parse({ id: "wargear000", baseCosts: { [PTS]: 30 } }),
  squad00000: nodeDef.parse({
    id: "squad00000",
    categoryId: "unit000000",
    baseCosts: { [PTS]: 50 },
    fields: { w: 1, role: "core" },
  }),
};

const LB = {
  resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
  fields: [{ id: "kw00000000", type: "multiValue" }],
  formats: [{ id: "combatpat0", name: "Combat Patrol", resourceCaps: { [PTS]: 500 } }],
};

function makeRuleset(lb: unknown = LB): Ruleset {
  const rs = createRuleset();
  return {
    ...rs,
    registry: { ...rs.registry, nodeDefs },
    listBuilding: lb === undefined ? undefined : listBuilding.parse(lb),
  };
}

/** army [ hero [ wargear ], squad ×2 ] — 0 + 120 + 30 + 2×50 = 250 points. */
const ROOT: SelectionEntry = {
  kind: "instance",
  slotId: "",
  instanceId: "aaaaaaaaaa",
  defId: "army000000",
  appliedOptions: [],
  children: [
    {
      kind: "instance",
      slotId: "s",
      instanceId: "bbbbbbbbbb",
      defId: "hero000000",
      appliedOptions: [],
      children: [{ kind: "group", slotId: "g", defId: "wargear000", count: 1 }],
    },
    { kind: "group", slotId: "s", defId: "squad00000", count: 2 },
  ],
};

function makeCtx(
  opts: { rs?: Ruleset; extra?: Partial<List>; scope?: (c: Candidate) => boolean } = {},
): MetricCtx {
  const rs = opts.rs ?? makeRuleset();
  const l = list.parse({
    schemaVersion: LIST_SCHEMA_VERSION,
    rulesetId: "abcdefghij",
    root: ROOT,
    ...opts.extra,
  });
  const evalCtx = { nodeDefs: rs.registry.nodeDefs, ruleset: rs };
  const all = flattenSubtree([ROOT], evalCtx);
  return {
    ruleset: rs,
    list: l,
    format: rs.listBuilding?.formats.find((f) => f.id === l.formatId),
    all,
    scope: opts.scope ? all.filter(opts.scope) : all,
    evalCtx,
  };
}

const evalM = (m: Metric, ctx = makeCtx()): number | null => evaluateMetric(m, ctx);
const evalC = (c: Condition, ctx = makeCtx()): boolean | null => evaluateCondition(c, ctx);

describe("evaluateMetric — aggregates", () => {
  it("constant and count, groups contributing their count", () => {
    expect(evalM(k(7))).toBe(7);
    expect(evalM({ op: "count", selector: ALL })).toBe(5); // army + hero + wargear + 2 squad
    expect(evalM({ op: "count", selector: { type: "nodeDefId", ids: ["squad00000"] } })).toBe(2);
  });

  it("fieldSum is count-weighted; fieldMax / fieldMin are not", () => {
    expect(evalM({ op: "fieldSum", selector: ALL, fieldId: "w" })).toBe(7); // 5×1 + 1×2
    expect(evalM({ op: "fieldMax", selector: ALL, fieldId: "w" })).toBe(5);
    expect(evalM({ op: "fieldMin", selector: ALL, fieldId: "w" })).toBe(1);
  });

  it("aggregates over an empty match set are 0", () => {
    const none: Selector = { type: "nodeDefId", ids: ["nothing000"] };
    expect(evalM({ op: "count", selector: none })).toBe(0);
    expect(evalM({ op: "fieldSum", selector: none, fieldId: "w" })).toBe(0);
    expect(evalM({ op: "fieldMax", selector: none, fieldId: "w" })).toBe(0);
    expect(evalM({ op: "fieldMin", selector: none, fieldId: "w" })).toBe(0);
  });

  it("distinctCount by nodeDefId, nodeCategory and a field, dropping null keys", () => {
    expect(evalM({ op: "distinctCount", selector: ALL, key: { type: "nodeDefId" } })).toBe(4);
    // army and wargear carry no categoryId / no role, so they bucket nowhere.
    expect(evalM({ op: "distinctCount", selector: ALL, key: { type: "nodeCategory" } })).toBe(2);
    expect(
      evalM({ op: "distinctCount", selector: ALL, key: { type: "field", fieldId: "role" } }),
    ).toBe(2);
  });
});

describe("evaluateMetric — costSum", () => {
  it("sums each match's whole subtree", () => {
    expect(evalM({ op: "costSum", selector: ALL, resourceId: PTS })).toBe(250);
    expect(
      evalM({
        op: "costSum",
        selector: { type: "nodeCategory", categoryId: "char000000" },
        resourceId: PTS,
      }),
    ).toBe(150); // hero 120 + its wargear 30
  });

  it("deduplicates nested matches — the root match already covers everything", () => {
    // `all` matches army, hero, wargear and the squads; without dedup this would
    // count the hero subtree twice over.
    expect(evalM({ op: "costSum", selector: ALL, resourceId: PTS })).toBe(250);
  });

  it("is 0 for an unknown resource id", () => {
    expect(evalM({ op: "costSum", selector: ALL, resourceId: "cp00000000" })).toBe(0);
  });
});

describe("evaluateMetric — arithmetic", () => {
  it("add / subtract / multiply / divide fold left over the operands", () => {
    expect(evalM({ op: "add", operands: [k(1), k(2), k(3)] })).toBe(6);
    expect(evalM({ op: "subtract", operands: [k(10), k(3), k(2)] })).toBe(5);
    expect(evalM({ op: "multiply", operands: [k(2), k(3), k(4)] })).toBe(24);
    expect(evalM({ op: "divide", operands: [k(100), k(4)] })).toBe(25);
  });

  it("division by zero is 0, never Infinity or NaN", () => {
    expect(evalM({ op: "divide", operands: [k(100), k(0)] })).toBe(0);
  });

  it("percentOf yields 0-100, and 0 when the whole is 0", () => {
    expect(
      evalM({
        op: "percentOf",
        part: {
          op: "costSum",
          selector: { type: "nodeCategory", categoryId: "char000000" },
          resourceId: PTS,
        },
        whole: { op: "costSum", selector: ALL, resourceId: PTS },
      }),
    ).toBe(60); // 150 of 250
    expect(evalM({ op: "percentOf", part: k(5), whole: k(0) })).toBe(0);
  });

  it("floor / ceil / round", () => {
    const third: Metric = { op: "divide", operands: [k(10), k(3)] };
    expect(evalM({ op: "floor", of: third })).toBe(3);
    expect(evalM({ op: "ceil", of: third })).toBe(4);
    expect(evalM({ op: "round", of: third })).toBe(3);
  });
});

describe("evaluateMetric — scope and wholeSubtree", () => {
  const squadsOnly = makeCtx({ scope: (c) => c.defId === "squad00000" });

  it("metrics see only the active scope", () => {
    expect(evalM({ op: "count", selector: ALL }, squadsOnly)).toBe(2);
    expect(evalM({ op: "costSum", selector: ALL, resourceId: PTS }, squadsOnly)).toBe(100);
  });

  it("wholeSubtree restores the full candidate set", () => {
    expect(evalM({ op: "wholeSubtree", of: { op: "count", selector: ALL } }, squadsOnly)).toBe(5);
  });

  it("nested metrics inherit the restored scope", () => {
    expect(
      evalM(
        {
          op: "wholeSubtree",
          of: { op: "add", operands: [{ op: "count", selector: ALL }, k(1)] },
        },
        squadsOnly,
      ),
    ).toBe(6);
  });
});

describe("evaluateMetric — resourceLimit and null propagation", () => {
  it("resolves the format cap, and a playerChosen override on top", () => {
    const withFormat = makeCtx({ extra: { formatId: "combatpat0" } });
    expect(evalM({ op: "resourceLimit", resourceId: PTS }, withFormat)).toBe(500);

    const withOverride = makeCtx({
      extra: { formatId: "combatpat0", resourceCaps: { [PTS]: 1000 } },
    });
    expect(evalM({ op: "resourceLimit", resourceId: PTS }, withOverride)).toBe(1000);
  });

  it("is null when uncapped or when the resource does not exist", () => {
    expect(evalM({ op: "resourceLimit", resourceId: PTS })).toBeNull(); // no format, playerChosen unset
    expect(evalM({ op: "resourceLimit", resourceId: "nope000000" })).toBeNull();
    expect(
      evalM({ op: "resourceLimit", resourceId: PTS }, makeCtx({ rs: makeRuleset(undefined) })),
    ).toBeNull();
  });

  it("null propagates through every operator", () => {
    const unresolvable: Metric = { op: "resourceLimit", resourceId: "nope000000" };
    expect(evalM({ op: "add", operands: [k(1), unresolvable] })).toBeNull();
    expect(evalM({ op: "percentOf", part: unresolvable, whole: k(10) })).toBeNull();
    expect(evalM({ op: "floor", of: unresolvable })).toBeNull();
    expect(evalM({ op: "wholeSubtree", of: unresolvable })).toBeNull();
    expect(evalC({ op: "compare", left: k(1), cmp: "lt", right: unresolvable })).toBeNull();
  });
});

describe("evaluateCondition", () => {
  const five = k(5);

  it("compare covers every operator", () => {
    expect(evalC({ op: "compare", left: five, cmp: "lt", right: k(6) })).toBe(true);
    expect(evalC({ op: "compare", left: five, cmp: "lte", right: k(5) })).toBe(true);
    expect(evalC({ op: "compare", left: five, cmp: "eq", right: k(5) })).toBe(true);
    expect(evalC({ op: "compare", left: five, cmp: "gte", right: k(6) })).toBe(false);
    expect(evalC({ op: "compare", left: five, cmp: "gt", right: k(4) })).toBe(true);
  });

  it("inSet and multipleOf", () => {
    expect(evalC({ op: "inSet", metric: five, values: [1, 5, 9] })).toBe(true);
    expect(evalC({ op: "inSet", metric: five, values: [1, 9] })).toBe(false);
    expect(evalC({ op: "multipleOf", metric: k(10), step: 5 })).toBe(true);
    expect(evalC({ op: "multipleOf", metric: k(11), step: 5 })).toBe(false);
    // Tolerant of float error rather than relying on exact `%`.
    expect(
      evalC({ op: "multipleOf", metric: { op: "divide", operands: [k(3), k(10)] }, step: 0.1 }),
    ).toBe(true);
  });

  it("and / or / not", () => {
    const yes: Condition = { op: "compare", left: five, cmp: "eq", right: k(5) };
    const no: Condition = { op: "compare", left: five, cmp: "eq", right: k(6) };
    expect(evalC({ op: "and", conditions: [yes, yes] })).toBe(true);
    expect(evalC({ op: "and", conditions: [yes, no] })).toBe(false);
    expect(evalC({ op: "or", conditions: [yes, no] })).toBe(true);
    expect(evalC({ op: "or", conditions: [no, no] })).toBe(false);
    expect(evalC({ op: "not", condition: no })).toBe(true);
  });

  it("nOf checks how many hold against min and max", () => {
    const yes: Condition = { op: "compare", left: five, cmp: "eq", right: k(5) };
    const no: Condition = { op: "compare", left: five, cmp: "eq", right: k(6) };
    const of = (conditions: Condition[], min?: number, max?: number): Condition => ({
      op: "nOf",
      conditions,
      ...(min != null ? { min } : {}),
      ...(max != null ? { max } : {}),
    });
    expect(evalC(of([yes, yes, no], 2))).toBe(true);
    expect(evalC(of([yes, no, no], 2))).toBe(false);
    expect(evalC(of([yes, yes, no], undefined, 1))).toBe(false);
    expect(evalC(of([yes, no, no], undefined, 1))).toBe(true);
    expect(evalC(of([yes, yes, no], 1, 2))).toBe(true);
  });

  it("null in any branch makes the whole condition null, without short-circuiting", () => {
    const unknown: Condition = {
      op: "compare",
      left: { op: "resourceLimit", resourceId: "nope000000" },
      cmp: "gt",
      right: k(0),
    };
    const no: Condition = { op: "compare", left: five, cmp: "eq", right: k(6) };
    expect(evalC({ op: "and", conditions: [no, unknown] })).toBeNull();
    expect(evalC({ op: "or", conditions: [no, unknown] })).toBeNull();
    expect(evalC({ op: "not", condition: unknown })).toBeNull();
    expect(evalC({ op: "nOf", conditions: [unknown], min: 1 })).toBeNull();
  });
});

describe("effectiveCap", () => {
  const l = (resourceCaps: Record<string, number> = {}): List =>
    list.parse({ schemaVersion: LIST_SCHEMA_VERSION, rulesetId: "abcdefghij", resourceCaps });
  const format = { id: "f000000000", name: "F", resourceCaps: { [PTS]: 500 }, constraints: [] };
  const res = (cap: unknown) => ({ id: PTS, name: "Points", cap }) as never;

  it("a player override applies only to a playerChosen resource", () => {
    expect(effectiveCap(res({ type: "playerChosen" }), format, l({ [PTS]: 1000 }))).toBe(1000);
    expect(effectiveCap(res({ type: "fixed", value: 2000 }), format, l({ [PTS]: 1000 }))).toBe(500);
    expect(effectiveCap(res({ type: "none" }), format, l({ [PTS]: 1000 }))).toBe(500);
  });

  it("falls back format -> resource cap -> uncapped", () => {
    expect(effectiveCap(res({ type: "playerChosen" }), format, l())).toBe(500);
    expect(effectiveCap(res({ type: "playerChosen" }), undefined, l())).toBeNull();
    expect(effectiveCap(res({ type: "fixed", value: 2000 }), undefined, l())).toBe(2000);
    expect(effectiveCap(res({ type: "none" }), undefined, l())).toBeNull();
  });
});
