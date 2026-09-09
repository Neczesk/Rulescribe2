import { keywordReferences } from "../schema/references";
import type { Ruleset } from "../schema/ruleset";
import { buildNumbering } from "./numbering";

/* ── index of terms ───────────────────────────────────────────────────────── */

export interface TermIndexRef {
  number: string;
  articleId: string;
}

export interface TermIndexEntry {
  label: string;
  refs: TermIndexRef[];
}

/** Compare two dotted section numbers ("2.10" after "2.9"). */
function compareNumbers(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

/**
 * Every keyword that is used by at least one *included*, non-notes article,
 * alphabetical, each with the sorted list of section numbers it appears in.
 * Unused keywords are omitted.
 */
export function termIndex(ruleset: Ruleset, includedIds: Iterable<string>): TermIndexEntry[] {
  const included = new Set(includedIds);
  const numbers = buildNumbering(
    ruleset.structure,
    (id) => ruleset.registry.articles[id]?.isNotes ?? false,
  );
  const refs = keywordReferences(ruleset);

  const entries: TermIndexEntry[] = [];
  for (const keyword of Object.values(ruleset.registry.keywords)) {
    const seen = new Map<string, TermIndexRef>();
    for (const articleId of refs[keyword.id] ?? []) {
      const article = ruleset.registry.articles[articleId];
      if (!article || article.isNotes || !included.has(articleId)) continue;
      seen.set(articleId, { number: numbers.get(articleId) ?? "", articleId });
    }
    if (seen.size === 0) continue;
    entries.push({
      label: keyword.displayName.trim() || "Untitled keyword",
      refs: [...seen.values()].sort((a, b) => compareNumbers(a.number, b.number)),
    });
  }
  return entries.sort((a, b) => a.label.localeCompare(b.label));
}

/* ── list-building appendix ───────────────────────────────────────────────── */

export interface ListBuildingSummary {
  resources: { name: string; cap: string }[];
  formats: { name: string; caps: string }[];
  categories: { name: string; kind: string; fields: number; members: number }[];
  nodes: { name: string; category: string; cost: string }[];
}

/** A rules-agnostic tabular dump of the list-building data, or `null` when there is none. */
export function listBuildingSummary(ruleset: Ruleset): ListBuildingSummary | null {
  const lb = ruleset.listBuilding;
  const nodeDefs = Object.values(ruleset.registry.nodeDefs);
  const records = Object.values(ruleset.registry.categoryRecords);
  if (!lb && nodeDefs.length === 0) return null;

  const resourceName = (id: string) => lb?.resources.find((r) => r.id === id)?.name || id;
  const capText = (cap: { type: string; value?: number }) =>
    cap.type === "fixed"
      ? String(cap.value ?? 0)
      : cap.type === "playerChosen"
        ? "player-set"
        : "—";
  const costsText = (costs: Record<string, number>) =>
    Object.entries(costs)
      .map(([id, n]) => `${resourceName(id)} ${n}`)
      .join(" · ") || "—";

  const categories = (lb?.categories ?? []).map((category) => ({
    name: category.name || "Untitled category",
    kind: category.kind,
    fields: category.fields.length,
    members:
      category.kind === "node"
        ? nodeDefs.filter((n) => n.categoryId === category.id).length
        : records.filter((r) => r.categoryId === category.id).length,
  }));

  return {
    resources: (lb?.resources ?? [])
      .map((r) => ({ name: r.name || "Untitled resource", cap: capText(r.cap) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    formats: (lb?.formats ?? [])
      .map((f) => ({ name: f.name || "Untitled format", caps: costsText(f.resourceCaps) }))
      .sort((a, b) => a.name.localeCompare(b.name)),
    categories: categories.sort((a, b) => a.name.localeCompare(b.name)),
    nodes: nodeDefs
      .map((node) => ({
        name: node.name || "Untitled node type",
        category: lb?.categories.find((c) => c.id === node.categoryId)?.name || "—",
        cost: costsText(node.baseCosts),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}
