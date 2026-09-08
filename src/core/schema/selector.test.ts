import { describe, expect, it } from "vitest";
import { selector } from "./selector";

describe("fieldValue in a selector", () => {
  it("accepts string, number, boolean and string[]", () => {
    for (const value of ["infantry", 3, true, ["a", "b"]]) {
      expect(selector.safeParse({ type: "fieldEquals", fieldId: "f", value }).success).toBe(true);
    }
  });
});

describe("selector leaf variants", () => {
  it("parses `all`", () => {
    expect(selector.parse({ type: "all" })).toEqual({ type: "all" });
  });

  it("defaults `nodeDefId.ids` to []", () => {
    expect(selector.parse({ type: "nodeDefId" })).toEqual({ type: "nodeDefId", ids: [] });
  });

  it("parses `fieldIncludes` and `optionTaken`", () => {
    expect(selector.parse({ type: "fieldIncludes", fieldId: "kw", value: "Fly" })).toEqual({
      type: "fieldIncludes",
      fieldId: "kw",
      value: "Fly",
    });
    expect(selector.parse({ type: "optionTaken", optionId: "opt1234567" })).toEqual({
      type: "optionTaken",
      optionId: "opt1234567",
    });
  });

  it("parses `fieldCompare` with a valid op", () => {
    expect(
      selector.parse({ type: "fieldCompare", fieldId: "wounds", op: "gte", value: 3 }),
    ).toEqual({ type: "fieldCompare", fieldId: "wounds", op: "gte", value: 3 });
  });

  it("rejects `fieldCompare` with an unknown op", () => {
    expect(
      selector.safeParse({ type: "fieldCompare", fieldId: "w", op: "eq", value: 3 }).success,
    ).toBe(false);
  });

  it("parses `nodeCategory` and round-trips it through JSON", () => {
    const s = { type: "nodeCategory", categoryId: "unit000000" };
    expect(selector.parse(s)).toEqual(s);
    expect(selector.parse(JSON.parse(JSON.stringify(selector.parse(s))))).toEqual(s);
  });

  it("rejects `nodeCategory` missing `categoryId`", () => {
    expect(selector.safeParse({ type: "nodeCategory" }).success).toBe(false);
  });
});

describe("selector recursive variants", () => {
  const deep = {
    type: "and",
    selectors: [
      {
        type: "or",
        selectors: [
          { type: "not", selector: { type: "fieldCompare", fieldId: "pts", op: "lt", value: 100 } },
        ],
      },
      { type: "nodeDefId", ids: ["abcdefghij"] },
    ],
  };

  it("parses a depth-3 nested selector and preserves structure", () => {
    expect(selector.parse(deep)).toEqual(deep);
  });

  it("round-trips the depth-3 selector through JSON", () => {
    const revived = selector.parse(JSON.parse(JSON.stringify(selector.parse(deep))));
    expect(revived).toEqual(deep);
  });

  it("rejects `not` missing its `selector`", () => {
    expect(selector.safeParse({ type: "not" }).success).toBe(false);
  });

  it("rejects `and` missing its `selectors`", () => {
    expect(selector.safeParse({ type: "and" }).success).toBe(false);
  });
});

describe("selector rejection", () => {
  it("rejects an unknown `type`", () => {
    expect(selector.safeParse({ type: "xor", selectors: [] }).success).toBe(false);
  });
});
