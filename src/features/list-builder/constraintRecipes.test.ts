import { describe, expect, it } from "vitest";
import { constraintDef } from "../../core/schema/listBuilding";
import {
  compileRecipe,
  type RecipeId,
  type RecipeSlots,
  recipeOf,
  selectorFromSlot,
  slotFromSelector,
} from "./constraintRecipes";

const CAT = "cat:modelcatx";
const CAT2 = "cat:herocatxx";
const NODE = "node:bannerx00";
const PTS = "pts0000000";

function roundTrip(recipeId: RecipeId, slots: RecipeSlots) {
  const parsed = constraintDef.parse({ ...compileRecipe(recipeId, slots), id: "c000000001" });
  return recipeOf(parsed);
}

describe("compileRecipe -> constraintDef -> recipeOf round-trips", () => {
  const cases: [RecipeId, RecipeSlots][] = [
    ["cap", { subject: CAT, n: "3" }],
    ["require", { subject: NODE, n: "2" }],
    ["ratio", { subject: NODE, per: CAT, n: "10" }],
    ["share", { subject: CAT2, resource: PTS, n: "25" }],
    ["ifthen", { ifSubject: CAT, thenSubject: NODE }],
  ];

  for (const [recipeId, slots] of cases) {
    it(recipeId, () => {
      expect(roundTrip(recipeId, slots)).toEqual({ recipeId, slots });
    });
  }

  it("cap with an 'all' subject", () => {
    expect(roundTrip("cap", { subject: "all", n: "1" })).toEqual({
      recipeId: "cap",
      slots: { subject: "all", n: "1" },
    });
  });
});

describe("recipeOf disqualifiers", () => {
  const base = {
    id: "c000000001",
    kind: "limit" as const,
    metric: { op: "count", selector: { type: "all" } },
  };

  it("engine-generated constraints never classify", () => {
    const c = constraintDef.parse({
      ...base,
      max: { op: "constant", value: 3 },
      generatedFor: { resourceId: PTS },
    });
    expect(recipeOf(c)).toBeNull();
  });

  it("a constraint with author values never classifies", () => {
    const c = constraintDef.parse({
      ...base,
      max: { op: "constant", value: 3 },
      values: { spent: { op: "count", selector: { type: "all" } } },
    });
    expect(recipeOf(c)).toBeNull();
  });

  it("a two-id nodeDefId selector is not a slot", () => {
    const c = constraintDef.parse({
      ...base,
      metric: { op: "count", selector: { type: "nodeDefId", ids: ["aaaaaaaaaa", "bbbbbbbbbb"] } },
      max: { op: "constant", value: 3 },
    });
    expect(recipeOf(c)).toBeNull();
  });

  it("a limit with both bounds is neither cap nor require", () => {
    const c = constraintDef.parse({
      ...base,
      min: { op: "constant", value: 1 },
      max: { op: "constant", value: 3 },
    });
    expect(recipeOf(c)).toBeNull();
  });

  it("a ratio-ish max without floor does not match", () => {
    const c = constraintDef.parse({
      ...base,
      max: {
        op: "divide",
        operands: [
          { op: "count", selector: { type: "all" } },
          { op: "constant", value: 2 },
        ],
      },
    });
    expect(recipeOf(c)).toBeNull();
  });

  it("share needs the same resource on part and whole", () => {
    const c = constraintDef.parse({
      ...base,
      metric: {
        op: "percentOf",
        part: { op: "costSum", selector: { type: "all" }, resourceId: "pts0000000" },
        whole: { op: "costSum", selector: { type: "all" }, resourceId: "cmd0000000" },
      },
      max: { op: "constant", value: 25 },
    });
    expect(recipeOf(c)).toBeNull();
  });
});

describe("recipeOf ignores decorations", () => {
  it("classifies the same core regardless of when / perPartition / overrides / severity / message", () => {
    const bare = constraintDef.parse({
      id: "c000000001",
      kind: "limit",
      metric: { op: "count", selector: { type: "nodeCategory", categoryId: "modelcatx0" } },
      max: { op: "constant", value: 3 },
    });
    const decorated = constraintDef.parse({
      id: "c000000002",
      kind: "limit",
      severity: "warning",
      metric: { op: "count", selector: { type: "nodeCategory", categoryId: "modelcatx0" } },
      max: { op: "constant", value: 3 },
      when: {
        op: "compare",
        left: { op: "count", selector: { type: "all" } },
        cmp: "gte",
        right: { op: "constant", value: 1 },
      },
      perPartition: { key: { type: "nodeDefId" } },
      overrides: ["cZZZZZZZZ9"],
      message: { type: "doc", content: [{ type: "paragraph" }] },
    });
    expect(recipeOf(bare)).toEqual(recipeOf(decorated));
    expect(recipeOf(decorated)).toEqual({
      recipeId: "cap",
      slots: { subject: "cat:modelcatx0", n: "3" },
    });
  });
});

describe("blank recipe", () => {
  it("fails to parse until a bound is filled", () => {
    expect(constraintDef.safeParse(compileRecipe("blank", { subject: CAT, n: "" })).success).toBe(
      false,
    );
    expect(
      constraintDef.safeParse(compileRecipe("blank", { subject: CAT, n: "2", bound: "max" }))
        .success,
    ).toBe(true);
    expect(
      constraintDef.safeParse(compileRecipe("blank", { subject: CAT, n: "2", bound: "min" }))
        .success,
    ).toBe(true);
  });
});

describe("selector slot mapping", () => {
  it("round-trips all / category / node", () => {
    for (const value of ["all", "cat:xyz", "node:abc"]) {
      expect(slotFromSelector(selectorFromSlot(value))).toBe(value);
    }
  });

  it("an empty slot resolves to the 'all' selector", () => {
    expect(selectorFromSlot("")).toEqual({ type: "all" });
  });
});
