import type { JSONContent } from "@tiptap/core";
import { collectNodes } from "../schema/references";
import type { Ruleset } from "../schema/ruleset";

/**
 * Draft-only analysis of one article body: the working notes a playtester
 * should see, and the dangling references that need fixing before the rulebook
 * can ship. Pure — the draft builder turns this into flagged blocks.
 */

export interface DraftKeywordNote {
  /** Keyword display name, or a stand-in when the keyword is gone. */
  label: string;
  notes: string;
  /** The `keywordRef` points at an id no longer in the registry. */
  unresolved: boolean;
}

/** Distinct keyword ids referenced in `doc`, in first-seen order. */
function referencedKeywordIds(doc: JSONContent | undefined): string[] {
  const seen: string[] = [];
  for (const node of collectNodes(doc, "keywordRef")) {
    const id = node.attrs?.keywordId;
    if (typeof id === "string" && !seen.includes(id)) seen.push(id);
  }
  return seen;
}

/**
 * The "keyword notes touched by this article" list: every referenced keyword
 * that either carries author notes or has been deleted. Keywords with no notes
 * and a clean resolve are omitted (nothing to say about them).
 */
export function draftKeywordNotes(
  doc: JSONContent | undefined,
  ruleset: Ruleset,
): DraftKeywordNote[] {
  const out: DraftKeywordNote[] = [];
  for (const id of referencedKeywordIds(doc)) {
    const keyword = ruleset.registry.keywords[id];
    if (!keyword) {
      out.push({
        label: "deleted keyword",
        notes: "Referenced here, but the keyword was removed after it was linked.",
        unresolved: true,
      });
    } else if (keyword.notes.trim()) {
      out.push({
        label: keyword.displayName.trim() || "Untitled keyword",
        notes: keyword.notes.trim(),
        unresolved: false,
      });
    }
  }
  return out;
}

/** How many `articleRef` nodes in `doc` point at an id no longer in the registry. */
export function unresolvedArticleRefCount(doc: JSONContent | undefined, ruleset: Ruleset): number {
  let count = 0;
  for (const node of collectNodes(doc, "articleRef")) {
    const id = node.attrs?.articleId;
    if (typeof id === "string" && !ruleset.registry.articles[id]) count += 1;
  }
  return count;
}
