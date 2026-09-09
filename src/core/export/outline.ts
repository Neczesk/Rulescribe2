import { richTextToPlainText } from "../schema/references";
import type { Ruleset, StructureNode } from "../schema/ruleset";
import { buildNumbering } from "./numbering";

/** One row of the export's section list, in structure-tree order. */
export interface ExportSection {
  articleId: string;
  /** `registry.articles[articleId].title`, or a fallback. */
  title: string;
  /** Computed section number (`"2.1"`); `""` for the root. */
  number: string;
  /** Distance from the root node (root = 0). */
  depth: number;
  /** `article.isNotes` — scratch content, stripped from the rulebook. */
  isNotes: boolean;
  /** Word count of the article body, for the "≈ 210 w" hint in the dialog. */
  words: number;
}

const UNTITLED = "Untitled section";

/**
 * Flatten `ruleset.structure` into an ordered list of sections. Depth-first,
 * root first. The content for each row is fetched by id from
 * `registry.articles` (never by walking the tree) — a node whose article is
 * missing from the registry is skipped.
 */
export function buildOutline(ruleset: Ruleset): ExportSection[] {
  // Notes articles are stripped from the rulebook, so they don't consume a
  // section number — the first real section is "1" even behind a notes article.
  const numbers = buildNumbering(
    ruleset.structure,
    (id) => ruleset.registry.articles[id]?.isNotes ?? false,
  );
  const sections: ExportSection[] = [];

  const walk = (node: StructureNode, depth: number) => {
    const article = ruleset.registry.articles[node.articleId];
    if (article) {
      const body = richTextToPlainText(article.text);
      sections.push({
        articleId: node.articleId,
        title:
          article.title.trim() ||
          (depth === 0 ? ruleset.metadata.title.trim() || UNTITLED : UNTITLED),
        number: numbers.get(node.articleId) ?? "",
        depth,
        isNotes: article.isNotes,
        words: body ? body.split(/\s+/).length : 0,
      });
    }
    for (const child of node.children) walk(child, depth + 1);
  };

  walk(ruleset.structure, 0);
  return sections;
}

/**
 * The article ids that should be in the document by default: for the rulebook,
 * every non-notes section; for the draft, every section (notes included and
 * flagged). The dialog seeds its checkboxes from this and the user adjusts.
 */
export function defaultIncludedIds(
  outline: ExportSection[],
  mode: "rulebook" | "draft",
): Set<string> {
  return new Set(
    outline
      .filter((section) => mode === "draft" || !section.isNotes)
      .map((section) => section.articleId),
  );
}
