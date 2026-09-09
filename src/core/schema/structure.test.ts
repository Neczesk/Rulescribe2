import { describe, expect, it } from "vitest";
import type { StructureNode } from "./ruleset";
import {
  articleAncestorIds,
  collectArticleIds,
  createArticleNode,
  findNodeContext,
  findStructureNode,
  insertNode,
  isDescendant,
  moveNode,
  removeNode,
} from "./structure";

const n = (articleId: string, children: StructureNode[] = []): StructureNode => ({
  articleId,
  children,
});

/**
 *  root
 *  ├─ a
 *  │  ├─ a1
 *  │  └─ a2
 *  └─ b
 */
const tree = (): StructureNode => n("root", [n("a", [n("a1"), n("a2")]), n("b")]);

describe("findStructureNode", () => {
  it("finds nested nodes and returns null for unknown ids", () => {
    expect(findStructureNode(tree(), "a1")?.articleId).toBe("a1");
    expect(findStructureNode(tree(), "root")?.articleId).toBe("root");
    expect(findStructureNode(tree(), "nope")).toBeNull();
  });
});

describe("findNodeContext", () => {
  it("reports parent and index", () => {
    const ctx = findNodeContext(tree(), "a2");
    expect(ctx?.parent?.articleId).toBe("a");
    expect(ctx?.index).toBe(1);
  });

  it("reports a null parent for the root", () => {
    expect(findNodeContext(tree(), "root")?.parent).toBeNull();
  });
});

describe("collectArticleIds", () => {
  it("returns the node plus every descendant", () => {
    expect(collectArticleIds(findStructureNode(tree(), "a")!)).toEqual(["a", "a1", "a2"]);
  });
});

describe("isDescendant", () => {
  it("is true for the node itself and nested nodes, false otherwise", () => {
    const t = tree();
    expect(isDescendant(t, "a", "a1")).toBe(true);
    expect(isDescendant(t, "a", "a")).toBe(true);
    expect(isDescendant(t, "a", "b")).toBe(false);
  });
});

describe("insertNode", () => {
  it("appends when no index is given", () => {
    const next = insertNode(tree(), n("c"), { parentId: "root" });
    expect(next.children.map((c) => c.articleId)).toEqual(["a", "b", "c"]);
  });

  it("inserts at the requested index", () => {
    const next = insertNode(tree(), n("a0"), { parentId: "a", index: 0 });
    expect(findStructureNode(next, "a")!.children.map((c) => c.articleId)).toEqual([
      "a0",
      "a1",
      "a2",
    ]);
  });

  it("does not mutate the input tree", () => {
    const t = tree();
    insertNode(t, n("c"), { parentId: "root" });
    expect(t.children).toHaveLength(2);
  });
});

describe("removeNode", () => {
  it("removes a branch and reports the whole subtree", () => {
    const { root, removedIds } = removeNode(tree(), "a");
    expect(root.children.map((c) => c.articleId)).toEqual(["b"]);
    expect(removedIds).toEqual(["a", "a1", "a2"]);
  });

  it("is a no-op for the root", () => {
    const { root, removedIds } = removeNode(tree(), "root");
    expect(removedIds).toEqual([]);
    expect(collectArticleIds(root)).toHaveLength(5);
  });
});

describe("moveNode", () => {
  it("re-parents a node at the requested index", () => {
    const next = moveNode(tree(), "b", { parentId: "a", index: 1 });
    expect(findStructureNode(next, "a")!.children.map((c) => c.articleId)).toEqual([
      "a1",
      "b",
      "a2",
    ]);
    expect(next.children.map((c) => c.articleId)).toEqual(["a"]);
  });

  it("reorders within the same parent, accounting for the vacated slot", () => {
    const next = moveNode(tree(), "a1", { parentId: "a", index: 2 });
    expect(findStructureNode(next, "a")!.children.map((c) => c.articleId)).toEqual(["a2", "a1"]);
  });

  it("refuses to move the root", () => {
    expect(moveNode(tree(), "root", { parentId: "a", index: 0 })).toEqual(tree());
  });

  it("refuses to drop a node into its own descendant", () => {
    expect(moveNode(tree(), "a", { parentId: "a1", index: 0 })).toEqual(tree());
  });
});

describe("createArticleNode", () => {
  it("creates a matching article + childless node", () => {
    const { article, node } = createArticleNode("Movement");
    expect(article.title).toBe("Movement");
    expect(node.articleId).toBe(article.id);
    expect(node.children).toEqual([]);
  });
});

describe("articleAncestorIds", () => {
  it("returns the root-first ancestor chain, excluding the article itself", () => {
    expect(articleAncestorIds(tree(), "a1")).toEqual(["root", "a"]);
    expect(articleAncestorIds(tree(), "b")).toEqual(["root"]);
  });

  it("is empty for the root and for unknown ids", () => {
    expect(articleAncestorIds(tree(), "root")).toEqual([]);
    expect(articleAncestorIds(tree(), "nope")).toEqual([]);
  });
});
