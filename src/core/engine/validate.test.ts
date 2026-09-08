import { describe, expect, it } from "vitest";
import { createRuleset } from "../schema/createRuleset";
import { categoryRecord, listBuilding, nodeDef, type NodeDef } from "../schema/listBuilding";
import { LIST_SCHEMA_VERSION, list, type List } from "../schema/list";
import type { AppliedOption, SelectionEntry } from "../schema/selection";
import type { Ruleset } from "../schema/ruleset";
import { syncResourceConstraints } from "./resourceConstraints";
import { validateList } from "./validate";

// ---------------------------------------------------------------------------
// Constraint literals are verbose in the algebra; these keep the tests legible.
// ---------------------------------------------------------------------------

const ALL = { type: "all" } as const;
const k = (value: number) => ({ op: "constant", value }) as const;
const countOf = (selector: unknown) => ({ op: "count", selector }) as const;

const countLimit = (
  selector: unknown,
  bounds: { min?: number; max?: number },
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  kind: "limit",
  metric: countOf(selector),
  ...(bounds.min != null ? { min: k(bounds.min) } : {}),
  ...(bounds.max != null ? { max: k(bounds.max) } : {}),
  ...extra,
});

const atLeastOne = (selector: unknown) => ({
  op: "compare",
  left: countOf(selector),
  cmp: "gte",
  right: k(1),
});
const noneOf = (selector: unknown) => ({
  op: "compare",
  left: countOf(selector),
  cmp: "eq",
  right: k(0),
});

const requires = (
  trigger: unknown,
  target: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  kind: "require",
  when: atLeastOne(trigger),
  condition: atLeastOne(target),
  ...extra,
});

const excludes = (
  trigger: unknown,
  target: unknown,
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  kind: "require",
  when: atLeastOne(trigger),
  condition: noneOf(target),
  ...extra,
});

// ---------------------------------------------------------------------------

/** Formats always carry their generated resource limits, as the migration and authoring UI ensure. */
function ruleset(nodeDefs: Record<string, NodeDef>, lb?: unknown): Ruleset {
  const rs = createRuleset();
  const parsed = lb === undefined ? undefined : listBuilding.parse(lb);
  return {
    ...rs,
    registry: { ...rs.registry, nodeDefs },
    listBuilding: parsed && {
      ...parsed,
      formats: parsed.formats.map((f) => syncResourceConstraints(f, parsed.resources)),
    },
  };
}

function makeList(root: SelectionEntry, extra: Partial<List> = {}): List {
  return list.parse({
    schemaVersion: LIST_SCHEMA_VERSION,
    rulesetId: "abcdefghij",
    root,
    ...extra,
  });
}

const g = (defId: string, count: number, slotId = "s"): SelectionEntry => ({
  kind: "group",
  slotId,
  defId,
  count,
});
const inst = (
  instanceId: string,
  defId: string,
  children: SelectionEntry[] = [],
  appliedOptions: AppliedOption[] = [],
  slotId = "s",
): SelectionEntry => ({ kind: "instance", slotId, instanceId, defId, children, appliedOptions });
const rootInstance = (
  defId: string,
  children: SelectionEntry[],
  appliedOptions: AppliedOption[] = [],
): SelectionEntry => inst("aaaaaaaaaa", defId, children, appliedOptions, "");

const codes = (issues: { code: string }[]): string[] => issues.map((i) => i.code);

const LB = {
  resources: [{ id: "pts0000000", name: "Points", cap: { type: "playerChosen" } }],
  formats: [{ id: "combatpat0", name: "Combat Patrol", resourceCaps: { pts0000000: 500 } }],
};

const squad = nodeDef.parse({ id: "squad00000", baseCosts: { pts0000000: 300 } });

describe("validateList — resource caps via generated format constraints", () => {
  it("flags spend over the format cap", () => {
    const rs = ruleset({ squad00000: squad }, LB);
    const { errors } = validateList(makeList(g("squad00000", 2), { formatId: "combatpat0" }), rs);
    expect(codes(errors)).toContain("resource-over-cap");
    expect(errors[0]?.message).toContain("Points");
  });

  it("a player override cap beats the format cap for a playerChosen resource", () => {
    const rs = ruleset({ squad00000: squad }, LB);
    const l = makeList(g("squad00000", 2), {
      formatId: "combatpat0",
      resourceCaps: { pts0000000: 1000 },
    });
    expect(validateList(l, rs).errors).toEqual([]);
  });

  it("a clean list yields no errors or warnings", () => {
    const rs = ruleset({ squad00000: squad }, LB);
    expect(validateList(makeList(g("squad00000", 1), { formatId: "combatpat0" }), rs)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("downgrading the generated constraint moves the breach into warnings", () => {
    const base = ruleset({ squad00000: squad }, LB);
    const lb = base.listBuilding!;
    const rs: Ruleset = {
      ...base,
      listBuilding: {
        ...lb,
        formats: lb.formats.map((f) => ({
          ...f,
          constraints: f.constraints.map((c) =>
            c.generatedFor ? { ...c, severity: "warning" as const } : c,
          ),
        })),
      },
    };
    const result = validateList(makeList(g("squad00000", 2), { formatId: "combatpat0" }), rs);
    expect(result.errors).toEqual([]);
    expect(codes(result.warnings)).toEqual(["resource-over-cap"]);
  });

  it("deleting it means no cap at all", () => {
    const base = ruleset({ squad00000: squad }, LB);
    const lb = base.listBuilding!;
    const rs: Ruleset = {
      ...base,
      listBuilding: { ...lb, formats: lb.formats.map((f) => ({ ...f, constraints: [] })) },
    };
    expect(validateList(makeList(g("squad00000", 9), { formatId: "combatpat0" }), rs)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("falls back to a direct check only when the list has no format", () => {
    const lb = {
      resources: [{ id: "pts0000000", name: "Points", cap: { type: "fixed", value: 400 } }],
      formats: [],
    };
    const rs = ruleset({ squad00000: squad }, lb);
    expect(codes(validateList(makeList(g("squad00000", 2)), rs).errors)).toEqual([
      "resource-over-cap",
    ]);
    expect(validateList(makeList(g("squad00000", 1)), rs)).toEqual({ errors: [], warnings: [] });
  });
});

describe("validateList — limit constraints", () => {
  const company = nodeDef.parse({
    id: "company000",
    constraints: [
      countLimit({ type: "nodeDefId", ids: ["hqteam0000"] }, { max: 2 }),
      countLimit({ type: "nodeDefId", ids: ["rifleteam0"] }, { min: 3 }),
      countLimit({ type: "nodeDefId", ids: ["banner0000"] }, { max: 1 }, { severity: "warning" }),
    ],
  });
  const rs = ruleset({ company000: company });
  const company_ = (children: SelectionEntry[]): List =>
    makeList(rootInstance("company000", children));

  it("errors when a max is exceeded and when a min is unmet", () => {
    const { errors } = validateList(company_([g("hqteam0000", 3), g("rifleteam0", 1)]), rs);
    expect(codes(errors).sort()).toEqual(["limit-above-max", "limit-below-min"]);
    expect(errors.every((e) => e.path === "aaaaaaaaaa")).toBe(true);
  });

  it("routes a warning-severity breach into warnings, not errors", () => {
    const { errors, warnings } = validateList(
      company_([g("rifleteam0", 3), g("banner0000", 2)]),
      rs,
    );
    expect(errors).toEqual([]);
    expect(codes(warnings)).toEqual(["limit-above-max"]);
  });

  it("passes when every limit is satisfied", () => {
    expect(validateList(company_([g("rifleteam0", 4)]), rs)).toEqual({ errors: [], warnings: [] });
  });

  it("exposes constraintId and the resolved metric / bound as values", () => {
    const { errors } = validateList(company_([g("hqteam0000", 3), g("rifleteam0", 3)]), rs);
    expect(errors).toHaveLength(1);
    expect(errors[0]?.constraintId).toBe(company.constraints[0]?.id);
    expect(errors[0]?.values).toEqual({ metric: 3, max: 2 });
  });

  it("counts the root itself — selectors exclude it when that is not wanted", () => {
    const selfCounting = nodeDef.parse({
      id: "selfroot00",
      constraints: [countLimit(ALL, { max: 1 })],
    });
    const { errors } = validateList(
      makeList(rootInstance("selfroot00", [])),
      ruleset({ selfroot00: selfCounting }),
    );
    expect(errors).toEqual([]); // the root alone is exactly 1
    const withChild = validateList(
      makeList(rootInstance("selfroot00", [g("anything00", 1)])),
      ruleset({ selfroot00: selfCounting }),
    );
    expect(codes(withChild.errors)).toEqual(["limit-above-max"]);
  });

  it("counts an option-swapped unit in a limit's scope", () => {
    const army = nodeDef.parse({
      id: "army000000",
      options: [
        {
          id: "swap000000",
          kind: "replaceChild",
          slotId: "s",
          removeNodeId: "basic00000",
          addNodeId: "elite00000",
        },
      ],
      constraints: [countLimit({ type: "nodeDefId", ids: ["elite00000"] }, { min: 1 })],
    });
    const reg = ruleset({
      army000000: army,
      basic00000: nodeDef.parse({ id: "basic00000" }),
      elite00000: nodeDef.parse({ id: "elite00000" }),
    });
    expect(
      codes(validateList(makeList(rootInstance("army000000", [g("basic00000", 2)])), reg).errors),
    ).toEqual(["limit-below-min"]);
    expect(
      validateList(
        makeList(rootInstance("army000000", [g("basic00000", 2)], [{ optionId: "swap000000" }])),
        reg,
      ),
    ).toEqual({ errors: [], warnings: [] });
  });
});

describe("validateList — perPartition", () => {
  const nodeDefs = {
    army000000: nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit(
          { type: "nodeCategory", categoryId: "unit000000" },
          { max: 6 },
          { perPartition: { key: { type: "nodeDefId" } } },
        ),
      ],
    }),
    statetroop: nodeDef.parse({ id: "statetroop", categoryId: "unit000000" }),
    knights000: nodeDef.parse({ id: "knights000", categoryId: "unit000000" }),
  };
  const army_ = (children: SelectionEntry[]): List =>
    makeList(rootInstance("army000000", children));

  it("passes 6 of one unit type, fails 7", () => {
    expect(validateList(army_([g("statetroop", 6)]), ruleset(nodeDefs))).toEqual({
      errors: [],
      warnings: [],
    });
    expect(codes(validateList(army_([g("statetroop", 7)]), ruleset(nodeDefs)).errors)).toEqual([
      "limit-above-max",
    ]);
  });

  it("passes 6 + 6 of two different unit types — the cap is per bucket", () => {
    expect(
      validateList(army_([g("statetroop", 6), g("knights000", 6)]), ruleset(nodeDefs)),
    ).toEqual({ errors: [], warnings: [] });
  });

  it("partitions by a field value, flagging only the offending bucket", () => {
    const byRole = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit(ALL, { max: 2 }, { perPartition: { key: { type: "field", fieldId: "role" } } }),
      ],
    });
    const rs = ruleset({
      army000000: byRole,
      core000000: nodeDef.parse({ id: "core000000", fields: { role: "core" } }),
      rare000000: nodeDef.parse({ id: "rare000000", fields: { role: "rare" } }),
    });
    const { errors } = validateList(army_([g("core000000", 2), g("rare000000", 3)]), rs);
    expect(codes(errors)).toEqual(["limit-above-max"]);
    expect(errors[0]?.partitionKey).toBe("rare");
    expect(errors[0]?.message).toContain("[rare]");
  });

  it("partitions a multiValue field by each member", () => {
    const byKeyword = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit(
          ALL,
          { max: 4 },
          { perPartition: { key: { type: "field", fieldId: "kw00000000" } } },
        ),
      ],
    });
    const lb = { resources: [], fields: [{ id: "kw00000000", type: "multiValue" }], formats: [] };
    const rs = ruleset(
      {
        army000000: byKeyword,
        dualunit00: nodeDef.parse({
          id: "dualunit00",
          fields: { kw00000000: ["Fast", "Elite"] },
        }),
      },
      lb,
    );
    const { errors } = validateList(army_([g("dualunit00", 5)]), rs);
    expect(codes(errors)).toEqual(["limit-above-max", "limit-above-max"]);
    expect(errors.map((e) => e.partitionKey).sort()).toEqual(["Elite", "Fast"]);
    expect(validateList(army_([g("dualunit00", 3)]), rs)).toEqual({ errors: [], warnings: [] });
  });

  it("partitions by nodeCategory", () => {
    const byCategory = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit(ALL, { max: 6 }, { perPartition: { key: { type: "nodeCategory" } } }),
      ],
    });
    const rs = ruleset({ ...nodeDefs, army000000: byCategory });
    expect(codes(validateList(army_([g("statetroop", 4), g("knights000", 4)]), rs).errors)).toEqual(
      ["limit-above-max"],
    ); // both are `unit000000`, so 8 in one bucket
  });

  it("expectedKeys: an unobserved bucket still fails min", () => {
    const withExpected = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit(
          ALL,
          { min: 1 },
          {
            perPartition: {
              key: { type: "field", fieldId: "unittype00" },
              expectedKeys: ["state", "knight"],
            },
          },
        ),
      ],
    });
    const rs = ruleset({
      army000000: withExpected,
      statetroop: nodeDef.parse({ id: "statetroop", fields: { unittype00: "state" } }),
      knights000: nodeDef.parse({ id: "knights000", fields: { unittype00: "knight" } }),
    });
    const { errors } = validateList(army_([g("statetroop", 3)]), rs);
    expect(codes(errors)).toEqual(["limit-below-min"]);
    expect(errors[0]?.partitionKey).toBe("knight");
  });

  it("buckets come from the candidate set, so the root forms one of its own", () => {
    // A sharp edge worth pinning down: `perPartition` buckets every candidate in
    // the subtree — the root included — and the metric then filters *within* the
    // bucket (which is exactly what `wholeSubtree` exists to undo). Keying on
    // `nodeDefId` therefore gives the army root a bucket containing no units, so
    // a `min` fails there. Key on a field or category the root lacks to avoid it.
    const byDefId = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit(
          { type: "nodeCategory", categoryId: "unit000000" },
          { min: 1 },
          {
            perPartition: { key: { type: "nodeDefId" } },
          },
        ),
      ],
    });
    const rs = ruleset({ ...nodeDefs, army000000: byDefId });
    const { errors } = validateList(army_([g("statetroop", 3)]), rs);
    expect(errors.map((e) => e.partitionKey)).toEqual(["army000000"]);
  });
});

describe("validateList — require", () => {
  const reqArmy = nodeDef.parse({
    id: "reqarmy000",
    constraints: [
      requires(
        { type: "nodeDefId", ids: ["warlord000"] },
        { type: "nodeDefId", ids: ["banner0000"] },
      ),
    ],
  });
  const excArmy = nodeDef.parse({
    id: "excarmy000",
    constraints: [
      excludes(
        { type: "nodeDefId", ids: ["warlord000"] },
        { type: "nodeDefId", ids: ["assassin00"] },
      ),
    ],
  });
  const rs = ruleset({ reqarmy000: reqArmy, excarmy000: excArmy });
  const req = (children: SelectionEntry[]): List => makeList(rootInstance("reqarmy000", children));
  const exc = (children: SelectionEntry[]): List => makeList(rootInstance("excarmy000", children));

  it("requires: trigger present + target absent flags, anchored to the node", () => {
    const { errors } = validateList(req([g("warlord000", 1)]), rs);
    expect(codes(errors)).toEqual(["require-unmet"]);
    expect(errors[0]?.path).toBe("aaaaaaaaaa");
    expect(errors[0]?.constraintId).toBe(reqArmy.constraints[0]?.id);
  });

  it("requires: satisfied when the target is present", () => {
    expect(validateList(req([g("warlord000", 1), g("banner0000", 1)]), rs)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("requires: the `when` gate keeps it quiet with no trigger", () => {
    expect(validateList(req([g("grunt00000", 3)]), rs)).toEqual({ errors: [], warnings: [] });
  });

  it("excludes: trigger + forbidden target both present flags", () => {
    expect(codes(validateList(exc([g("warlord000", 1), g("assassin00", 1)]), rs).errors)).toEqual([
      "require-unmet",
    ]);
  });

  it("excludes: fine when either side is absent", () => {
    expect(validateList(exc([g("warlord000", 1)]), rs)).toEqual({ errors: [], warnings: [] });
    expect(validateList(exc([g("assassin00", 1)]), rs)).toEqual({ errors: [], warnings: [] });
  });

  it("nOf expresses 'at least 2 of these 3'", () => {
    const brigade = nodeDef.parse({
      id: "brigade000",
      constraints: [
        {
          kind: "require",
          condition: {
            op: "nOf",
            min: 2,
            conditions: [
              atLeastOne({ type: "nodeDefId", ids: ["infantry00"] }),
              atLeastOne({ type: "nodeDefId", ids: ["cavalry000"] }),
              atLeastOne({ type: "nodeDefId", ids: ["artillery0"] }),
            ],
          },
        },
      ],
    });
    const reg = ruleset({ brigade000: brigade });
    expect(
      codes(validateList(makeList(rootInstance("brigade000", [g("infantry00", 5)])), reg).errors),
    ).toEqual(["require-unmet"]);
    expect(
      validateList(
        makeList(rootInstance("brigade000", [g("infantry00", 5), g("cavalry000", 2)])),
        reg,
      ),
    ).toEqual({ errors: [], warnings: [] });
  });
});

describe("validateList — when gating and overrides", () => {
  it("a false `when` makes the constraint inactive", () => {
    const gated = nodeDef.parse({
      id: "gated00000",
      constraints: [
        countLimit(
          ALL,
          { max: 0 },
          { when: atLeastOne({ type: "nodeDefId", ids: ["absent0000"] }) },
        ),
      ],
    });
    const rs = ruleset({ gated00000: gated });
    expect(validateList(makeList(rootInstance("gated00000", [g("grunt00000", 4)])), rs)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("an unresolvable resourceLimit makes the constraint inactive", () => {
    const capped = nodeDef.parse({
      id: "capped0000",
      constraints: [
        {
          kind: "limit",
          metric: countOf(ALL),
          max: { op: "resourceLimit", resourceId: "nope000000" },
        },
      ],
    });
    const rs = ruleset({ capped0000: capped }, { resources: [], formats: [] });
    expect(validateList(makeList(rootInstance("capped0000", [g("grunt00000", 99)])), rs)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("drops an overridden constraint declared on the same node", () => {
    const army = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit({ type: "nodeDefId", ids: ["grunt00000"] }, { max: 1 }, { id: "c000000001" }),
        countLimit(
          { type: "nodeDefId", ids: ["grunt00000"] },
          { max: 5 },
          { id: "c000000002", overrides: ["c000000001"] },
        ),
      ],
    });
    const rs = ruleset({ army000000: army });
    expect(validateList(makeList(rootInstance("army000000", [g("grunt00000", 3)])), rs)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("an override reaches into descendants but not up to ancestors", () => {
    const parent = nodeDef.parse({
      id: "parent0000",
      constraints: [
        countLimit(
          { type: "nodeDefId", ids: ["grunt00000"] },
          { max: 9 },
          {
            id: "c000000001",
            overrides: ["c000000002"],
          },
        ),
        countLimit({ type: "nodeDefId", ids: ["banner0000"] }, { max: 0 }, { id: "c000000003" }),
      ],
    });
    const child = nodeDef.parse({
      id: "child00000",
      constraints: [
        // Suppressed: the child sits inside the parent's subtree.
        countLimit({ type: "nodeDefId", ids: ["grunt00000"] }, { max: 1 }, { id: "c000000002" }),
        // Reaches upward, so it must NOT suppress the parent's c000000003.
        countLimit(ALL, { max: 99 }, { id: "c000000004", overrides: ["c000000003"] }),
      ],
    });
    const rs = ruleset({ parent0000: parent, child00000: child });
    const l = makeList(
      rootInstance("parent0000", [
        g("banner0000", 1),
        inst("bbbbbbbbbb", "child00000", [g("grunt00000", 3)]),
      ]),
    );
    const { errors } = validateList(l, rs);
    expect(codes(errors)).toEqual(["limit-above-max"]);
    expect(errors[0]?.constraintId).toBe("c000000003");
  });

  it("an inactive constraint's overrides suppress nothing", () => {
    const army = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit({ type: "nodeDefId", ids: ["grunt00000"] }, { max: 1 }, { id: "c000000001" }),
        countLimit(
          { type: "nodeDefId", ids: ["grunt00000"] },
          { max: 5 },
          {
            id: "c000000002",
            overrides: ["c000000001"],
            when: atLeastOne({ type: "nodeDefId", ids: ["absent0000"] }),
          },
        ),
      ],
    });
    const rs = ruleset({ army000000: army });
    const { errors } = validateList(makeList(rootInstance("army000000", [g("grunt00000", 3)])), rs);
    expect(codes(errors)).toEqual(["limit-above-max"]);
    expect(errors[0]?.constraintId).toBe("c000000001");
  });
});

describe("validateList — a percentage-of-points rule", () => {
  const PTS = "pts0000000";
  const army = nodeDef.parse({
    id: "army000000",
    constraints: [
      {
        id: "c000000001",
        kind: "limit",
        metric: {
          op: "percentOf",
          part: {
            op: "costSum",
            selector: { type: "nodeCategory", categoryId: "char000000" },
            resourceId: PTS,
          },
          whole: { op: "costSum", selector: ALL, resourceId: PTS },
        },
        max: k(25),
      },
    ],
  });
  const rs = ruleset(
    {
      army000000: army,
      hero000000: nodeDef.parse({
        id: "hero000000",
        categoryId: "char000000",
        baseCosts: { [PTS]: 100 },
      }),
      troop00000: nodeDef.parse({ id: "troop00000", baseCosts: { [PTS]: 100 } }),
    },
    { resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }], formats: [] },
  );

  it("flags 300 of 1000 on characters and reports the computed percentage", () => {
    const { errors } = validateList(
      makeList(rootInstance("army000000", [g("hero000000", 3), g("troop00000", 7)])),
      rs,
    );
    expect(codes(errors)).toEqual(["limit-above-max"]);
    expect(errors[0]?.values).toEqual({ metric: 30, max: 25 });
  });

  it("passes at 200 of 1000", () => {
    expect(
      validateList(
        makeList(rootInstance("army000000", [g("hero000000", 2), g("troop00000", 8)])),
        rs,
      ),
    ).toEqual({ errors: [], warnings: [] });
  });
});

describe("validateList — authored messages", () => {
  it("interpolates metricRef nodes from the resolved values", () => {
    const message = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Only " },
            { type: "metricRef", attrs: { name: "max" } },
            { type: "text", text: " allowed, you have " },
            { type: "metricRef", attrs: { name: "metric" } },
            { type: "text", text: "." },
          ],
        },
      ],
    };
    const army = nodeDef.parse({
      id: "army000000",
      constraints: [
        countLimit({ type: "nodeDefId", ids: ["grunt00000"] }, { max: 2 }, { message }),
      ],
    });
    const { errors } = validateList(
      makeList(rootInstance("army000000", [g("grunt00000", 5)])),
      ruleset({ army000000: army }),
    );
    expect(errors[0]?.message).toBe("Only 2 allowed, you have 5.");
  });
});

describe("validateList — FormatDef.constraints", () => {
  const nodeDefs = {
    troop00000: nodeDef.parse({ id: "troop00000", categoryId: "unit000000" }),
    elite00000: nodeDef.parse({ id: "elite00000", categoryId: "unit000000" }),
  };
  const lb = {
    resources: [],
    formats: [
      {
        id: "combinedar",
        name: "Combined Arms",
        constraints: [
          countLimit(
            { type: "nodeCategory", categoryId: "unit000000" },
            { max: 6 },
            { perPartition: { key: { type: "nodeDefId" } } },
          ),
        ],
      },
    ],
  };
  const withFormat = (root: SelectionEntry): List => makeList(root, { formatId: "combinedar" });

  it("enforces a per-unit-type cap against the whole list", () => {
    const { errors } = validateList(
      withFormat(rootInstance("troop00000", [g("troop00000", 7)])),
      ruleset(nodeDefs, lb),
    );
    // the root troop instance (1) + the child group (7) = 8 > 6
    expect(codes(errors)).toEqual(["limit-above-max"]);
    expect(errors[0]?.path).toBeUndefined();
  });

  it("passes 6 + 6 of two unit types", () => {
    expect(
      validateList(
        withFormat(rootInstance("hqroot0000", [g("troop00000", 6), g("elite00000", 6)])),
        ruleset({ ...nodeDefs, hqroot0000: nodeDef.parse({ id: "hqroot0000" }) }, lb),
      ),
    ).toEqual({ errors: [], warnings: [] });
  });
});

describe("validateList — ChildSlotDef min / max", () => {
  const platoon = nodeDef.parse({
    id: "platoon000",
    childSlots: [{ id: "squads0000", name: "Squads", min: 2, max: 3 }],
  });
  const rs = ruleset({ platoon000: platoon, squad00000: nodeDef.parse({ id: "squad00000" }) });
  const platoon_ = (n: number): List =>
    makeList(rootInstance("platoon000", [g("squad00000", n, "squads0000")]));

  it("flags under- and over-occupancy, and passes within bounds", () => {
    expect(codes(validateList(platoon_(1), rs).errors)).toEqual(["slot-below-min"]);
    expect(codes(validateList(platoon_(4), rs).errors)).toEqual(["slot-above-max"]);
    expect(validateList(platoon_(2), rs)).toEqual({ errors: [], warnings: [] });
  });
});

describe("validateList — OptionDef min / max", () => {
  const hero = nodeDef.parse({
    id: "hero000000",
    options: [
      {
        id: "relic00000",
        kind: "toggleFieldValue",
        fieldId: "kw00000000",
        fieldValue: "Relic",
        direction: "add",
        min: 1,
        max: 2,
      },
      {
        id: "boon000000",
        kind: "toggleFieldValue",
        fieldId: "kw00000000",
        fieldValue: "Boon",
        direction: "add",
        max: 1,
      },
    ],
  });
  const rs = ruleset({ hero000000: hero });
  const hero_ = (appliedOptions: AppliedOption[]): List =>
    makeList(rootInstance("hero000000", [], appliedOptions));

  it("flags a mandatory option that was never taken", () => {
    expect(codes(validateList(hero_([]), rs).errors)).toContain("option-below-min");
  });

  it("passes when a mandatory option is taken within its max", () => {
    expect(validateList(hero_([{ optionId: "relic00000" }]), rs)).toEqual({
      errors: [],
      warnings: [],
    });
  });

  it("flags exceeding max across the instance", () => {
    const { errors } = validateList(
      hero_([{ optionId: "relic00000" }, { optionId: "relic00000" }, { optionId: "relic00000" }]),
      rs,
    );
    expect(codes(errors)).toContain("option-above-max");
  });

  it("checks max per distinct targetInstanceId", () => {
    const over = validateList(
      hero_([
        { optionId: "relic00000" },
        { optionId: "boon000000", targetInstanceId: "xAxxxxxxxx" },
        { optionId: "boon000000", targetInstanceId: "xAxxxxxxxx" },
      ]),
      rs,
    );
    expect(codes(over.errors)).toContain("option-above-max");

    const spread = validateList(
      hero_([
        { optionId: "relic00000" },
        { optionId: "boon000000", targetInstanceId: "xAxxxxxxxx" },
        { optionId: "boon000000", targetInstanceId: "xBxxxxxxxx" },
      ]),
      rs,
    );
    expect(codes(spread.errors)).not.toContain("option-above-max");
  });
});

describe("validateList — CategoryRecord.constraints collection", () => {
  function rsWithRecords(
    nodeDefs: Record<string, NodeDef>,
    records: Record<string, unknown>,
  ): Ruleset {
    const base = createRuleset();
    return {
      ...base,
      registry: {
        ...base.registry,
        nodeDefs,
        categoryRecords: Object.fromEntries(
          Object.entries(records).map(([id, r]) => [id, categoryRecord.parse(r)]),
        ),
      },
      listBuilding: listBuilding.parse({
        fields: [
          { id: "faction000", type: "reference", categoryId: "factioncat" },
          { id: "parentfac0", type: "reference", categoryId: "factioncat" },
        ],
      }),
    };
  }

  const withFaction: Record<string, NodeDef> = {
    army000000: nodeDef.parse({ id: "army000000", fields: { faction000: "empirerec0" } }),
    hero000000: nodeDef.parse({ id: "hero000000" }),
    mage000000: nodeDef.parse({ id: "mage000000" }),
  };
  const records = {
    empirerec0: {
      id: "empirerec0",
      categoryId: "factioncat",
      values: { parentfac0: "subfacrec0" },
      constraints: [countLimit({ type: "nodeDefId", ids: ["hero000000"] }, { max: 1 })],
    },
    subfacrec0: {
      id: "subfacrec0",
      categoryId: "factioncat",
      values: {},
      constraints: [countLimit({ type: "nodeDefId", ids: ["mage000000"] }, { max: 2 })],
    },
  };

  it("pulls in the referenced record's constraints and stacks transitively", () => {
    const rs = rsWithRecords(withFaction, records);
    const l = makeList(rootInstance("army000000", [g("hero000000", 2), g("mage000000", 3)]));
    expect(codes(validateList(l, rs).errors).sort()).toEqual([
      "limit-above-max",
      "limit-above-max",
    ]);
  });

  it("no record constraints when the node has no reference field value", () => {
    const rs = rsWithRecords({ army000000: nodeDef.parse({ id: "army000000" }) }, records);
    const l = makeList(rootInstance("army000000", [g("hero000000", 5), g("mage000000", 5)]));
    expect(validateList(l, rs)).toEqual({ errors: [], warnings: [] });
  });
});
