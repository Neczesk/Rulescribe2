import { buildOutline } from "../../../core/export/outline";
import type { ExportOptions } from "../../../core/export/options";
import { type ExportTheme, GOOGLE_FONTS_HREF, themeToCss } from "../../../core/export/theme";
import type { Ruleset } from "../../../core/schema/ruleset";
import { escapeHtml } from "./escapeHtml";
import {
  renderCreditsHtml,
  renderGlossaryHtml,
  renderListBuildingHtml,
  renderTermIndexHtml,
  renderTocHtml,
} from "./generatedMatterHtml";
import { renderRichTextHtml } from "./renderRichText";

/**
 * Assemble a complete standalone Rulebook HTML document: cover page, then each
 * selected non-notes section as `<section id="article-ID">` with its computed
 * number. Cross-references (`<a href="#article-ID">`) resolve within the file.
 */
export async function buildRulebookHtml(
  ruleset: Ruleset,
  options: ExportOptions,
  theme: ExportTheme,
): Promise<string> {
  const included = new Set(options.includedIds);
  const outline = buildOutline(ruleset).filter(
    (section) => section.depth > 0 && !section.isNotes && included.has(section.articleId),
  );

  const extras = options.extras;

  const sections = await Promise.all(
    outline.map(async (section, i) => {
      const level = Math.min(Math.max(section.depth, 1), 6);
      const article = ruleset.registry.articles[section.articleId];
      const heading =
        `<h${level} class="rs-section-heading">` +
        (section.number ? `<span class="rs-num">${section.number}</span>` : "") +
        `<span>${escapeHtml(section.title)}</span>` +
        `</h${level}>`;
      const divider =
        section.depth === 1 && i > 0
          ? `<div class="rs-divider"><span class="rs-divider-mark"></span></div>`
          : "";
      const bodyHtml = article
        ? await renderRichTextHtml(article.text, ruleset, {
            keywordMode: theme.keywordMode,
            dropTodos: true,
          })
        : "";
      return divider + `<section id="article-${section.articleId}">${heading}${bodyHtml}</section>`;
    }),
  );
  const body = sections.join("\n");

  const frontMatter =
    (extras.credits ? renderCreditsHtml(ruleset, theme.name) : "") +
    (extras.toc ? renderTocHtml(outline) : "");
  const backMatter =
    (extras.glossary ? await renderGlossaryHtml(ruleset, theme.keywordMode) : "") +
    (extras.index ? renderTermIndexHtml(ruleset, options.includedIds) : "") +
    (extras.listBuilding ? renderListBuildingHtml(ruleset) : "");

  const meta = ruleset.metadata;
  const keywordCount = Object.keys(ruleset.registry.keywords).length;
  const coverMeta = [
    meta.author.trim(),
    meta.updatedAt.format("D MMM YYYY"),
    `schema v${ruleset.schemaVersion}`,
    `${outline.length} sections`,
    `${keywordCount} keyword${keywordCount === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" · ");

  const title = escapeHtml(meta.title.trim() || "Untitled ruleset");
  const subtitle =
    theme.showSubtitle && meta.author.trim()
      ? `<div class="rs-cover-tagline">by ${escapeHtml(meta.author.trim())}</div>`
      : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${GOOGLE_FONTS_HREF}">
<style>${themeToCss(theme)}</style>
</head>
<body>
<div class="rs-doc">
<header class="rs-cover-header rs-cover-${theme.cover}">
<div class="rs-cover">Rulebook</div>
<div class="rs-cover-title">${title}</div>
<div class="rs-cover-rule"></div>
${subtitle}
<div class="rs-cover-meta">${coverMeta}</div>
</header>
${frontMatter}
${body}
${backMatter}
</div>
</body>
</html>`;
}
