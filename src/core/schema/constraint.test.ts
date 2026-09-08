import { describe, expect, it } from "vitest";
import {
  condition,
  constraintDef,
  eachCondition,
  eachMetric,
  metric,
  partitionKeySpec,
  type Condition,
  type Metric,
} from "./constraint";

const ID_RE = /^[A-Za-z0-9_-]{10}$/;
const ALL = { type: "all" } as const;
const one = { op: "constant", value: 1 } as const;

describe("partitionKeySpec", () => {
  it("parses each key kind", () => {
    expect(partitionKeySpec.parse({ type: "nodeDefId" })).toEqual({ type: "nodeDefId" });
    expect(partitionKeySpec.parse({ type: "nodeCategory" })).toEqual({ type: "nodeCategory" });
    expect(partitionKeySpec.parse({ type: "field", fieldId: "role" })).toEqual({
      type: "field",
      fieldId: "role",
    });
  });

  it("rejects an unknown key kind and a field key with no fieldId", () => {
    expect(partitionKeySpec.safeParse({ type: "slot" }).success).toBe(false);
    expect(partitionKeySpec.safeParse({ type: "field" }).success).toBe(false);
  });
});

describe("metric", () => {
  it("parses each leaf op", () => {
    expect(metric.safeParse({ op: "count", selector: ALL }).success).toBe(true);
    expect(metric.safeParse({ op: "fieldSum", selector: ALL, fieldId: "w" }).success).toBe(true);
    expect(metric.safeParse({ op: "fieldMax", selector: ALL, fieldId: "w" }).success).toBe(true);
    expect(metric.safeParse({ op: "fieldMin", selector: ALL, fieldId: "w" }).success).toBe(true);
    expect(metric.safeParse({ op: "costSum", selector: ALL, resourceId: "pts" }).success).toBe(
      true,
    );
    expect(
      metric.safeParse({ op: "distinctCount", selector: ALL, key: { type: "nodeDefId" } }).success,
    ).toBe(true);
    expect(metric.safeParse({ op: "resourceLimit", resourceId: "pts" }).success).toBe(true);
    expect(metric.safeParse({ op: "constant", value: -3 }).success).toBe(true);
  });

  it("parses each recursive op and round-trips a nested tree", () => {
    const nested: Metric = {
      op: "floor",
      of: {
        op: "divide",
        operands: [
          {
            op: "percentOf",
            part: { op: "count", selector: ALL },
            whole: { op: "constant", value: 4 },
          },
          { op: "wholeSubtree", of: { op: "costSum", selector: ALL, resourceId: "pts" } },
        ],
      },
    };
    expect(metric.parse(JSON.parse(JSON.stringify(nested)))).toEqual(nested);
    for (const op of ["add", "subtract", "multiply", "divide"]) {
      expect(metric.safeParse({ op, operands: [one, one] }).success).toBe(true);
    }
    for (const op of ["floor", "ceil", "round"]) {
      expect(metric.safeParse({ op, of: one }).success).toBe(true);
    }
  });

  it("rejects an unknown op and a malformed operand", () => {
    expect(metric.safeParse({ op: "median", selector: ALL }).success).toBe(false);
    expect(metric.safeParse({ op: "add", operands: [{ op: "nope" }] }).success).toBe(false);
  });
});

describe("condition", () => {
  it("parses each op and defaults inSet values to []", () => {
    expect(condition.safeParse({ op: "compare", left: one, cmp: "lte", right: one }).success).toBe(
      true,
    );
    expect(condition.parse({ op: "inSet", metric: one })).toMatchObject({ values: [] });
    expect(condition.safeParse({ op: "multipleOf", metric: one, step: 5 }).success).toBe(true);
    expect(
      condition.safeParse({ op: "not", condition: { op: "inSet", metric: one } }).success,
    ).toBe(true);
    expect(
      condition.safeParse({ op: "and", conditions: [{ op: "inSet", metric: one }] }).success,
    ).toBe(true);
  });

  it("rejects a non-positive multipleOf step and an unknown cmp", () => {
    expect(condition.safeParse({ op: "multipleOf", metric: one, step: 0 }).success).toBe(false);
    expect(condition.safeParse({ op: "compare", left: one, cmp: "ne", right: one }).success).toBe(
      false,
    );
  });
});

describe("constraintDef", () => {
  it("defaults id / severity / overrides / values on a minimal limit", () => {
    const c = constraintDef.parse({
      kind: "limit",
      metric: { op: "count", selector: ALL },
      max: one,
    });
    expect(c.id).toMatch(ID_RE);
    expect(c).toMatchObject({ severity: "error", overrides: [], values: {} });
  });

  it("rejects a limit with neither min nor max", () => {
    expect(
      constraintDef.safeParse({ kind: "limit", metric: { op: "count", selector: ALL } }).success,
    ).toBe(false);
  });

  it("rejects an nOf with neither min nor max, at any depth", () => {
    const bare = { op: "nOf", conditions: [] };
    expect(constraintDef.safeParse({ kind: "require", condition: bare }).success).toBe(false);
    expect(
      constraintDef.safeParse({
        kind: "require",
        condition: { op: "not", condition: { op: "and", conditions: [bare] } },
      }).success,
    ).toBe(false);
    expect(
      constraintDef.safeParse({ kind: "require", condition: { ...bare, min: 2 } }).success,
    ).toBe(true);
  });

  it("also refines an nOf inside `when`", () => {
    expect(
      constraintDef.safeParse({
        kind: "limit",
        metric: { op: "count", selector: ALL },
        max: one,
        when: { op: "nOf", conditions: [] },
      }).success,
    ).toBe(false);
  });

  it("round-trips a fully populated limit", () => {
    const original = constraintDef.parse({
      id: "c000000001",
      kind: "limit",
      severity: "warning",
      metric: {
        op: "percentOf",
        part: {
          op: "costSum",
          selector: { type: "nodeCategory", categoryId: "hero000000" },
          resourceId: "pts0000000",
        },
        whole: { op: "costSum", selector: ALL, resourceId: "pts0000000" },
      },
      max: { op: "constant", value: 25 },
      when: { op: "compare", left: { op: "count", selector: ALL }, cmp: "gte", right: one },
      perPartition: { key: { type: "field", fieldId: "role" }, expectedKeys: ["core", "rare"] },
      overrides: ["c000000002"],
      values: { spent: { op: "costSum", selector: ALL, resourceId: "pts0000000" } },
      generatedFor: { resourceId: "pts0000000" },
    });
    expect(constraintDef.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});

describe("eachCondition / eachMetric", () => {
  it("walks a condition tree depth-first, itself included", () => {
    const tree: Condition = {
      op: "and",
      conditions: [
        { op: "not", condition: { op: "inSet", metric: one, values: [1] } },
        { op: "nOf", conditions: [{ op: "multipleOf", metric: one, step: 2 }], min: 1 },
      ],
    };
    const ops: string[] = [];
    eachCondition(tree, (c) => ops.push(c.op));
    expect(ops).toEqual(["and", "not", "inSet", "nOf", "multipleOf"]);
  });

  it("walks a metric tree depth-first, itself included", () => {
    const tree: Metric = {
      op: "wholeSubtree",
      of: { op: "add", operands: [one, { op: "floor", of: { op: "count", selector: ALL } }] },
    };
    const ops: string[] = [];
    eachMetric(tree, (m) => ops.push(m.op));
    expect(ops).toEqual(["wholeSubtree", "add", "constant", "floor", "count"]);
  });
});
