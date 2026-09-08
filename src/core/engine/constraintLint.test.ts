import { describe, expect, it } from "vitest";
import type { ConstraintDef } from "../schema/constraint";
import { createRuleset } from "../schema/createRuleset";
import { constraintDef, listBuilding, nodeDef } from "../schema/listBuilding";
import type { Ruleset } from "../schema/ruleset";
import { lintConstraint, lintDraftConstraint, lintRuleset } from "./constraintLint";

const ALL = { type: "all" } as const;
const PTS = "pts0000000";
const k = (value: number) => ({ op: "constant", value }) as const;

const LB = {
  resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
  formats: [],
};

/** Put `constraints` on a single NodeDef and lint the whole ruleset. */
function lint(constraints: unknown[], lb: unknown = LB): ReturnType<typeof lintRuleset> {
  const rs = createRuleset();
  const parsed: ConstraintDef[] = constraints.map((c) => constraintDef.parse(c));
  const ruleset: Ruleset = {
    ...rs,
    registry: {
      ...rs.registry,
      nodeDefs: {
        army000000: { ...nodeDef.parse({ id: "army000000" }), constraints: parsed },
      },
    },
    listBuilding: listBuilding.parse(lb),
  };
  return lintRuleset(ruleset);
}

const codes = (issues: ReturnType<typeof lintRuleset>): string[] => issues.map((i) => i.code);

describe("lintRuleset — arithmetic", () => {
  it("errors on a constant-zero divisor", () => {
    const issues = lint([
      { kind: "limit", metric: { op: "divide", operands: [k(10), k(0)] }, max: k(1) },
    ]);
    expect(codes(issues)).toContain("divide-by-zero");
    expect(issues[0]?.severity).toBe("error");
  });

  it("warns when a divisor is anything but a nonzero constant", () => {
    const issues = lint([
      {
        kind: "limit",
        metric: { op: "divide", operands: [k(10), { op: "count", selector: ALL }] },
        max: k(1),
      },
    ]);
    expect(codes(issues)).toEqual(["divisor-may-be-zero"]);
    expect(issues[0]?.severity).toBe("warning");
  });

  it("says nothing about a nonzero constant divisor", () => {
    expect(
      lint([{ kind: "limit", metric: { op: "divide", operands: [k(10), k(2)] }, max: k(1) }]),
    ).toEqual([]);
  });

  it("treats percentOf's whole as a divisor", () => {
    const issues = lint([
      {
        kind: "limit",
        metric: { op: "percentOf", part: k(1), whole: { op: "count", selector: ALL } },
        max: k(25),
      },
    ]);
    expect(codes(issues)).toContain("divisor-may-be-zero");
  });
});

describe("lintRuleset — comparisons and scoping", () => {
  it("warns on a fractional side compared against a count", () => {
    const issues = lint([
      {
        kind: "require",
        condition: {
          op: "compare",
          left: { op: "divide", operands: [k(10), k(3)] },
          cmp: "gte",
          right: { op: "count", selector: ALL },
        },
      },
    ]);
    expect(codes(issues)).toContain("fractional-vs-count");
  });

  it("says nothing once the fractional side is rounded", () => {
    const issues = lint([
      {
        kind: "require",
        condition: {
          op: "compare",
          left: { op: "floor", of: { op: "divide", operands: [k(10), k(3)] } },
          cmp: "gte",
          right: { op: "count", selector: ALL },
        },
      },
    ]);
    expect(codes(issues)).not.toContain("fractional-vs-count");
  });

  it("warns that wholeSubtree outside perPartition is a no-op", () => {
    const metric = { op: "wholeSubtree", of: { op: "count", selector: ALL } };
    expect(codes(lint([{ kind: "limit", metric, max: k(3) }]))).toEqual(["whole-subtree-noop"]);
    expect(
      codes(
        lint([{ kind: "limit", metric, max: k(3), perPartition: { key: { type: "nodeDefId" } } }]),
      ),
    ).toEqual([]);
  });
});

describe("lintRuleset — names", () => {
  it("errors on an undeclared resource in resourceLimit or costSum", () => {
    expect(
      codes(
        lint([
          {
            kind: "limit",
            metric: { op: "costSum", selector: ALL, resourceId: "nope000000" },
            max: { op: "resourceLimit", resourceId: "alsono0000" },
          },
        ]),
      ).sort(),
    ).toEqual(["unknown-resource", "unknown-resource"]);
  });

  it("accepts a declared resource", () => {
    expect(
      lint([
        {
          kind: "limit",
          metric: { op: "costSum", selector: ALL, resourceId: PTS },
          max: { op: "resourceLimit", resourceId: PTS },
        },
      ]),
    ).toEqual([]);
  });

  it("errors when overrides names an id no constraint has", () => {
    const issues = lint([
      { id: "c000000001", kind: "limit", metric: k(1), max: k(2), overrides: ["c000000009"] },
    ]);
    expect(codes(issues)).toEqual(["unknown-override"]);
  });

  it("accepts an overrides id that exists elsewhere in the ruleset", () => {
    expect(
      lint([
        { id: "c000000001", kind: "limit", metric: k(1), max: k(2), overrides: ["c000000002"] },
        { id: "c000000002", kind: "limit", metric: k(1), max: k(5) },
      ]),
    ).toEqual([]);
  });
});

describe("lintRuleset — message metricRefs", () => {
  const doc = (name: string) => ({
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          { type: "text", text: "spent " },
          { type: "metricRef", attrs: { name } },
        ],
      },
    ],
  });

  it("accepts a ref to an author-declared value", () => {
    expect(
      lint([
        {
          kind: "limit",
          metric: k(1),
          max: k(2),
          values: { spent: { op: "costSum", selector: ALL, resourceId: PTS } },
          message: doc("spent"),
        },
      ]),
    ).toEqual([]);
  });

  it("accepts refs to the auto-exposed set", () => {
    for (const name of ["metric", "max"]) {
      expect(lint([{ kind: "limit", metric: k(1), max: k(2), message: doc(name) }])).toEqual([]);
    }
    expect(
      lint([
        {
          kind: "limit",
          metric: k(1),
          max: k(2),
          perPartition: { key: { type: "nodeDefId" } },
          message: doc("partition"),
        },
      ]),
    ).toEqual([]);
  });

  it("errors on a ref to nothing, and on `min` when no min is declared", () => {
    expect(codes(lint([{ kind: "limit", metric: k(1), max: k(2), message: doc("nope") }]))).toEqual(
      ["unknown-metric-ref"],
    );
    expect(codes(lint([{ kind: "limit", metric: k(1), max: k(2), message: doc("min") }]))).toEqual([
      "unknown-metric-ref",
    ]);
  });

  it("a require exposes only its author values, never metric/min/max", () => {
    expect(
      codes(
        lint([
          { kind: "require", condition: { op: "inSet", metric: k(1) }, message: doc("metric") },
        ]),
      ),
    ).toEqual(["unknown-metric-ref"]);
  });
});

describe("lintConstraint — single constraint, explicit context", () => {
  it("matches what lintRuleset produces for the same constraint", () => {
    const parsed = constraintDef.parse({
      kind: "limit",
      metric: { op: "divide", operands: [k(1), k(0)] },
      max: k(1),
    });
    const direct = lintConstraint(parsed, {
      host: { kind: "nodeDef", id: "army000000" },
      resourceIds: new Set([PTS]),
      knownConstraintIds: new Set([parsed.id]),
    });
    expect(direct.map((i) => i.code)).toEqual(["divide-by-zero"]);
    expect(direct[0].host).toEqual({ kind: "nodeDef", id: "army000000" });
  });

  it("accepts a category host kind", () => {
    const parsed = constraintDef.parse({ kind: "limit", metric: k(1), max: k(2) });
    expect(() =>
      lintConstraint(parsed, {
        host: { kind: "category", id: "modelcatx0" },
        resourceIds: new Set(),
        knownConstraintIds: new Set([parsed.id]),
      }),
    ).not.toThrow();
  });
});

describe("lintDraftConstraint — unsaved draft", () => {
  function rulesetWithSibling(): Ruleset {
    const rs = createRuleset();
    return {
      ...rs,
      registry: {
        ...rs.registry,
        nodeDefs: {
          army000000: {
            ...nodeDef.parse({ id: "army000000" }),
            constraints: [
              constraintDef.parse({ id: "sibling001", kind: "limit", metric: k(1), max: k(3) }),
            ],
          },
        },
      },
      listBuilding: listBuilding.parse(LB),
    };
  }

  it("does not flag overrides of the draft's own id or a host sibling", () => {
    const rs = rulesetWithSibling();
    const draft = constraintDef.parse({
      id: "draft00001",
      kind: "limit",
      metric: k(1),
      max: k(2),
      overrides: ["draft00001", "sibling001"],
    });
    const issues = lintDraftConstraint(draft, rs, { kind: "nodeDef", id: "army000000" });
    expect(issues.map((i) => i.code)).not.toContain("unknown-override");
  });

  it("still flags an override id nothing has", () => {
    const rs = rulesetWithSibling();
    const draft = constraintDef.parse({
      id: "draft00001",
      kind: "limit",
      metric: k(1),
      max: k(2),
      overrides: ["ghost00000"],
    });
    const issues = lintDraftConstraint(draft, rs, { kind: "nodeDef", id: "army000000" });
    expect(issues.map((i) => i.code)).toEqual(["unknown-override"]);
  });
});

describe("lintRuleset — hosts", () => {
  it("reports which record carries the offending constraint", () => {
    const issues = lint([
      { kind: "limit", metric: { op: "divide", operands: [k(1), k(0)] }, max: k(1) },
    ]);
    expect(issues[0]?.host).toEqual({ kind: "nodeDef", id: "army000000" });
  });

  it("lints format constraints too", () => {
    const rs = createRuleset();
    const ruleset: Ruleset = {
      ...rs,
      listBuilding: listBuilding.parse({
        resources: [],
        formats: [
          {
            id: "combatpat0",
            constraints: [
              {
                kind: "limit",
                metric: { op: "costSum", selector: ALL, resourceId: "nope000000" },
                max: k(1),
              },
            ],
          },
        ],
      }),
    };
    const issues = lintRuleset(ruleset);
    expect(issues.map((i) => i.host.kind)).toEqual(["format"]);
    expect(codes(issues)).toEqual(["unknown-resource"]);
  });
});
