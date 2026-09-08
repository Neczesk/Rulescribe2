/**
 * Shared logic for the "enriched reference" feature: a `keywordRef` / `articleRef`
 * node can render its target's name (the default link), or stay in sync with the
 * target's summary (`shortText`) or full text (`text`), flattened to plain text.
 *
 * Framework-free — imports only from `core/schema` — so both the TipTap
 * extensions (via `currentRulesetStore`) and the React node views (via
 * `useRuleset()`) can share it, and it can be unit-tested without a DOM.
 */
import { richTextToPlainText } from "../../../core/schema/references";
import type { Ruleset } from "../../../core/schema/ruleset";

export const REF_DISPLAY_MODES = ["link", "name", "shortText", "text"] as const;

export type RefDisplay = (typeof REF_DISPLAY_MODES)[number];

/** Menu labels, matching the design canvas ("Ruleset Editor.dc.html"). */
export const REF_DISPLAY_LABELS: Record<RefDisplay, string> = {
  link: "Link (Name)",
  name: "Live: Name",
  shortText: "Live: Summary",
  text: "Live: Full text",
};

export const MISSING_KEYWORD_LABEL = "Unknown keyword";
export const MISSING_ARTICLE_LABEL = "Unknown article";

/** Coerce an unknown/legacy `display` attribute value to a valid mode. */
export function normalizeDisplay(value: unknown): RefDisplay {
  return (REF_DISPLAY_MODES as readonly unknown[]).includes(value) ? (value as RefDisplay) : "link";
}

/** The string a `keywordRef` node shows for the given display mode. */
export function resolveKeywordRefText(
  ruleset: Ruleset | null | undefined,
  keywordId: string | null,
  display: RefDisplay,
): string {
  const keyword = keywordId ? ruleset?.registry.keywords[keywordId] : undefined;
  if (display === "shortText") return richTextToPlainText(keyword?.shortText);
  if (display === "text") return richTextToPlainText(keyword?.text);
  return keyword?.displayName?.trim() || MISSING_KEYWORD_LABEL;
}

/** The string an `articleRef` node shows for the given display mode. */
export function resolveArticleRefText(
  ruleset: Ruleset | null | undefined,
  articleId: string | null,
  display: RefDisplay,
): string {
  const article = articleId ? ruleset?.registry.articles[articleId] : undefined;
  if (display === "shortText") return richTextToPlainText(article?.shortText);
  if (display === "text") return richTextToPlainText(article?.text);
  return article?.title?.trim() || MISSING_ARTICLE_LABEL;
}
