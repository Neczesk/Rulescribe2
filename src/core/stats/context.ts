import type { JSONContent } from "@tiptap/core";
import { buildOutline, type ExportSection } from "../export/outline";
import { collectNodes, richTextToPlainText } from "../schema/references";
import type { Article, Keyword, Ruleset, StructureNode } from "../schema/ruleset";
import { scoreText, type ReadabilityScore } from "./readability";
import { wordCount } from "./text";
import type { IssueTarget } from "./types";

/**
 * One walk of every rich-text doc in the ruleset, cached for the ~50 checks
 * that follow. Each check reads this index instead of re-walking the tree;
 * without it the pass is O(checks × docs).
 */

/**
 * Mirrors `features/editor/extensions/refDisplay.ts`. Duplicated rather than
 * imported: `core/` must not depend on a feature, and these four strings are
 * persisted node attributes, so they are really schema.
 */
export const REF_DISPLAYS = ["link", "name", "shortText", "text"] as const;
export type RefDisplayMode = (typeof REF_DISPLAYS)[number];

/** A reference whose display mode embeds the target's own text at render time. */
export function isLiveText(display: RefDisplayMode): boolean {
  return display === "shortText" || display === "text";
}

export type EntityKind = "article" | "keyword";
export type DocField = "text" | "shortText";

/** Which doc a node was found in. */
export interface DocOwner {
  kind: EntityKind;
  id: string;
  field: DocField;
}

export type RefNodeType = "keywordRef" | "articleRef" | "diagramRef" | "imageBlock";

export interface RefNode {
  owner: DocOwner;
  type: RefNodeType;
  /** `null` when the node carries no id at all (a half-inserted node). */
  targetId: string | null;
  /** Always `"link"` for diagram and image nodes — they have no display modes. */
  display: RefDisplayMode;
}

/** Everything a check needs about one article or keyword, pre-flattened. */
export interface EntityInfo {
  kind: EntityKind;
  id: string;
  /** Title / display name, already defaulted. */
  name: string;
  /** Whether the entity carries a real authored name. */
  named: boolean;
  text: string;
  shortText: string;
  words: number;
  isNotes: boolean;
  notes: string;
  hasHeadings: boolean;
  score: ReadabilityScore;
}

/** Where in the structure tree an article sits. */
export interface TreePlacement {
  articleId: string;
  depth: number;
  childCount: number;
  /** How many tree nodes point at this article — >1 means it is placed twice. */
  occurrences: number;
  path: string[];
}

/** Async inputs the checks need but `core/` must not fetch itself. */
export interface StatsExtras {
  /** Image ids with bytes in IndexedDB. Omit to skip REF-06. */
  imageBlobIds?: Set<string>;
  /** Diagram id -> parse error message. Omit to skip DIA-01. */
  mermaidErrors?: Map<string, string>;
}

export interface StatsContext {
  ruleset: Ruleset;
  extras: StatsExtras;
  outline: ExportSection[];
  articles: EntityInfo[];
  keywords: EntityInfo[];
  /** Articles and keywords together, in that order. */
  entities: EntityInfo[];
  refs: RefNode[];
  /** Article id -> its placement(s) in the structure tree. */
  placements: Map<string, TreePlacement>;
  /** Article ids reachable from the structure root, in walk order. */
  treeArticleIds: string[];
  externalLinks: { owner: DocOwner; href: string }[];
  name(target: IssueTarget): string;
  ownerTarget(owner: DocOwner): IssueTarget;
}

const UNTITLED_ARTICLE = "Untitled article";
const UNTITLED_KEYWORD = "Untitled keyword";

export function buildStatsContext(ruleset: Ruleset, extras: StatsExtras = {}): StatsContext {
  const refs: RefNode[] = [];
  const externalLinks: { owner: DocOwner; href: string }[] = [];

  const articles = Object.values(ruleset.registry.articles).map((article) =>
    entityInfo(article, "article", refs, externalLinks),
  );
  const keywords = Object.values(ruleset.registry.keywords).map((keyword) =>
    entityInfo(keyword, "keyword", refs, externalLinks),
  );

  const { placements, treeArticleIds } = walkStructure(ruleset.structure);

  const byId = new Map<string, EntityInfo>();
  for (const entity of [...articles, ...keywords]) byId.set(`${entity.kind}:${entity.id}`, entity);

  return {
    ruleset,
    extras,
    outline: buildOutline(ruleset),
    articles,
    keywords,
    entities: [...articles, ...keywords],
    refs,
    placements,
    treeArticleIds,
    externalLinks,
    name: (target) =>
      byId.get(`${target.kind}:${target.id}`)?.name ??
      (target.kind === "article" ? UNTITLED_ARTICLE : UNTITLED_KEYWORD),
    ownerTarget: (owner) => ({ kind: owner.kind, id: owner.id }) as IssueTarget,
  };
}

function entityInfo(
  entity: Article | Keyword,
  kind: EntityKind,
  refs: RefNode[],
  externalLinks: { owner: DocOwner; href: string }[],
): EntityInfo {
  const rawName = kind === "article" ? (entity as Article).title : (entity as Keyword).displayName;
  const text = richTextToPlainText(entity.text);

  for (const field of ["text", "shortText"] as const) {
    const owner: DocOwner = { kind, id: entity.id, field };
    collectRefs(entity[field], owner, refs);
    collectExternalLinks(entity[field], owner, externalLinks);
  }

  return {
    kind,
    id: entity.id,
    name: rawName.trim() || (kind === "article" ? UNTITLED_ARTICLE : UNTITLED_KEYWORD),
    named: rawName.trim().length > 0,
    text,
    shortText: richTextToPlainText(entity.shortText),
    words: wordCount(text),
    isNotes: kind === "article" ? (entity as Article).isNotes : false,
    notes: entity.notes.trim(),
    hasHeadings: collectNodes(entity.text, "heading").length > 0,
    score: scoreText(text),
  };
}

const ID_ATTR: Record<RefNodeType, string> = {
  keywordRef: "keywordId",
  articleRef: "articleId",
  diagramRef: "diagramId",
  imageBlock: "imageId",
};

function collectRefs(doc: JSONContent | undefined, owner: DocOwner, out: RefNode[]): void {
  for (const type of Object.keys(ID_ATTR) as RefNodeType[]) {
    for (const node of collectNodes(doc, type)) {
      const raw = node.attrs?.[ID_ATTR[type]];
      const display = node.attrs?.display;
      out.push({
        owner,
        type,
        targetId: typeof raw === "string" && raw ? raw : null,
        display: (REF_DISPLAYS as readonly unknown[]).includes(display)
          ? (display as RefDisplayMode)
          : "link",
      });
    }
  }
}

/** `link` marks on text nodes whose href leaves the document. */
function collectExternalLinks(
  doc: JSONContent | undefined,
  owner: DocOwner,
  out: { owner: DocOwner; href: string }[],
): void {
  for (const node of collectNodes(doc, "text")) {
    for (const mark of node.marks ?? []) {
      const href = mark.type === "link" ? mark.attrs?.href : undefined;
      if (typeof href === "string" && /^https?:\/\//i.test(href)) out.push({ owner, href });
    }
  }
}

function walkStructure(root: StructureNode): {
  placements: Map<string, TreePlacement>;
  treeArticleIds: string[];
} {
  const placements = new Map<string, TreePlacement>();
  const treeArticleIds: string[] = [];

  const walk = (node: StructureNode, depth: number, path: string[]) => {
    treeArticleIds.push(node.articleId);
    const existing = placements.get(node.articleId);
    if (existing) {
      existing.occurrences += 1;
    } else {
      placements.set(node.articleId, {
        articleId: node.articleId,
        depth,
        childCount: node.children.length,
        occurrences: 1,
        path,
      });
    }
    for (const child of node.children) walk(child, depth + 1, [...path, node.articleId]);
  };

  walk(root, 0, []);
  return { placements, treeArticleIds };
}
