import { describe, expect, it } from "vitest";
import { constraintDef, type Metric } from "../../core/schema/listBuilding";
import {
  applyTreeTransform,
  CONDITION_OPS,
  flattenConstraint,
  METRIC_OPS,
} from "./constraintTreeView";

const K = (value: number): Metric => ({ op: "constant", value });
const ALL = { type: "all" } as const;

const ratioLimit = {
  kind: "limit",
  metric: { op: "count", selector: ALL },
  max: {
    op: "floor",
    of: { op: "divide", operands: [{ op: "count", selector: ALL }, K(10)] },
  },
};

describe("flattenConstraint", () => {
  it("emits metric then max, with paths and depths", () => {
    const rows = flattenConstraint(ratioLimit);
    expect(rows.map((r) => [r.path.join("."), r.depth, r.op])).toEqual([
      ["metric", 0, "count"],
      ["max", 0, "floor"],
      ["max.of", 1, "divide"],
      ["max.of.operands.0", 2, "count"],
      ["max.of.operands.1", 2, "constant"],
    ]);
    expect(rows[0].label).toBe("metric");
    expect(rows[1].label).toBe("max");
    expect(rows[2].label).toBeUndefined();
  });

  it("emits the condition tree for a require", () => {
    const rows = flattenConstraint({
      kind: "require",
      condition: {
        op: "and",
        conditions: [
          { op: "compare", left: { op: "count", selector: ALL }, cmp: "gte", right: K(1) },
        ],
      },
    });
    expect(rows.map((r) => [r.path.join("."), r.op])).toEqual([
      ["condition", "and"],
      ["condition.conditions.0", "compare"],
      ["condition.conditions.0.left", "count"],
      ["condition.conditions.0.right", "constant"],
    ]);
    expect(rows[0].canAddOperand).toBe(true);
  });
});

describe("applyTreeTransform — setOp", () => {
  it("count -> costSum keeps the selector and adds an empty resourceId", () => {
    const next = applyTreeTransform(ratioLimit, {
      type: "setOp",
      path: ["metric"],
      op: "costSum",
    });
    expect(next.metric).toEqual({ op: "costSum", selector: ALL, resourceId: "" });
  });

  it("divide -> multiply keeps the operands", () => {
    const next = applyTreeTransform(ratioLimit, {
      type: "setOp",
      path: ["max", "of"],
      op: "multiply",
    });
    expect(next.max as Metric).toMatchObject({
      op: "floor",
      of: {
        op: "multiply",
        operands: [
          { op: "count", selector: ALL },
          { op: "constant", value: 10 },
        ],
      },
    });
  });

  it("count -> add wraps the old node as the first operand", () => {
    const next = applyTreeTransform(
      { kind: "limit", metric: { op: "count", selector: ALL }, max: K(1) },
      { type: "setOp", path: ["metric"], op: "add" },
    );
    expect(next.metric).toEqual({
      op: "add",
      operands: [
        { op: "count", selector: ALL },
        { op: "constant", value: 0 },
      ],
    });
  });
});

describe("applyTreeTransform — wrap / unwrap / addOperand / wrapRoot", () => {
  const capLimit = { kind: "limit", metric: { op: "count", selector: ALL }, max: K(3) };

  it("wrap at a leaf nests it in an operator", () => {
    const next = applyTreeTransform(capLimit, { type: "wrap", path: ["metric"], op: "add" });
    expect(next.metric).toEqual({
      op: "add",
      operands: [
        { op: "count", selector: ALL },
        { op: "constant", value: 0 },
      ],
    });
  });

  it("wrapRoot wraps the whole metric", () => {
    const next = applyTreeTransform(capLimit, { type: "wrapRoot", rootKey: "metric", op: "floor" });
    expect(next.metric).toEqual({ op: "floor", of: { op: "count", selector: ALL } });
  });

  it("unwrap on floor(of: X) promotes X", () => {
    const next = applyTreeTransform(ratioLimit, { type: "unwrap", path: ["max"] });
    expect(next.max).toEqual({
      op: "divide",
      operands: [
        { op: "count", selector: ALL },
        { op: "constant", value: 10 },
      ],
    });
  });

  it("unwrap on a childless leaf falls back to a default", () => {
    const next = applyTreeTransform(capLimit, { type: "unwrap", path: ["metric"] });
    expect(next.metric).toEqual({ op: "constant", value: 0 });
  });

  it("addOperand appends a constant 0 to a fold", () => {
    const withAdd = applyTreeTransform(capLimit, { type: "wrap", path: ["metric"], op: "add" });
    const next = applyTreeTransform(withAdd, { type: "addOperand", path: ["metric"] });
    expect(next.metric as Metric).toMatchObject({
      op: "add",
      operands: [{ op: "count" }, { op: "constant", value: 0 }, { op: "constant", value: 0 }],
    });
  });
});

describe("exhaustiveness — every op flattens and reshapes without throwing", () => {
  it("metric ops", () => {
    for (const op of METRIC_OPS) {
      const next = applyTreeTransform(
        { kind: "limit", metric: { op: "count", selector: ALL }, max: K(1) },
        { type: "setOp", path: ["metric"], op },
      );
      expect(() => flattenConstraint(next)).not.toThrow();
      const flat = flattenConstraint(next);
      expect(flat[0].op).toBe(op);
      // A valid-before structure stays safeParse-able (success is a boolean either way).
      expect(typeof constraintDef.safeParse({ ...next, id: "c000000001" }).success).toBe("boolean");
    }
  });

  it("condition ops", () => {
    for (const op of CONDITION_OPS) {
      const next = applyTreeTransform(
        {
          kind: "require",
          condition: {
            op: "compare",
            left: { op: "count", selector: ALL },
            cmp: "gte",
            right: K(1),
          },
        },
        { type: "setOp", path: ["condition"], op },
      );
      expect(() => flattenConstraint(next)).not.toThrow();
      expect(flattenConstraint(next)[0].op).toBe(op);
    }
  });
});

describe("when branch", () => {
  it("flattens a folded `when` as the first root, labelled", () => {
    const rows = flattenConstraint({
      kind: "limit",
      when: {
        op: "and",
        conditions: [
          { op: "compare", left: { op: "count", selector: ALL }, cmp: "gte", right: K(1) },
        ],
      },
      metric: { op: "count", selector: ALL },
      max: K(3),
    });
    expect(rows[0]).toMatchObject({
      path: ["when"],
      depth: 0,
      domain: "condition",
      op: "and",
      label: "only when",
    });
    expect(rows.map((r) => r.path.join("."))).toEqual([
      "when",
      "when.conditions.0",
      "when.conditions.0.left",
      "when.conditions.0.right",
      "metric",
      "max",
    ]);
  });

  it("op-changes and wraps inside the when branch", () => {
    const base = {
      kind: "limit",
      when: { op: "compare", left: { op: "count", selector: ALL }, cmp: "gte", right: K(1) },
      metric: { op: "count", selector: ALL },
      max: K(1),
    };
    const wrapped = applyTreeTransform(base, { type: "wrap", path: ["when"], op: "not" });
    expect(wrapped.when).toEqual({
      op: "not",
      condition: { op: "compare", left: { op: "count", selector: ALL }, cmp: "gte", right: K(1) },
    });
  });
});

describe("reorderOperand", () => {
  const divide = {
    kind: "limit" as const,
    metric: { op: "count", selector: ALL },
    max: {
      op: "divide",
      operands: [{ op: "count", selector: ALL }, K(2), K(3)],
    },
  };

  it("marks operand rows reorderable, others not", () => {
    const rows = flattenConstraint(divide);
    const byPath = Object.fromEntries(rows.map((r) => [r.path.join("."), r.reorderable]));
    expect(byPath["max"]).toBe(false);
    expect(byPath["max.operands.0"]).toBe(true);
    expect(byPath["max.operands.1"]).toBe(true);
  });

  it("moves an operand and leaves the rest in order", () => {
    const next = applyTreeTransform(divide, {
      type: "reorderOperand",
      path: ["max"],
      from: 0,
      to: 2,
    });
    expect((next.max as { operands: unknown[] }).operands).toEqual([
      { op: "constant", value: 2 },
      { op: "constant", value: 3 },
      { op: "count", selector: ALL },
    ]);
  });

  it("reorders inside a condition group too", () => {
    const next = applyTreeTransform(
      {
        kind: "require",
        condition: {
          op: "and",
          conditions: [
            { op: "compare", left: { op: "count", selector: ALL }, cmp: "gte", right: K(1) },
            { op: "compare", left: { op: "count", selector: ALL }, cmp: "lte", right: K(9) },
          ],
        },
      },
      { type: "reorderOperand", path: ["condition"], from: 1, to: 0 },
    );
    expect(
      (next.condition as { conditions: { cmp: string }[] }).conditions.map((c) => c.cmp),
    ).toEqual(["lte", "gte"]);
  });

  it("clamps out-of-range indices instead of throwing", () => {
    const next = applyTreeTransform(divide, {
      type: "reorderOperand",
      path: ["max"],
      from: 0,
      to: 99,
    });
    expect((next.max as { operands: { value?: number }[] }).operands.at(-1)).toEqual({
      op: "count",
      selector: ALL,
    });
  });
});
