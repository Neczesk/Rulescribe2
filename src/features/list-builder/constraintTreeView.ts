import type { Condition, Metric, PartitionKeySpec } from "../../core/schema/listBuilding";
import type { Selector } from "../../core/schema/selector";

/**
 * The tree face of the constraint editor: `flattenConstraint` turns a
 * (possibly-invalid, mid-edit) `limit` / `require` structure into a flat list of
 * path-addressed op rows, and `applyTreeTransform` performs one immutable edit
 * — change an operator, wrap a node in a new one, unwrap it back to its first
 * operand, append an operand, or reorder the operands of a fold node.
 *
 * Surfaced: `when` (when the structure-mode draft carries it), then `metric` /
 * `min` / `max` (limit) or `condition` (require). `perPartition` is edited by the
 * sentence face's clause sub-editor, never here.
 */

export const METRIC_OPS = [
  "count",
  "fieldSum",
  "fieldMax",
  "fieldMin",
  "costSum",
  "distinctCount",
  "resourceLimit",
  "constant",
  "add",
  "subtract",
  "multiply",
  "divide",
  "percentOf",
  "floor",
  "ceil",
  "round",
  "wholeSubtree",
] as const;

export const CONDITION_OPS = ["compare", "inSet", "multipleOf", "and", "or", "not", "nOf"] as const;

type MetricOp = (typeof METRIC_OPS)[number];
type ConditionOp = (typeof CONDITION_OPS)[number];

const SELECTOR_METRIC_OPS = new Set<MetricOp>([
  "count",
  "fieldSum",
  "fieldMax",
  "fieldMin",
  "costSum",
  "distinctCount",
]);
const ARITH_OPS = new Set<MetricOp>(["add", "subtract", "multiply", "divide"]);
const ROUND_OPS = new Set<MetricOp>(["floor", "ceil", "round", "wholeSubtree"]);
const GROUP_CONDITION_OPS = new Set<ConditionOp>(["and", "or", "nOf"]);

export type NodePath = (string | number)[];
export type TreeDomain = "metric" | "condition";

export type ArgSpec =
  | { kind: "selector"; selector: Selector }
  | { kind: "number"; value: number }
  | { kind: "resource"; resourceId: string }
  | { kind: "field"; fieldId: string }
  | { kind: "partitionKey"; key: PartitionKeySpec }
  | { kind: "cmp"; cmp: "lt" | "lte" | "eq" | "gte" | "gt" }
  | { kind: "step"; step: number }
  | { kind: "numbers"; values: number[] }
  | { kind: "nRange"; min: number | undefined; max: number | undefined };

export interface TreeRow {
  path: NodePath;
  depth: number;
  domain: TreeDomain;
  op: string;
  opOptions: readonly string[];
  args: ArgSpec[];
  /** `add` / `multiply` / `and` / `nOf` … — accepts another operand. */
  canAddOperand: boolean;
  /** Has at least one same-family child, so `unwrap` has something to promote. */
  canUnwrap: boolean;
  /** This row is an operand/condition inside a fold node, so it can be dragged among its siblings. */
  reorderable: boolean;
  /** Root rows only: `"when"` | `"metric"` | `"min"` | `"max"` | `"condition"`. */
  label?: string;
}

interface OpNode {
  op: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Flatten.
// ---------------------------------------------------------------------------

export function flattenConstraint(struct: Record<string, unknown>): TreeRow[] {
  const rows: TreeRow[] = [];
  if (struct.when !== undefined) walk(struct.when, ["when"], 0, "condition", "only when", rows);
  if (struct.kind === "require") {
    walk(struct.condition, ["condition"], 0, "condition", "require", rows);
    return rows;
  }
  walk(struct.metric, ["metric"], 0, "metric", "metric", rows);
  if (struct.min !== undefined) walk(struct.min, ["min"], 0, "metric", "min", rows);
  if (struct.max !== undefined) walk(struct.max, ["max"], 0, "metric", "max", rows);
  return rows;
}

function walk(
  raw: unknown,
  path: NodePath,
  depth: number,
  domain: TreeDomain,
  label: string,
  rows: TreeRow[],
): void {
  if (!isOpNode(raw)) return;
  const node = raw;
  const parentKey = path.at(-2);
  rows.push({
    path,
    depth,
    domain,
    op: node.op,
    opOptions: domain === "metric" ? METRIC_OPS : CONDITION_OPS,
    args: argsOf(node, domain),
    canAddOperand: isFoldNode(node, domain),
    canUnwrap: childrenOf(node, path, domain).length > 0,
    reorderable: parentKey === "operands" || parentKey === "conditions",
    label: depth === 0 ? label : undefined,
  });
  for (const child of childrenOf(node, path, domain)) {
    walk(child.node, child.path, depth + 1, child.domain, "", rows);
  }
}

function childrenOf(
  node: OpNode,
  path: NodePath,
  domain: TreeDomain,
): { node: unknown; path: NodePath; domain: TreeDomain }[] {
  if (domain === "metric") {
    if (ARITH_OPS.has(node.op as MetricOp)) {
      const operands = Array.isArray(node.operands) ? node.operands : [];
      return operands.map((o, i) => ({
        node: o,
        path: [...path, "operands", i],
        domain: "metric",
      }));
    }
    if (node.op === "percentOf") {
      return [
        { node: node.part, path: [...path, "part"], domain: "metric" },
        { node: node.whole, path: [...path, "whole"], domain: "metric" },
      ];
    }
    if (ROUND_OPS.has(node.op as MetricOp)) {
      return [{ node: node.of, path: [...path, "of"], domain: "metric" }];
    }
    return [];
  }
  switch (node.op) {
    case "compare":
      return [
        { node: node.left, path: [...path, "left"], domain: "metric" },
        { node: node.right, path: [...path, "right"], domain: "metric" },
      ];
    case "inSet":
    case "multipleOf":
      return [{ node: node.metric, path: [...path, "metric"], domain: "metric" }];
    case "and":
    case "or":
    case "nOf": {
      const conditions = Array.isArray(node.conditions) ? node.conditions : [];
      return conditions.map((c, i) => ({
        node: c,
        path: [...path, "conditions", i],
        domain: "condition" as const,
      }));
    }
    case "not":
      return [{ node: node.condition, path: [...path, "condition"], domain: "condition" }];
    default:
      return [];
  }
}

function argsOf(node: OpNode, domain: TreeDomain): ArgSpec[] {
  if (domain === "metric") {
    switch (node.op as MetricOp) {
      case "count":
        return [{ kind: "selector", selector: node.selector as Selector }];
      case "fieldSum":
      case "fieldMax":
      case "fieldMin":
        return [
          { kind: "selector", selector: node.selector as Selector },
          { kind: "field", fieldId: String(node.fieldId ?? "") },
        ];
      case "costSum":
        return [
          { kind: "selector", selector: node.selector as Selector },
          { kind: "resource", resourceId: String(node.resourceId ?? "") },
        ];
      case "distinctCount":
        return [
          { kind: "selector", selector: node.selector as Selector },
          { kind: "partitionKey", key: node.key as PartitionKeySpec },
        ];
      case "resourceLimit":
        return [{ kind: "resource", resourceId: String(node.resourceId ?? "") }];
      case "constant":
        return [{ kind: "number", value: Number(node.value ?? 0) }];
      default:
        return [];
    }
  }
  switch (node.op as ConditionOp) {
    case "compare":
      return [{ kind: "cmp", cmp: normalizeCmp(node.cmp) }];
    case "inSet":
      return [
        { kind: "numbers", values: Array.isArray(node.values) ? (node.values as number[]) : [] },
      ];
    case "multipleOf":
      return [{ kind: "step", step: Number(node.step ?? 1) }];
    case "nOf":
      return [
        {
          kind: "nRange",
          min: typeof node.min === "number" ? node.min : undefined,
          max: typeof node.max === "number" ? node.max : undefined,
        },
      ];
    default:
      return [];
  }
}

function normalizeCmp(value: unknown): "lt" | "lte" | "eq" | "gte" | "gt" {
  return value === "lt" || value === "lte" || value === "eq" || value === "gt" ? value : "gte";
}

function isFoldNode(node: OpNode, domain: TreeDomain): boolean {
  if (domain === "metric") return ARITH_OPS.has(node.op as MetricOp);
  return GROUP_CONDITION_OPS.has(node.op as ConditionOp);
}

function isOpNode(value: unknown): value is OpNode {
  return typeof value === "object" && value !== null && typeof (value as OpNode).op === "string";
}

// ---------------------------------------------------------------------------
// Transforms.
// ---------------------------------------------------------------------------

export type TreeTransform =
  | { type: "setOp"; path: NodePath; op: string }
  | { type: "setArg"; path: NodePath; index: number; arg: ArgSpec }
  | { type: "wrap"; path: NodePath; op: string }
  | { type: "unwrap"; path: NodePath }
  | { type: "addOperand"; path: NodePath }
  | { type: "wrapRoot"; rootKey: string; op: string }
  /** `path` is the parent fold node; move its child from index `from` to index `to`. */
  | { type: "reorderOperand"; path: NodePath; from: number; to: number };

export function applyTreeTransform<T extends Record<string, unknown>>(
  struct: T,
  transform: TreeTransform,
): T {
  switch (transform.type) {
    case "setOp":
      return updateAtPath(struct, transform.path, (node) => reshape(node, transform.op));
    case "setArg":
      return updateAtPath(struct, transform.path, (node) =>
        applyArg(node, transform.index, transform.arg),
      );
    case "wrap":
      return updateAtPath(struct, transform.path, (node) => wrapNode(node, transform.op));
    case "unwrap":
      return updateAtPath(struct, transform.path, (node) => unwrapNode(node));
    case "addOperand":
      return updateAtPath(struct, transform.path, (node) => addOperand(node));
    case "wrapRoot":
      return { ...struct, [transform.rootKey]: wrapNode(struct[transform.rootKey], transform.op) };
    case "reorderOperand":
      return updateAtPath(struct, transform.path, (node) =>
        reorderChildren(node, transform.from, transform.to),
      );
    default:
      return struct;
  }
}

function reorderChildren(raw: unknown, from: number, to: number): unknown {
  if (!isOpNode(raw)) return raw;
  const key = Array.isArray(raw.operands)
    ? "operands"
    : Array.isArray(raw.conditions)
      ? "conditions"
      : null;
  if (!key) return raw;
  const list = [...(raw[key] as unknown[])];
  const clampedFrom = Math.max(0, Math.min(list.length - 1, from));
  const clampedTo = Math.max(0, Math.min(list.length - 1, to));
  if (clampedFrom === clampedTo) return raw;
  const [moved] = list.splice(clampedFrom, 1);
  list.splice(clampedTo, 0, moved);
  return { ...raw, [key]: list };
}

function updateAtPath<T extends Record<string, unknown>>(
  struct: T,
  path: NodePath,
  updater: (node: unknown) => unknown,
): T {
  const [rootKey, ...rest] = path;
  return { ...struct, [rootKey]: updateNode(struct[rootKey as string], rest, updater) };
}

function updateNode(node: unknown, path: NodePath, updater: (node: unknown) => unknown): unknown {
  if (path.length === 0) return updater(node);
  const [seg, ...rest] = path;
  const record = node as Record<string, unknown>;
  if (seg === "operands" || seg === "conditions") {
    const [index, ...tail] = rest;
    const arr = (record[seg] as unknown[]) ?? [];
    return {
      ...record,
      [seg]: arr.map((el, i) => (i === index ? updateNode(el, tail, updater) : el)),
    };
  }
  return { ...record, [seg as string]: updateNode(record[seg as string], rest, updater) };
}

// --- reshape (setOp) --------------------------------------------------------

function reshape(raw: unknown, op: string): unknown {
  if (!isOpNode(raw)) return raw;
  return (METRIC_OPS as readonly string[]).includes(op)
    ? reshapeMetric(raw, op as MetricOp)
    : reshapeCondition(raw, op as ConditionOp);
}

function reshapeMetric(old: OpNode, op: MetricOp): Metric {
  const selector: Selector = SELECTOR_METRIC_OPS.has(old.op as MetricOp)
    ? (old.selector as Selector)
    : { type: "all" };
  const kids = metricChildren(old);

  switch (op) {
    case "count":
      return { op: "count", selector };
    case "fieldSum":
    case "fieldMax":
    case "fieldMin":
      return { op, selector, fieldId: typeof old.fieldId === "string" ? old.fieldId : "" };
    case "costSum":
      return { op: "costSum", selector, resourceId: keptResourceId(old) };
    case "distinctCount":
      return {
        op: "distinctCount",
        selector,
        key: (old.key as PartitionKeySpec) ?? { type: "nodeDefId" },
      };
    case "resourceLimit":
      return { op: "resourceLimit", resourceId: keptResourceId(old) };
    case "constant":
      return { op: "constant", value: typeof old.value === "number" ? old.value : 0 };
    case "add":
    case "subtract":
    case "multiply":
    case "divide": {
      const operands =
        kids.length >= 2 ? kids : kids.length === 1 ? [kids[0], K(0)] : [asLeaf(old), K(0)];
      return { op, operands };
    }
    case "percentOf":
      return { op: "percentOf", part: kids[0] ?? asLeaf(old), whole: kids[1] ?? K(1) };
    case "floor":
    case "ceil":
    case "round":
    case "wholeSubtree":
      return { op, of: kids[0] ?? asLeaf(old) };
    default:
      return { op: "constant", value: 0 };
  }
}

function reshapeCondition(old: OpNode, op: ConditionOp): Condition {
  const metricKid: Metric =
    old.op === "compare"
      ? (old.left as Metric)
      : old.op === "inSet" || old.op === "multipleOf"
        ? (old.metric as Metric)
        : { op: "count", selector: { type: "all" } };
  const groupKids: Condition[] = GROUP_CONDITION_OPS.has(old.op as ConditionOp)
    ? ((old.conditions as Condition[]) ?? [])
    : old.op === "not"
      ? [old.condition as Condition]
      : [old as unknown as Condition];

  switch (op) {
    case "compare":
      return {
        op: "compare",
        left: metricKid,
        cmp: old.op === "compare" ? normalizeCmp(old.cmp) : "gte",
        right: old.op === "compare" ? (old.right as Metric) : K(1),
      };
    case "inSet":
      return {
        op: "inSet",
        metric: metricKid,
        values: old.op === "inSet" && Array.isArray(old.values) ? (old.values as number[]) : [],
      };
    case "multipleOf":
      return {
        op: "multipleOf",
        metric: metricKid,
        step: old.op === "multipleOf" && typeof old.step === "number" ? old.step : 2,
      };
    case "and":
    case "or":
      return { op, conditions: groupKids.length > 0 ? groupKids : [defaultCondition()] };
    case "not":
      return { op: "not", condition: groupKids[0] ?? defaultCondition() };
    case "nOf":
      return {
        op: "nOf",
        conditions: groupKids.length > 0 ? groupKids : [defaultCondition()],
        min: old.op === "nOf" && typeof old.min === "number" ? old.min : 1,
        ...(old.op === "nOf" && typeof old.max === "number" ? { max: old.max } : {}),
      };
    default:
      return defaultCondition();
  }
}

function metricChildren(node: OpNode): Metric[] {
  if (ARITH_OPS.has(node.op as MetricOp)) return (node.operands as Metric[]) ?? [];
  if (node.op === "percentOf") return [node.part as Metric, node.whole as Metric];
  if (ROUND_OPS.has(node.op as MetricOp)) return [node.of as Metric];
  return [];
}

function keptResourceId(old: OpNode): string {
  return (old.op === "costSum" || old.op === "resourceLimit") && typeof old.resourceId === "string"
    ? old.resourceId
    : "";
}

function asLeaf(old: OpNode): Metric {
  if (
    SELECTOR_METRIC_OPS.has(old.op as MetricOp) ||
    old.op === "constant" ||
    old.op === "resourceLimit"
  ) {
    return old as unknown as Metric;
  }
  return K(0);
}

// --- wrap / unwrap / addOperand ------------------------------------------------

function wrapNode(raw: unknown, op: string): unknown {
  if (!isOpNode(raw)) return raw;
  if ((METRIC_OPS as readonly string[]).includes(op)) {
    const metric = raw as unknown as Metric;
    if (ARITH_OPS.has(op as MetricOp)) return { op, operands: [metric, K(0)] };
    if (op === "percentOf") return { op: "percentOf", part: metric, whole: K(1) };
    if (ROUND_OPS.has(op as MetricOp)) return { op, of: metric };
    return metric;
  }
  const condition = raw as unknown as Condition;
  if (op === "and" || op === "or") return { op, conditions: [condition] };
  if (op === "nOf") return { op: "nOf", conditions: [condition], min: 1 };
  if (op === "not") return { op: "not", condition };
  return condition;
}

function unwrapNode(raw: unknown): unknown {
  if (!isOpNode(raw)) return raw;
  const node = raw;
  if (Array.isArray(node.operands) && node.operands.length > 0) return node.operands[0];
  if (Array.isArray(node.conditions) && node.conditions.length > 0) return node.conditions[0];
  if (node.of !== undefined) return node.of;
  if (node.part !== undefined) return node.part;
  if (node.condition !== undefined) return node.condition;
  if (node.metric !== undefined) return node.metric;
  if (node.left !== undefined) return node.left;
  return (METRIC_OPS as readonly string[]).includes(node.op) ? K(0) : defaultCondition();
}

function addOperand(raw: unknown): unknown {
  if (!isOpNode(raw)) return raw;
  const node = raw;
  if (Array.isArray(node.operands)) return { ...node, operands: [...node.operands, K(0)] };
  if (Array.isArray(node.conditions)) {
    return { ...node, conditions: [...node.conditions, defaultCondition()] };
  }
  return node;
}

// --- defaults ---------------------------------------------------------------

function K(value: number): Metric {
  return { op: "constant", value };
}

export function defaultMetric(): Metric {
  return { op: "count", selector: { type: "all" } };
}

export function defaultCondition(): Condition {
  return { op: "compare", left: defaultMetric(), cmp: "gte", right: K(1) };
}

// --- setArg ---------------------------------------------------------------

function applyArg(raw: unknown, _index: number, arg: ArgSpec): unknown {
  if (!isOpNode(raw)) return raw;
  const node = { ...raw };
  switch (arg.kind) {
    case "selector":
      node.selector = arg.selector;
      break;
    case "number":
      node.value = arg.value;
      break;
    case "resource":
      node.resourceId = arg.resourceId;
      break;
    case "field":
      node.fieldId = arg.fieldId;
      break;
    case "partitionKey":
      node.key = arg.key;
      break;
    case "cmp":
      node.cmp = arg.cmp;
      break;
    case "step":
      node.step = arg.step;
      break;
    case "numbers":
      node.values = arg.values;
      break;
    case "nRange":
      if (arg.min === undefined) delete node.min;
      else node.min = arg.min;
      if (arg.max === undefined) delete node.max;
      else node.max = arg.max;
      break;
    default:
      break;
  }
  return node;
}
