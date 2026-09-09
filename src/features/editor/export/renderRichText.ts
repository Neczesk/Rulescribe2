import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import { richTextToPlainText } from "../../../core/schema/references";
import type { Ruleset } from "../../../core/schema/ruleset";
import type { KeywordMode } from "../../../core/export/theme";
import { loadImageBlob } from "../../../core/storage/imageStorage";
import { renderExcalidrawSvg } from "../extensions/diagram-ref/renderExcalidrawSvg";
import { renderMermaidSvg } from "../extensions/diagram-ref/renderMermaidSvg";
import { EXPORT_EXTENSIONS } from "./exportExtensions";

/** Excalidraw diagram base width (matches `DiagramRefView`'s `BASE_PX`). */
const DIAGRAM_BASE_PX = 480;

/** Monotonic id so repeated `mermaid.render` calls never collide on a DOM id. */
let mermaidSeq = 0;

/**
 * Render one article/keyword rich-text document to a self-contained HTML
 * fragment string.
 *
 * `generateHTML` runs the custom nodes' static `renderHTML`, which resolves
 * keyword/article refs against the ruleset in `currentRulesetStore` and emits
 * the `.keyword-ref` / `.article-ref` / `.callout` / `table.table` classes the
 * export stylesheet targets. This function then resolves the two things those
 * static renders leave unfinished:
 *
 * - `<img data-image-id>` gets its bytes inlined as a data URI from the blob
 *   store (a missing blob falls back to a labelled placeholder).
 * - `<figure data-diagram-id>` is replaced with the diagram rendered to inline
 *   SVG from `registry.diagrams` (Excalidraw scene or Mermaid source).
 * - `keywordMode: "inline"` appends each keyword's short definition in
 *   parentheses (the other modes are pure CSS, handled by `themeToCss`).
 * - `dropTodos` strips every `todo` node — TODOs are authoring scaffolding, so
 *   they belong in the draft/playtest output but never in a published rulebook.
 */
export async function renderRichTextHtml(
  doc: JSONContent | undefined,
  ruleset: Ruleset,
  opts: { keywordMode?: KeywordMode; dropTodos?: boolean } = {},
): Promise<string> {
  if (!doc) return "";
  const parsed = new DOMParser().parseFromString(
    `<body>${generateHTML(doc, EXPORT_EXTENSIONS)}</body>`,
    "text/html",
  );

  if (opts.dropTodos) {
    for (const todo of parsed.querySelectorAll("div.todo")) todo.remove();
  }

  if (opts.keywordMode === "inline") inlineKeywordDefinitions(parsed, ruleset);

  await Promise.all([
    ...[...parsed.querySelectorAll("img[data-image-id]")].map((img) => inlineImage(img, parsed)),
    ...[...parsed.querySelectorAll("figure[data-diagram-id]")].map((figure) =>
      inlineDiagram(figure, parsed, ruleset),
    ),
  ]);

  return parsed.body.innerHTML;
}

function inlineKeywordDefinitions(doc: Document, ruleset: Ruleset): void {
  for (const span of doc.querySelectorAll("span.keyword-ref[data-keyword-id]")) {
    span.removeAttribute("title");
    const keyword = ruleset.registry.keywords[span.getAttribute("data-keyword-id") ?? ""];
    const short = keyword ? richTextToPlainText(keyword.shortText) : "";
    if (!short) continue;
    const gloss = doc.createElement("span");
    gloss.className = "keyword-ref-gloss";
    gloss.textContent = ` (${short})`;
    span.after(gloss);
  }
}

async function inlineImage(img: Element, doc: Document): Promise<void> {
  const id = img.getAttribute("data-image-id");
  const blob = id ? await loadImageBlob(id) : null;
  if (!blob) {
    img.replaceWith(placeholder(doc, `Image — ${img.getAttribute("alt") || "unavailable"}`));
    return;
  }
  img.setAttribute("src", await blobToDataUrl(blob));
}

async function inlineDiagram(figure: Element, doc: Document, ruleset: Ruleset): Promise<void> {
  const id = figure.getAttribute("data-diagram-id");
  const entry = id ? ruleset.registry.diagrams[id] : undefined;
  const caption = figure.querySelector("figcaption")?.textContent?.trim() ?? "";
  const scale = Number(figure.getAttribute("data-display-scale")) || 1;
  const wrap = figure.getAttribute("data-wrap") ?? "none";

  let svg: string | null = null;
  if (entry) {
    try {
      svg =
        entry.kind === "excalidraw"
          ? new XMLSerializer().serializeToString(await renderExcalidrawSvg(entry.scene))
          : await renderMermaidSvg(entry.source, `rs-export-diagram-${++mermaidSeq}`);
    } catch {
      svg = null;
    }
  }

  const replacement = doc.createElement("figure");
  replacement.className = `diagram-ref diagram-ref--${wrap}`;
  replacement.style.maxWidth = `${Math.round(DIAGRAM_BASE_PX * scale)}px`;
  if (svg) {
    replacement.innerHTML = svg;
  } else {
    replacement.appendChild(
      placeholder(doc, entry ? "Diagram failed to render" : "Diagram unavailable"),
    );
  }
  if (caption) {
    const figcaption = doc.createElement("figcaption");
    figcaption.textContent = caption;
    replacement.appendChild(figcaption);
  }
  figure.replaceWith(replacement);
}

function placeholder(doc: Document, text: string): HTMLElement {
  const el = doc.createElement("div");
  el.className = "rs-placeholder";
  el.textContent = text;
  return el;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error ?? new Error("Could not read image blob"));
    reader.readAsDataURL(blob);
  });
}
