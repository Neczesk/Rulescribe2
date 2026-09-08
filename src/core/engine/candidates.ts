import type { NodeDef, OptionDef } from "../schema/listBuilding";
import type { Ruleset } from "../schema/ruleset";
import type { Selector } from "../schema/selector";
import type { InstanceSelection, SelectionEntry } from "../schema/selection";
import { assertNever } from "./assertNever";
import { effectiveChildren, effectiveFields } from "./resolve";
import { matchesSelector, type MatchCandidate } from "./selectorMatch";

/**
 * The flattened candidate model every evaluator works over.
 *
 * A `Selector` alone could be answered by walking the tree lazily, but a
 * `Metric` inside a `perPartition` bucket needs the **candidate set restricted
 * first** and its own selector applied second — so the subtree is flattened
 * once, depth-first, and everything downstream filters that list.
 */

export interface EvalCtx {
  nodeDefs: Record<string, NodeDef>;
  /** When present, `effectiveFields` resolves `toggleFieldValue` by declared `FieldDef.type`. */
  ruleset?: Ruleset;
}

export interface Candidate extends MatchCandidate {
  entry: SelectionEntry;
  /** A `GroupedSelection` contributes its full `count`; an instance contributes 1. */
  count: number;
  /** Depth-first position. */
  index: number;
  /** Exclusive: `[index, subtreeEnd)` is exactly this node's subtree, itself included. */
  subtreeEnd: number;
  /**
   * This node's own contribution to the list total: `baseCosts` (× `count` for a
   * group) plus its own applied-option surcharges. **Descendants excluded** —
   * summing `ownCost` over an index range gives that subtree's cost, which is
   * what `costSum` and `computeListCost` both do.
   */
  ownCost: Record<string, number>;
}

/**
 * Flatten a subtree depth-first, descending `effectiveChildren` so option-added
 * and swapped units are present. `deep: false` keeps only the entries given
 * (used for `perChild` slot occupancy).
 */
export function flattenSubtree(entries: SelectionEntry[], ctx: EvalCtx, deep = true): Candidate[] {
  const out: Candidate[] = [];

  const walk = (list: SelectionEntry[]): void => {
    for (const entry of list) {
      const index = out.length;
      const candidate: Candidate = {
        ...matchCandidate(entry, ctx),
        entry,
        count: entry.kind === "group" ? entry.count : 1,
        index,
        subtreeEnd: index + 1,
        ownCost: ownCost(entry, ctx),
      };
      out.push(candidate);
      if (deep && entry.kind === "instance") walk(effectiveChildren(entry, ctx.nodeDefs));
      candidate.subtreeEnd = out.length;
    }
  };

  walk(entries);
  return out;
}

/** The selector-facing view of one entry: a group reads `NodeDef.fields`, an instance its effective ones. */
export function matchCandidate(entry: SelectionEntry, ctx: EvalCtx): MatchCandidate {
  const def = ctx.nodeDefs[entry.defId];
  if (entry.kind === "group") {
    return {
      defId: entry.defId,
      categoryId: def?.categoryId,
      fields: def?.fields ?? {},
      appliedOptionIds: new Set(),
    };
  }
  return {
    defId: entry.defId,
    categoryId: def?.categoryId,
    fields: effectiveFields(entry, ctx.nodeDefs, ctx.ruleset),
    appliedOptionIds: new Set(entry.appliedOptions.map((a) => a.optionId)),
  };
}

/**
 * Sum `ownCost` for one resource over the candidates whose `index` falls in
 * `[from, to)`. Filters on `index` rather than array position, so it works
 * against a subtree slice as well as a whole flatten.
 */
export function sumOwnCost(
  candidates: Candidate[],
  resourceId: string,
  from: number,
  to: number,
): number {
  let total = 0;
  for (const cand of candidates) {
    if (cand.index >= from && cand.index < to) total += cand.ownCost[resourceId] ?? 0;
  }
  return total;
}

function ownCost(entry: SelectionEntry, ctx: EvalCtx): Record<string, number> {
  const out: Record<string, number> = {};
  const def = ctx.nodeDefs[entry.defId];
  if (!def) return out;

  const add = (resourceId: string, amount: number): void => {
    if (!resourceId) return;
    out[resourceId] = (out[resourceId] ?? 0) + amount;
  };

  if (entry.kind === "group") {
    for (const [rid, c] of Object.entries(def.baseCosts)) add(rid, c * entry.count);
    return out;
  }

  for (const [rid, c] of Object.entries(def.baseCosts)) add(rid, c);
  for (const applied of entry.appliedOptions) {
    const opt = def.options.find((o) => o.id === applied.optionId);
    if (opt) addOptionCost(opt, entry, ctx, add);
  }
  return out;
}

const MATCH_ALL: Selector = { type: "all" };

function addOptionCost(
  opt: OptionDef,
  instance: InstanceSelection,
  ctx: EvalCtx,
  add: (resourceId: string, amount: number) => void,
): void {
  const cost = opt.cost;
  switch (cost.type) {
    case "flat":
      add(cost.resourceId, cost.amount);
      return;
    case "perChild": {
      // Occupancy = effective direct children in that slot (`slotId` is stored,
      // not inferred), narrowed by the option's own `filter` when present.
      const filter = cost.filter ?? MATCH_ALL;
      let occupancy = 0;
      for (const child of effectiveChildren(instance, ctx.nodeDefs)) {
        if (child.slotId !== cost.slotId) continue;
        if (!matchesSelector(filter, matchCandidate(child, ctx))) continue;
        occupancy += child.kind === "group" ? child.count : 1;
      }
      add(cost.resourceId, cost.amountPerUnit * occupancy);
      return;
    }
    default:
      assertNever(cost);
  }
}
