import type { Selector } from "../schema/selector";
import type { InstanceSelection, SelectionEntry } from "../schema/selection";
import { type Candidate, type EvalCtx, flattenSubtree } from "./candidates";
import { matchesSelector, type MatchCandidate } from "./selectorMatch";

export type { EvalCtx } from "./candidates";
export { matchesSelector, type MatchCandidate } from "./selectorMatch";

export interface SelectorMatches {
  /** Total matched copies — a `GroupedSelection` contributes its full `count`. */
  count: number;
  /** The matched `InstanceSelection`s (never groups). */
  instances: InstanceSelection[];
  /**
   * Present only when `opts.partitionKey` was supplied: matches bucketed by
   * that key (a `null` / empty key drops the entry from every bucket).
   */
  partitions?: Map<string, SelectorMatches>;
}

/**
 * Bucket a match into subtree partition(s). A `string[]` drops the match into
 * every listed bucket (a `multiValue` field partitions by each member);
 * `null` / `[]` drops it from every bucket.
 */
export type PartitionKey = (cand: MatchCandidate) => string | string[] | null;

/**
 * Evaluate a `Selector` against a subtree. By default it walks **every
 * descendant at any depth**, descending through `effectiveChildren` so
 * option-added / swapped units are counted; pass `{ deep: false }` to consider
 * only the entries in `entries` directly.
 *
 * `GroupedSelection` entries contribute their `count` and can match
 * `nodeDefId` / `nodeCategory` / `fieldEquals` / `fieldIncludes` /
 * `fieldCompare` (fields read from the `NodeDef`) but never `optionTaken`.
 *
 * Pass `{ partitionKey }` to also get `partitions` on the result — matches
 * bucketed by that key, for `perPartition` constraints.
 */
export function evaluateSelector(
  sel: Selector,
  entries: SelectionEntry[],
  ctx: EvalCtx,
  opts: { deep?: boolean; partitionKey?: PartitionKey } = {},
): SelectorMatches {
  return collectMatches(sel, flattenSubtree(entries, ctx, opts.deep ?? true), opts.partitionKey);
}

/** The same reduction over an already-flattened candidate list. */
export function collectMatches(
  sel: Selector,
  candidates: Candidate[],
  partitionKey?: PartitionKey,
): SelectorMatches {
  const result: SelectorMatches = { count: 0, instances: [] };
  const partitions = partitionKey ? new Map<string, SelectorMatches>() : undefined;
  if (partitions) result.partitions = partitions;

  const bucketsFor = (cand: Candidate): SelectorMatches[] => {
    if (!partitionKey || !partitions) return [];
    const raw = partitionKey(cand);
    const keys = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    return keys.map((key) => {
      let bucket = partitions.get(key);
      if (!bucket) {
        bucket = { count: 0, instances: [] };
        partitions.set(key, bucket);
      }
      return bucket;
    });
  };

  for (const cand of candidates) {
    if (!matchesSelector(sel, cand)) continue;
    const instance = cand.entry.kind === "instance" ? cand.entry : undefined;
    result.count += cand.count;
    if (instance) result.instances.push(instance);
    for (const bucket of bucketsFor(cand)) {
      bucket.count += cand.count;
      if (instance) bucket.instances.push(instance);
    }
  }
  return result;
}

/** Group a candidate list into `perPartition` buckets, preserving depth-first order. */
export function partitionCandidates(
  candidates: Candidate[],
  partitionKey: PartitionKey,
): Map<string, Candidate[]> {
  const out = new Map<string, Candidate[]>();
  for (const cand of candidates) {
    const raw = partitionKey(cand);
    const keys = raw == null ? [] : Array.isArray(raw) ? raw : [raw];
    for (const key of keys) {
      const bucket = out.get(key);
      if (bucket) bucket.push(cand);
      else out.set(key, [cand]);
    }
  }
  return out;
}
