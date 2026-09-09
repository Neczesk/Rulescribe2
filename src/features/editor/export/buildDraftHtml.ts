import type { JSONContent } from "@tiptap/core";
import dayjs from "dayjs";
import { draftCss } from "../../../core/export/draftCss";
import { draftKeywordNotes, unresolvedArticleRefCount } from "../../../core/export/draftAnalysis";
import { blockLabels } from "../../../core/export/numbering";
import { buildOutline } from "../../../core/export/outline";
import type { ExportOptions } from "../../../core/export/options";
import type { Ruleset } from "../../../core/schema/ruleset";
import { escapeHtml } from "./escapeHtml";
import { renderRichTextHtml } from "./renderRichText";

/**
 * Assemble the Draft export: one fixed neutral layout, notes in, theme out, so
 * playtest feedback stays comparable between rounds. `isNotes` articles are
 * included and flagged; `article.notes` prints as an author-note block; every
 * top-level block gets a `¶` marker for citation; dangling refs are flagged.
 */
export async function buildDraftHtml(ruleset: Ruleset, options: ExportOptions): Promise<string> {
  const included = new Set(options.includedIds);
  const outline = buildOutline(ruleset).filter(
    (section) => section.depth > 0 && included.has(section.articleId),
  );

  const sections = await Promise.all(
    outline.map(async (section) => {
      const article = ruleset.registry.articles[section.articleId];
      if (!article) return "";
      const level = Math.min(Math.max(section.depth, 1), 6);

      let bodyHtml = await renderRichTextHtml(article.text, ruleset);
      if (options.draft.paragraphNumbers) {
        bodyHtml = applyParagraphGutter(bodyHtml, blockLabels(article.text));
      }

      const flag = section.isNotes
        ? `<span class="rs-flag">notes-only — not in the rulebook</span>`
        : "";
      const note = article.notes.trim()
        ? `<div class="rs-note"><div class="rs-note-label">Author note · article · never in the rulebook</div><p>${escapeHtml(article.notes.trim())}</p></div>`
        : "";

      return (
        `<section id="article-${section.articleId}">` +
        `<div class="rs-draft-head">` +
        (section.number ? `<span class="rs-sec">§${section.number}</span>` : "") +
        `<h${level}>${escapeHtml(section.title)}</h${level}>${flag}</div>` +
        bodyHtml +
        note +
        keywordNotesBlock(article.text, ruleset) +
        `</section>`
      );
    }),
  );

  const meta = ruleset.metadata;
  const articleCount = Object.keys(ruleset.registry.articles).length;
  const keywordCount = Object.keys(ruleset.registry.keywords).length;
  const now = dayjs().format("YYYY-MM-DD HH:mm");
  const title = escapeHtml(meta.title.trim() || "Untitled ruleset");
  const metaLine = escapeHtml(
    `author: ${meta.author.trim() || "—"} · updated: ${meta.updatedAt.format("YYYY-MM-DD HH:mm")}\n` +
      `schema: v${ruleset.schemaVersion} · ${articleCount} articles · ${keywordCount} keywords`,
  );

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} — draft</title>
<style>${draftCss(options.draft)}</style>
</head>
<body>
<div class="rs-draft">
<header class="rs-draft-cover">
<div>
<div class="rs-draft-title">${title}</div>
<div class="rs-draft-meta">${metaLine}</div>
</div>
<div class="rs-stamp"><div class="rs-stamp-word">Draft</div><span class="rs-stamp-sub">playtest copy</span></div>
</header>
${sections.join("\n")}
<footer class="rs-draft-foot"><span>${title} · draft · exported ${now}</span><span>cite as §section ¶paragraph</span></footer>
</div>
</body>
</html>`;
}

/** Wrap each top-level rendered block in a `¶`-numbered citation gutter row. */
function applyParagraphGutter(html: string, labels: string[]): string {
  const doc = new DOMParser().parseFromString(`<body>${html}</body>`, "text/html");
  const blocks = [...doc.body.children];
  const wrapper = doc.createElement("div");
  blocks.forEach((block, i) => {
    const row = doc.createElement("div");
    row.className = "rs-para";
    const gutter = doc.createElement("span");
    gutter.className = "rs-para-num";
    gutter.textContent = labels[i] ?? "";
    const body = doc.createElement("div");
    body.className = "rs-para-body";
    body.appendChild(block);
    row.append(gutter, body);
    wrapper.appendChild(row);
  });
  return wrapper.innerHTML;
}

function keywordNotesBlock(doc: JSONContent, ruleset: Ruleset): string {
  const notes = draftKeywordNotes(doc, ruleset);
  const unresolvedArticles = unresolvedArticleRefCount(doc, ruleset);
  if (notes.length === 0 && unresolvedArticles === 0) return "";

  const rows = notes
    .map(
      (note) =>
        `<div class="rs-kwnote${note.unresolved ? " rs-unresolved" : ""}">` +
        `<span class="rs-kwnote-term">${escapeHtml(note.label)}</span>` +
        `<span>${escapeHtml(note.notes)}</span></div>`,
    )
    .join("");
  const articleRow =
    unresolvedArticles > 0
      ? `<div class="rs-kwnote rs-unresolved"><span class="rs-kwnote-term">refs</span>` +
        `<span>${unresolvedArticles} cross-reference${unresolvedArticles === 1 ? "" : "s"} point at a deleted article.</span></div>`
      : "";

  return `<div class="rs-kwnotes"><div class="rs-kwnotes-label">Notes &amp; loose ends touched by this article</div>${rows}${articleRow}</div>`;
}
