import type { JSONContent } from "@tiptap/core";
import type { Ruleset } from "./ruleset";
import { articleAncestorIds } from "./structure";

/** Depth-first collection of every node of `type` within a TipTap doc. */
export function collectNodes(doc: JSONContent | undefined, type: string): JSONContent[] {
  if (!doc) return [];
  const found: JSONContent[] = [];
  const walk = (node: JSONContent) => {
    if (node.type === type) found.push(node);
    node.content?.forEach(walk);
  };
  walk(doc);
  return found;
}

/** Flatten a TipTap doc to its plain text content. */
export function richTextToPlainText(doc: JSONContent | undefined): string {
  if (!doc) return "";
  let out = "";
  const walk = (node: JSONContent) => {
    if (node.type === "text" && node.text) out += node.text;
    node.content?.forEach(walk);
  };
  walk(doc);
  return out.trim();
}

/**
 * Map of keyword id -> ids of articles whose body or short text references it via
 * a `keywordRef` node. Derived on the fly; never stored.
 */
export function keywordReferences(ruleset: Ruleset): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const article of Object.values(ruleset.registry.articles)) {
    const docs = [article.text, article.shortText];
    for (const doc of docs) {
      for (const node of collectNodes(doc, "keywordRef")) {
        const keywordId = node.attrs?.keywordId;
        if (typeof keywordId !== "string") continue;
        (map[keywordId] ??= new Set()).add(article.id);
      }
    }
  }
  return Object.fromEntries(Object.entries(map).map(([id, set]) => [id, [...set]]));
}

export function keywordUseCount(ruleset: Ruleset, keywordId: string): number {
  return keywordReferences(ruleset)[keywordId]?.length ?? 0;
}

/**
 * Map of image id -> ids of articles whose body or short text references it via
 * an `imageBlock` node. Derived on the fly; never stored. Used to decide which
 * images are worth bundling on export.
 */
export function imageReferences(ruleset: Ruleset): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const article of Object.values(ruleset.registry.articles)) {
    const docs = [article.text, article.shortText];
    for (const doc of docs) {
      for (const node of collectNodes(doc, "imageBlock")) {
        const imageId = node.attrs?.imageId;
        if (typeof imageId !== "string") continue;
        (map[imageId] ??= new Set()).add(article.id);
      }
    }
  }
  return Object.fromEntries(Object.entries(map).map(([id, set]) => [id, [...set]]));
}

/**
 * Map of diagram id -> ids of articles whose body or short text references it
 * via a `diagramRef` node. Derived on the fly; never stored.
 */
export function diagramReferences(ruleset: Ruleset): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const article of Object.values(ruleset.registry.articles)) {
    const docs = [article.text, article.shortText];
    for (const doc of docs) {
      for (const node of collectNodes(doc, "diagramRef")) {
        const diagramId = node.attrs?.diagramId;
        if (typeof diagramId !== "string") continue;
        (map[diagramId] ??= new Set()).add(article.id);
      }
    }
  }
  return Object.fromEntries(Object.entries(map).map(([id, set]) => [id, [...set]]));
}

export function diagramUseCount(ruleset: Ruleset, diagramId: string): number {
  return diagramReferences(ruleset)[diagramId]?.length ?? 0;
}

export interface TodoRef {
  /** The `todo` node's stable id (its `todoId` attr). */
  todoId: string;
  articleId: string;
  /** The note text (the node's `text` attr). */
  text: string;
  resolved: boolean;
  /** Article path, e.g. "Core Rules / Combat" — the containing article last. */
  breadcrumb: string;
}

/**
 * Every `todo` node across all articles' body and short text, in document
 * order, each tagged with its article and a breadcrumb. Derived on the fly;
 * never stored. Drives the editor's TODOS sidebar panel.
 */
export function todoReferences(ruleset: Ruleset): TodoRef[] {
  const articles = ruleset.registry.articles;
  const root = ruleset.structure;

  const breadcrumbOf = (articleId: string): string => {
    const chain = root ? [...articleAncestorIds(root, articleId), articleId] : [articleId];
    const trimmed = chain.length > 1 ? chain.slice(1) : chain; // drop the tree root
    return trimmed.map((id) => articles[id]?.title || "Untitled").join(" / ");
  };

  const out: TodoRef[] = [];
  for (const article of Object.values(articles)) {
    for (const doc of [article.text, article.shortText]) {
      for (const node of collectNodes(doc, "todo")) {
        const todoId = node.attrs?.todoId;
        if (typeof todoId !== "string") continue;
        out.push({
          todoId,
          articleId: article.id,
          text: typeof node.attrs?.text === "string" ? node.attrs.text : "",
          resolved: node.attrs?.resolved === true,
          breadcrumb: breadcrumbOf(article.id),
        });
      }
    }
  }
  return out;
}
