import { article, type Article, type StructureNode } from "./ruleset";

/**
 * Helpers for the ruleset's article hierarchy.
 *
 * An `Article`'s content lives in the flat `ruleset.registry.articles` record
 * and is always fetched by id (`registry.articles[id]`, O(1)) — never by
 * walking the tree. `structure` is a parallel tree of `StructureNode`s that
 * carry only `articleId` + `children`; it answers *hierarchy* questions
 * (a node's parent, its child nodes, where to insert/move). Every function
 * here is pure and immutable — it returns new nodes and never mutates input.
 */

/** Find a node's position within the tree by `articleId` (not the article). */
export function findStructureNode(root: StructureNode, articleId: string): StructureNode | null {
  if (root.articleId === articleId) return root;
  for (const child of root.children) {
    const found = findStructureNode(child, articleId);
    if (found) return found;
  }
  return null;
}

export interface NodeContext {
  node: StructureNode;
  parent: StructureNode | null;
  index: number;
}

/** Find a node together with its parent and index in the parent's children. */
export function findNodeContext(
  root: StructureNode,
  articleId: string,
  parent: StructureNode | null = null,
  index = -1,
): NodeContext | null {
  if (root.articleId === articleId) return { node: root, parent, index };
  for (let i = 0; i < root.children.length; i++) {
    const found = findNodeContext(root.children[i], articleId, root, i);
    if (found) return found;
  }
  return null;
}

/** The node's own `articleId` plus every descendant `articleId`, depth-first. */
export function collectArticleIds(node: StructureNode): string[] {
  return [node.articleId, ...node.children.flatMap(collectArticleIds)];
}

/** True if `maybeDescendantId` is `ancestorId` itself or nested beneath it. */
export function isDescendant(
  root: StructureNode,
  ancestorId: string,
  maybeDescendantId: string,
): boolean {
  const ancestor = findStructureNode(root, ancestorId);
  if (!ancestor) return false;
  return collectArticleIds(ancestor).includes(maybeDescendantId);
}

interface InsertTarget {
  parentId: string;
  /** Omitted ⇒ append to the end of the parent's children. */
  index?: number;
}

/** Return a new tree with `node` inserted under `target.parentId`. */
export function insertNode(
  root: StructureNode,
  node: StructureNode,
  target: InsertTarget,
): StructureNode {
  if (root.articleId === target.parentId) {
    const children = [...root.children];
    const at = target.index ?? children.length;
    children.splice(Math.max(0, Math.min(at, children.length)), 0, node);
    return { ...root, children };
  }
  return {
    ...root,
    children: root.children.map((child) => insertNode(child, node, target)),
  };
}

/**
 * Return a new tree with the `articleId` node (and its subtree) removed, plus
 * the list of every `articleId` that was removed. Removing the root is a no-op.
 */
export function removeNode(
  root: StructureNode,
  articleId: string,
): { root: StructureNode; removedIds: string[] } {
  if (root.articleId === articleId) {
    return { root, removedIds: [] };
  }
  let removedIds: string[] = [];
  const children: StructureNode[] = [];
  for (const child of root.children) {
    if (child.articleId === articleId) {
      removedIds = collectArticleIds(child);
      continue;
    }
    const result = removeNode(child, articleId);
    if (result.removedIds.length > 0) removedIds = result.removedIds;
    children.push(result.root);
  }
  return { root: { ...root, children }, removedIds };
}

/**
 * Return a new tree with `articleId` moved under `target.parentId` at
 * `target.index`. Returns the tree unchanged when the move is illegal: moving
 * the root, or dropping a node onto itself or one of its own descendants.
 */
export function moveNode(
  root: StructureNode,
  articleId: string,
  target: { parentId: string; index: number },
): StructureNode {
  if (articleId === root.articleId) return root;
  if (isDescendant(root, articleId, target.parentId)) return root;

  const context = findNodeContext(root, articleId);
  if (!context || !context.parent) return root;

  const detached = removeNode(root, articleId).root;

  // Adjust the target index when moving down within the same parent, since the
  // node was removed from an earlier slot in that same child list.
  let index = target.index;
  if (context.parent.articleId === target.parentId && context.index < target.index) {
    index -= 1;
  }
  return insertNode(detached, context.node, { parentId: target.parentId, index });
}

/** Create a fresh article + its (childless) structure node. */
export function createArticleNode(title = ""): {
  article: Article;
  node: StructureNode;
} {
  const created = article.parse({ title });
  return { article: created, node: { articleId: created.id, children: [] } };
}
