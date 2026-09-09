import { listBuildingSummary, termIndex } from "../../../core/export/generatedMatter";
import type { ExportSection } from "../../../core/export/outline";
import type { KeywordMode } from "../../../core/export/theme";
import type { Ruleset } from "../../../core/schema/ruleset";
import { escapeHtml } from "./escapeHtml";
import { renderRichTextHtml } from "./renderRichText";

/** Table of contents — links resolve to the `<section id="article-ID">` anchors. */
export function renderTocHtml(outline: ExportSection[]): string {
  if (outline.length === 0) return "";
  const items = outline
    .map(
      (section) =>
        `<li class="rs-toc-item" style="padding-left:calc(${section.depth - 1} * 1.3em)">` +
        `<a href="#article-${section.articleId}">` +
        (section.number ? `<span class="rs-toc-num">${section.number}</span> ` : "") +
        escapeHtml(section.title) +
        `</a></li>`,
    )
    .join("");
  return `<nav class="rs-appendix rs-toc"><h2>Contents</h2><ol class="rs-toc-list">${items}</ol></nav>`;
}

/** Version & credits page. */
export function renderCreditsHtml(ruleset: Ruleset, themeName: string): string {
  const meta = ruleset.metadata;
  const rows: [string, string][] = [
    ["Title", meta.title.trim() || "Untitled ruleset"],
    ["Author", meta.author.trim() || "—"],
    ["Created", meta.createdAt.format("D MMM YYYY")],
    ["Updated", meta.updatedAt.format("D MMM YYYY")],
    ["Schema version", String(ruleset.schemaVersion)],
    ["Articles", String(Object.keys(ruleset.registry.articles).length)],
    ["Keywords", String(Object.keys(ruleset.registry.keywords).length)],
    ["Diagrams", String(Object.keys(ruleset.registry.diagrams).length)],
    ["Theme", themeName],
  ];
  const body = rows
    .map(
      ([label, value]) =>
        `<tr><th scope="row">${escapeHtml(label)}</th><td>${escapeHtml(value)}</td></tr>`,
    )
    .join("");
  return `<section class="rs-appendix rs-credits"><h2>Version &amp; credits</h2><table><tbody>${body}</tbody></table></section>`;
}

/** Full glossary — every keyword, alphabetical, rendered rich text. */
export async function renderGlossaryHtml(
  ruleset: Ruleset,
  keywordMode: KeywordMode,
): Promise<string> {
  const keywords = Object.values(ruleset.registry.keywords).sort((a, b) =>
    (a.displayName || "").localeCompare(b.displayName || ""),
  );
  if (keywords.length === 0) return "";
  const entries = await Promise.all(
    keywords.map(async (keyword) => {
      const term = escapeHtml(keyword.displayName.trim() || "Untitled keyword");
      const definition = await renderRichTextHtml(keyword.text, ruleset, {
        keywordMode,
        dropTodos: true,
      });
      return `<dt id="glossary-${keyword.id}">${term}</dt><dd>${definition || "<p>—</p>"}</dd>`;
    }),
  );
  return `<section class="rs-appendix rs-glossary"><h2>Glossary</h2><dl>${entries.join("")}</dl></section>`;
}

/** Index of terms — keyword → section numbers it appears in. */
export function renderTermIndexHtml(ruleset: Ruleset, includedIds: Iterable<string>): string {
  const entries = termIndex(ruleset, includedIds);
  if (entries.length === 0) return "";
  const items = entries
    .map((entry) => {
      const refs = entry.refs
        .map((ref) => `<a href="#article-${ref.articleId}">${ref.number || "•"}</a>`)
        .join(", ");
      return `<li><span class="rs-index-term">${escapeHtml(entry.label)}</span> ${refs}</li>`;
    })
    .join("");
  return `<section class="rs-appendix rs-index"><h2>Index of terms</h2><ul>${items}</ul></section>`;
}

/** Rules-agnostic dump of the list-building data. */
export function renderListBuildingHtml(ruleset: Ruleset): string {
  const summary = listBuildingSummary(ruleset);
  if (!summary) return "";

  const table = (caption: string, head: string[], rows: string[][]): string => {
    if (rows.length === 0) return "";
    const thead = head.map((h) => `<th>${escapeHtml(h)}</th>`).join("");
    const body = rows
      .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
      .join("");
    return `<h3>${escapeHtml(caption)}</h3><table><thead><tr>${thead}</tr></thead><tbody>${body}</tbody></table>`;
  };

  const parts = [
    table(
      "Resources",
      ["Name", "Cap"],
      summary.resources.map((r) => [r.name, r.cap]),
    ),
    table(
      "Formats",
      ["Name", "Caps"],
      summary.formats.map((f) => [f.name, f.caps]),
    ),
    table(
      "Categories",
      ["Name", "Kind", "Fields", "Members"],
      summary.categories.map((c) => [c.name, c.kind, String(c.fields), String(c.members)]),
    ),
    table(
      "Node types",
      ["Name", "Category", "Base cost"],
      summary.nodes.map((n) => [n.name, n.category, n.cost]),
    ),
  ].filter(Boolean);

  if (parts.length === 0) return "";
  return `<section class="rs-appendix rs-lb"><h2>List-building data</h2>${parts.join("")}</section>`;
}
