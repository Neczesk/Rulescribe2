import type { Ruleset } from "../schema/ruleset";
import type { List } from "../schema/list";
import { flattenSubtree } from "./candidates";

/**
 * Roll a list's total spend up per resource id: every selected node's
 * `baseCosts` (× group count) plus every applied option's surcharge (`opt.cost`).
 *
 * Both this and `costSum` metrics sum the same per-node `Candidate.ownCost`, so
 * a subtree total can never disagree with the list total. Structural option
 * effects are counted because `flattenSubtree` descends `effectiveChildren` —
 * an `addChild` option's added node (and its defaulted grandchildren) is
 * present and costed; a `replaceChild` / `removeChild` option's removed
 * instance is absent, so its cost nets out without an explicit subtraction.
 */
export function computeListCost(list: List, ruleset: Ruleset): Record<string, number> {
  const ctx = { nodeDefs: ruleset.registry.nodeDefs, ruleset };
  const totals: Record<string, number> = {};
  for (const cand of flattenSubtree(list.root ? [list.root] : [], ctx)) {
    for (const [resourceId, amount] of Object.entries(cand.ownCost)) {
      totals[resourceId] = (totals[resourceId] ?? 0) + amount;
    }
  }
  return totals;
}
