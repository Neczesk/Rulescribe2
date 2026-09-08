import { describe, expect, it } from "vitest";
import { constraintDef, type Metric } from "../schema/constraint";
import { createRuleset } from "../schema/createRuleset";
import { listBuilding, nodeDef } from "../schema/listBuilding";
import type { Ruleset } from "../schema/ruleset";
import { describeConstraint } from "./describeConstraint";

const PTS = "pts0000000";
const HERO_CAT = "herocatxx0";
const MODEL_CAT = "modelcatx0";
const ROLE_FIELD = "rolefieldx";
const BANNER_NODE = "bannernod0";
const k = (value: number): Metric => ({ op: "constant", value });
const ALL = { type: "all" } as const;

function ruleset(): Ruleset {
  const rs = createRuleset("Test");
  return {
    ...rs,
    registry: {
      ...rs.registry,
      nodeDefs: { [BANNER_NODE]: nodeDef.parse({ id: BANNER_NODE, name: "Battle Standard" }) },
    },
    listBuilding: listBuilding.parse({
      resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
      categories: [
        { id: HERO_CAT, name: "Hero", kind: "node" },
        {
          id: MODEL_CAT,
          name: "Model",
          kind: "node",
          fields: [{ id: ROLE_FIELD, name: "Role", type: "singleValue" }],
        },
      ],
    }),
  };
}

const describe1 = (input: unknown) => describeConstraint(constraintDef.parse(input), ruleset());

describe("describeConstraint — recipe shapes", () => {
  it("cap a count", () => {
    expect(
      describe1({
        kind: "limit",
        metric: { op: "count", selector: { type: "nodeCategory", categoryId: HERO_CAT } },
        max: k(3),
      }),
    ).toBe("The number of Hero must be at most 3.");
  });

  it("require at least", () => {
    expect(
      describe1({
        kind: "limit",
        metric: { op: "count", selector: { type: "nodeCategory", categoryId: MODEL_CAT } },
        min: k(1),
      }),
    ).toBe("The number of Model must be at least 1.");
  });

  it("ratio — floor(divide) renders symbolically", () => {
    expect(
      describe1({
        kind: "limit",
        metric: { op: "count", selector: { type: "nodeDefId", ids: [BANNER_NODE] } },
        max: {
          op: "floor",
          of: {
            op: "divide",
            operands: [
              { op: "count", selector: { type: "nodeCategory", categoryId: MODEL_CAT } },
              k(10),
            ],
          },
        },
      }),
    ).toBe("The number of Battle Standard must be at most ⌊the number of Model ÷ 10⌋.");
  });

  it("share of a resource", () => {
    expect(
      describe1({
        kind: "limit",
        metric: {
          op: "percentOf",
          part: {
            op: "costSum",
            selector: { type: "nodeCategory", categoryId: HERO_CAT },
            resourceId: PTS,
          },
          whole: { op: "costSum", selector: ALL, resourceId: PTS },
        },
        max: k(25),
      }),
    ).toBe(
      "The Points spent on Hero as a percentage of the Points spent on anything in the subtree must be at most 25.",
    );
  });

  it("require / condition", () => {
    expect(
      describe1({
        kind: "require",
        condition: {
          op: "compare",
          left: { op: "count", selector: { type: "nodeCategory", categoryId: MODEL_CAT } },
          cmp: "gte",
          right: k(5),
        },
      }),
    ).toBe("The number of Model is at least 5.");
  });
});

describe("describeConstraint — affixes", () => {
  it("prefixes warning severity and a when-gate, suffixes a partition and a message", () => {
    const text = describe1({
      kind: "limit",
      severity: "warning",
      metric: { op: "count", selector: { type: "nodeCategory", categoryId: HERO_CAT } },
      max: k(2),
      when: {
        op: "compare",
        left: { op: "count", selector: ALL },
        cmp: "gte",
        right: k(1),
      },
      perPartition: { key: { type: "field", fieldId: ROLE_FIELD } },
      message: { type: "doc", content: [{ type: "paragraph" }] },
    });
    expect(text).toBe(
      "Warning — When the number of anything in the subtree is at least 1, the number of Hero must be at most 2 (for each Role value) (custom message).",
    );
  });
});

describe("describeConstraint — fallbacks never throw", () => {
  it("handles and/or selectors, distinctCount, resourceLimit, nOf, unknown ids", () => {
    const inputs: unknown[] = [
      {
        kind: "limit",
        metric: {
          op: "count",
          selector: {
            type: "and",
            selectors: [
              { type: "nodeCategory", categoryId: HERO_CAT },
              { type: "not", selector: { type: "nodeDefId", ids: ["ghostxxxx0"] } },
            ],
          },
        },
        max: k(1),
      },
      {
        kind: "limit",
        metric: { op: "distinctCount", selector: ALL, key: { type: "nodeCategory" } },
        max: { op: "resourceLimit", resourceId: PTS },
      },
      {
        kind: "limit",
        metric: { op: "count", selector: { type: "nodeCategory", categoryId: "gonexxxxx0" } },
        min: k(1),
        max: k(4),
      },
      {
        kind: "require",
        condition: {
          op: "nOf",
          min: 2,
          conditions: [
            { op: "compare", left: { op: "count", selector: ALL }, cmp: "gte", right: k(1) },
            { op: "multipleOf", metric: { op: "count", selector: ALL }, step: 5 },
            {
              op: "not",
              condition: { op: "inSet", metric: { op: "count", selector: ALL }, values: [3] },
            },
          ],
        },
      },
    ];
    for (const input of inputs) {
      const text = describeConstraint(constraintDef.parse(input), ruleset());
      expect(typeof text).toBe("string");
      expect(text.length).toBeGreaterThan(0);
    }
    expect(
      describe1({
        kind: "limit",
        metric: { op: "count", selector: { type: "nodeCategory", categoryId: "gonexxxxx0" } },
        max: k(1),
      }),
    ).toContain("an unknown category");
  });

  it("covers every metric and condition op without an assertNever throw", () => {
    const metrics: Metric[] = [
      { op: "count", selector: ALL },
      { op: "fieldSum", selector: ALL, fieldId: ROLE_FIELD },
      { op: "fieldMax", selector: ALL, fieldId: ROLE_FIELD },
      { op: "fieldMin", selector: ALL, fieldId: ROLE_FIELD },
      { op: "costSum", selector: ALL, resourceId: PTS },
      { op: "distinctCount", selector: ALL, key: { type: "nodeDefId" } },
      { op: "resourceLimit", resourceId: PTS },
      { op: "constant", value: 1 },
      { op: "add", operands: [k(1), k(2)] },
      { op: "subtract", operands: [k(3), k(1)] },
      { op: "multiply", operands: [k(2), k(2)] },
      { op: "divide", operands: [k(6), k(2)] },
      { op: "percentOf", part: k(1), whole: k(2) },
      { op: "floor", of: k(1) },
      { op: "ceil", of: k(1) },
      { op: "round", of: k(1) },
      { op: "wholeSubtree", of: { op: "count", selector: ALL } },
    ];
    for (const metric of metrics) {
      const text = describeConstraint(
        constraintDef.parse({
          kind: "limit",
          metric,
          max: k(9),
          perPartition: { key: { type: "nodeDefId" } },
        }),
        ruleset(),
      );
      expect(text.length).toBeGreaterThan(0);
    }
  });
});
