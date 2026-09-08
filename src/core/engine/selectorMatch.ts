import type { FieldValue, Selector } from "../schema/selector";
import { assertNever } from "./assertNever";

/**
 * Pure `Selector` matching against a single already-resolved node — no tree
 * walking, no schema lookups. Kept as a leaf module so `candidates.ts` can use
 * it while `selectorEval.ts` depends on *both*, without a cycle.
 */

/** The minimum a `Selector` needs to decide whether one node matches. */
export interface MatchCandidate {
  defId: string;
  categoryId: string | undefined;
  fields: Record<string, FieldValue>;
  /** Empty for a group — groups have applied nothing by construction. */
  appliedOptionIds: Set<string>;
}

export function matchesSelector(sel: Selector, cand: MatchCandidate): boolean {
  switch (sel.type) {
    case "all":
      return true;
    case "nodeDefId":
      return sel.ids.includes(cand.defId);
    case "nodeCategory":
      return cand.categoryId === sel.categoryId;
    case "fieldEquals":
      return fieldValueEquals(cand.fields[sel.fieldId], sel.value);
    case "fieldIncludes": {
      const v = cand.fields[sel.fieldId];
      return Array.isArray(v) && v.includes(sel.value);
    }
    case "fieldCompare": {
      const v = cand.fields[sel.fieldId];
      if (typeof v !== "number") return false;
      switch (sel.op) {
        case "gt":
          return v > sel.value;
        case "gte":
          return v >= sel.value;
        case "lt":
          return v < sel.value;
        case "lte":
          return v <= sel.value;
        default:
          return assertNever(sel.op);
      }
    }
    case "optionTaken":
      return cand.appliedOptionIds.has(sel.optionId);
    case "not":
      return !matchesSelector(sel.selector, cand);
    case "and":
      return sel.selectors.every((s) => matchesSelector(s, cand));
    case "or":
      return sel.selectors.some((s) => matchesSelector(s, cand));
    default:
      return assertNever(sel);
  }
}

function fieldValueEquals(a: FieldValue | undefined, b: FieldValue): boolean {
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((v, i) => v === b[i]);
  }
  return a === b;
}
