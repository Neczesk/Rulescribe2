import type { JSONContent } from "@tiptap/core";
import { article, keyword, metadata, ruleset, type Ruleset } from "../schema/ruleset";
import type { RefDisplayMode } from "./context";

/**
 * Fixture builders for the consistency-check tests. Ids are padded to the
 * schema's 10-character shape so `ruleset.parse` accepts them and a test can
 * still name things readably (`id("cover")`).
 */

export function id(name: string): string {
  return (name + "_".repeat(10)).slice(0, 10);
}

export function doc(...content: JSONContent[]): JSONContent {
  return { type: "doc", content };
}

export function para(...content: (string | JSONContent)[]): JSONContent {
  return {
    type: "paragraph",
    content: content.map((item) =>
      typeof item === "string" ? { type: "text", text: item } : item,
    ),
  };
}

export function heading(text: string): JSONContent {
  return { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text }] };
}

export function link(text: string, href: string): JSONContent {
  return { type: "text", text, marks: [{ type: "link", attrs: { href } }] };
}

export function kwRef(keywordId: string, display: RefDisplayMode = "link"): JSONContent {
  return { type: "keywordRef", attrs: { keywordId, display } };
}

export function artRef(articleId: string, display: RefDisplayMode = "link"): JSONContent {
  return { type: "articleRef", attrs: { articleId, display } };
}

export function diagramRef(diagramId: string | null): JSONContent {
  return { type: "diagramRef", attrs: { diagramId, displayScale: 1, caption: "" } };
}

export function imageBlock(imageId: string | null): JSONContent {
  return { type: "imageBlock", attrs: { imageId, width: null, wrap: "none" } };
}

export interface ArticleSpec {
  id: string;
  title?: string;
  text?: JSONContent;
  shortText?: JSONContent;
  notes?: string;
  isNotes?: boolean;
}

export interface KeywordSpec {
  id: string;
  displayName?: string;
  text?: JSONContent;
  shortText?: JSONContent;
  notes?: string;
}

/** A structure node as `{ articleId: [children] }` shorthand. */
export interface TreeSpec {
  articleId: string;
  children?: TreeSpec[];
}

export interface RulesetSpec {
  title?: string;
  author?: string;
  articles?: ArticleSpec[];
  keywords?: KeywordSpec[];
  structure?: TreeSpec;
  images?: { id: string; filename?: string; mimeType?: string; width?: number; height?: number }[];
  diagrams?: (
    | { id: string; kind: "mermaid"; name?: string; source?: string }
    | { id: string; kind: "excalidraw"; name?: string; elements?: unknown[] }
  )[];
}

const ROOT = id("root");

/**
 * A ruleset with exactly what the spec names. The root article is supplied
 * automatically unless the spec declares one with the same id.
 */
export function makeRuleset(spec: RulesetSpec = {}): Ruleset {
  const specs: ArticleSpec[] = spec.articles ?? [];
  const hasRoot = specs.some((entry) => entry.id === ROOT);
  const allArticles = hasRoot ? specs : [{ id: ROOT, title: "Root" }, ...specs];

  const articles = Object.fromEntries(
    allArticles.map((entry) => [
      entry.id,
      article.parse({
        id: entry.id,
        title: entry.title ?? "",
        text: entry.text ?? emptyDoc(),
        shortText: entry.shortText ?? emptyDoc(),
        notes: entry.notes ?? "",
        isNotes: entry.isNotes ?? false,
      }),
    ]),
  );

  const keywords = Object.fromEntries(
    (spec.keywords ?? []).map((entry) => [
      entry.id,
      keyword.parse({
        id: entry.id,
        displayName: entry.displayName ?? "",
        text: entry.text ?? emptyDoc(),
        shortText: entry.shortText ?? emptyDoc(),
        notes: entry.notes ?? "",
      }),
    ]),
  );

  const images = Object.fromEntries(
    (spec.images ?? []).map((entry) => [
      entry.id,
      {
        id: entry.id,
        filename: entry.filename ?? "image.png",
        mimeType: entry.mimeType ?? "image/png",
        width: entry.width ?? 800,
        height: entry.height ?? 600,
      },
    ]),
  );

  const diagrams = Object.fromEntries(
    (spec.diagrams ?? []).map((entry) => [
      entry.id,
      entry.kind === "mermaid"
        ? {
            id: entry.id,
            kind: "mermaid" as const,
            name: entry.name ?? "Diagram",
            notes: "",
            source: entry.source ?? "graph TD;\nX-->Y;",
          }
        : {
            id: entry.id,
            kind: "excalidraw" as const,
            name: entry.name ?? "Diagram",
            notes: "",
            scene: { elements: entry.elements ?? [{ type: "rectangle" }], appState: {} },
          },
    ]),
  );

  // Default tree: every declared article as a child of the root, in order.
  const structure =
    spec.structure ??
    ({
      articleId: ROOT,
      children: allArticles
        .filter((entry) => entry.id !== ROOT)
        .map((entry) => ({ articleId: entry.id, children: [] })),
    } as TreeSpec);

  return ruleset.parse({
    schemaVersion: 13,
    metadata: metadata.parse({
      id: id("meta"),
      title: spec.title ?? "Core Rules",
      author: spec.author ?? "An author",
    }),
    registry: { articles, keywords, images, diagrams, nodeDefs: {}, categoryRecords: {} },
    structure: expandTree(structure),
  });
}

function expandTree(node: TreeSpec): { articleId: string; children: unknown[] } {
  return { articleId: node.articleId, children: (node.children ?? []).map(expandTree) };
}

function emptyDoc(): JSONContent {
  return { type: "doc", content: [] };
}

export const ROOT_ID = ROOT;
