import type { Condition, ConstraintDef, Metric, PartitionKeySpec } from "../schema/constraint";
import type { Ruleset } from "../schema/ruleset";
import type { FieldValue, Selector } from "../schema/selector";
import { assertNever } from "./assertNever";

/**
 * A plain-English, one-line rendering of a `ConstraintDef` — for the authoring
 * UI's constraint list and the constraint editor's read-only fallback (a
 * constraint the recipe layer cannot classify still needs a summary). Not part
 * of validation and never shown to a player; `ConstraintDef.message` is the
 * player-facing text.
 *
 * Framework-free by design (no TipTap, no React): it belongs to `core/` so
 * export and future tooling can reuse it. Mechanical rather than fluent — the
 * sentence face of the editor is where a friendly phrasing lives.
 */
export function describeConstraint(c: ConstraintDef, ruleset: Ruleset): string {
  const names = nameResolvers(ruleset);

  let body: string;
  if (c.kind === "limit") {
    const metric = describeMetric(c.metric, names);
    if (c.min && c.max) {
      body = `${metric} must be between ${describeMetric(c.min, names)} and ${describeMetric(c.max, names)}`;
    } else if (c.max) {
      body = `${metric} must be at most ${describeMetric(c.max, names)}`;
    } else if (c.min) {
      body = `${metric} must be at least ${describeMetric(c.min, names)}`;
    } else {
      body = `${metric} has no bound set`;
    }
  } else {
    body = describeCondition(c.condition, names);
  }

  const whenPart = c.when ? `when ${describeCondition(c.when, names)}, ` : "";
  const sentence = capitalize(`${whenPart}${body}`);
  const partitionPart = c.perPartition
    ? ` (for each ${describePartitionKey(c.perPartition.key, names)})`
    : "";
  const messagePart = c.message ? " (custom message)" : "";
  const prefix = c.severity === "warning" ? "Warning — " : "";

  return `${prefix}${sentence}${partitionPart}${messagePart}.`;
}

// ---------------------------------------------------------------------------
// Metric.
// ---------------------------------------------------------------------------

function describeMetric(m: Metric, names: NameResolvers): string {
  switch (m.op) {
    case "count":
      return `the number of ${describeSelector(m.selector, names)}`;
    case "fieldSum":
      return `the total ${names.field(m.fieldId)} of ${describeSelector(m.selector, names)}`;
    case "fieldMax":
      return `the highest ${names.field(m.fieldId)} among ${describeSelector(m.selector, names)}`;
    case "fieldMin":
      return `the lowest ${names.field(m.fieldId)} among ${describeSelector(m.selector, names)}`;
    case "costSum":
      return `the ${names.resource(m.resourceId)} spent on ${describeSelector(m.selector, names)}`;
    case "distinctCount":
      return `the number of distinct ${describePartitionKey(m.key, names)} among ${describeSelector(m.selector, names)}`;
    case "resourceLimit":
      return `the ${names.resource(m.resourceId)} limit`;
    case "constant":
      return String(m.value);
    case "add":
      return joinOperands(m.operands, " + ", names);
    case "subtract":
      return joinOperands(m.operands, " − ", names);
    case "multiply":
      return joinOperands(m.operands, " × ", names);
    case "divide":
      return joinOperands(m.operands, " ÷ ", names);
    case "percentOf":
      return `${describeMetric(m.part, names)} as a percentage of ${describeMetric(m.whole, names)}`;
    case "floor":
      if (m.of.op === "divide" && m.of.operands.length === 2) {
        return `⌊${describeMetric(m.of.operands[0], names)} ÷ ${describeMetric(m.of.operands[1], names)}⌋`;
      }
      return `⌊${describeMetric(m.of, names)}⌋`;
    case "ceil":
      return `⌈${describeMetric(m.of, names)}⌉`;
    case "round":
      return `round(${describeMetric(m.of, names)})`;
    case "wholeSubtree":
      return `${describeMetric(m.of, names)} across the whole subtree`;
    default:
      return assertNever(m);
  }
}

function joinOperands(operands: Metric[], sep: string, names: NameResolvers): string {
  if (operands.length === 0) return "0";
  if (operands.length === 1) return describeMetric(operands[0], names);
  return `(${operands.map((o) => describeMetric(o, names)).join(sep)})`;
}

// ---------------------------------------------------------------------------
// Condition.
// ---------------------------------------------------------------------------

const CMP_WORDS: Record<Extract<Condition, { op: "compare" }>["cmp"], string> = {
  lt: "is less than",
  lte: "is at most",
  eq: "equals",
  gte: "is at least",
  gt: "is more than",
};

function describeCondition(cond: Condition, names: NameResolvers): string {
  switch (cond.op) {
    case "compare":
      return `${describeMetric(cond.left, names)} ${CMP_WORDS[cond.cmp]} ${describeMetric(cond.right, names)}`;
    case "inSet":
      return `${describeMetric(cond.metric, names)} is one of ${cond.values.join(", ") || "(nothing)"}`;
    case "multipleOf":
      return `${describeMetric(cond.metric, names)} is a multiple of ${cond.step}`;
    case "and":
      return `(${cond.conditions.map((c) => describeCondition(c, names)).join(" and ")})`;
    case "or":
      return `(${cond.conditions.map((c) => describeCondition(c, names)).join(" or ")})`;
    case "not":
      return `not (${describeCondition(cond.condition, names)})`;
    case "nOf": {
      const inner = cond.conditions.map((c) => describeCondition(c, names)).join("; ");
      let quantifier: string;
      if (cond.min != null && cond.max != null) quantifier = `between ${cond.min} and ${cond.max}`;
      else if (cond.min != null) quantifier = `at least ${cond.min}`;
      else if (cond.max != null) quantifier = `at most ${cond.max}`;
      else quantifier = "some";
      return `${quantifier} of [${inner}] hold`;
    }
    default:
      return assertNever(cond);
  }
}

// ---------------------------------------------------------------------------
// Selector — rendered as a noun phrase for "the number of …" contexts.
// ---------------------------------------------------------------------------

function describeSelector(sel: Selector, names: NameResolvers): string {
  switch (sel.type) {
    case "all":
      return "anything in the subtree";
    case "nodeCategory":
      return names.category(sel.categoryId);
    case "nodeDefId":
      if (sel.ids.length === 0) return "nothing";
      if (sel.ids.length === 1) return names.nodeDef(sel.ids[0]);
      return `${sel.ids.length} node types`;
    case "fieldEquals":
      return `things whose ${names.field(sel.fieldId)} is ${formatValue(sel.value)}`;
    case "fieldIncludes":
      return `things whose ${names.field(sel.fieldId)} includes ${sel.value}`;
    case "fieldCompare":
      return `things whose ${names.field(sel.fieldId)} ${CMP_SYMBOLS[sel.op]} ${sel.value}`;
    case "optionTaken":
      return "things with a particular option applied";
    case "not":
      return `things that are not ${describeSelector(sel.selector, names)}`;
    case "and":
      return sel.selectors.map((s) => describeSelector(s, names)).join(" and ");
    case "or":
      return `(${sel.selectors.map((s) => describeSelector(s, names)).join(" or ")})`;
    default:
      return assertNever(sel);
  }
}

const CMP_SYMBOLS: Record<Extract<Selector, { type: "fieldCompare" }>["op"], string> = {
  gt: ">",
  gte: "≥",
  lt: "<",
  lte: "≤",
};

function formatValue(value: FieldValue): string {
  if (Array.isArray(value)) return `[${value.join(", ")}]`;
  return String(value);
}

// ---------------------------------------------------------------------------
// Partition key.
// ---------------------------------------------------------------------------

function describePartitionKey(key: PartitionKeySpec, names: NameResolvers): string {
  switch (key.type) {
    case "nodeDefId":
      return "node type";
    case "nodeCategory":
      return "category";
    case "field":
      return `${names.field(key.fieldId)} value`;
    default:
      return assertNever(key);
  }
}

// ---------------------------------------------------------------------------
// Name resolution.
// ---------------------------------------------------------------------------

interface NameResolvers {
  field: (id: string) => string;
  resource: (id: string) => string;
  category: (id: string) => string;
  nodeDef: (id: string) => string;
}

function nameResolvers(ruleset: Ruleset): NameResolvers {
  const lb = ruleset.listBuilding;
  const fieldNames = new Map<string, string>();
  for (const f of lb?.fields ?? []) fieldNames.set(f.id, f.name);
  for (const category of lb?.categories ?? []) {
    for (const f of category.fields) fieldNames.set(f.id, f.name);
  }
  const resourceNames = new Map((lb?.resources ?? []).map((r) => [r.id, r.name]));
  const categoryNames = new Map((lb?.categories ?? []).map((c) => [c.id, c.name]));

  return {
    field: (id) => fieldNames.get(id)?.trim() || "an unknown field",
    resource: (id) => resourceNames.get(id)?.trim() || "an unknown resource",
    category: (id) => {
      if (!categoryNames.has(id)) return "an unknown category";
      return categoryNames.get(id)?.trim() || "an untitled category";
    },
    nodeDef: (id) => {
      const node = ruleset.registry.nodeDefs[id];
      if (!node) return "an unknown node type";
      return node.name.trim() || "an untitled node type";
    },
  };
}

function capitalize(text: string): string {
  return text.length > 0 ? text[0].toUpperCase() + text.slice(1) : text;
}
