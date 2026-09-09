import type { JSONContent } from "@tiptap/core";
import type { StructureNode } from "../schema/ruleset";

/**
 * Section numbers for an exported ruleset, derived purely from position in the
 * `structure` tree. The root node (the ruleset itself) has no number; its
 * children are `"1"`, `"2"`, …; their children `"1.1"`, `"2.1"`, … to any depth.
 *
 * `isExcluded` lets an article opt out of numbering *without leaving a gap*: an
 * excluded node (a notes article) gets `""` and does not advance its siblings'
 * counter, so the first real section is still `"1"` even when a notes article
 * sits before it. Its descendants keep counting under the parent's prefix.
 *
 * Nothing in the schema stores these — the editor's structure tree is
 * unnumbered — so an exporter computes them here and every consumer (headings,
 * table of contents, cross-reference labels, the include list) reads the same
 * map.
 */
export function buildNumbering(
  root: StructureNode,
  isExcluded: (articleId: string) => boolean = () => false,
): Map<string, string> {
  const numbers = new Map<string, string>();
  numbers.set(root.articleId, "");

  const walk = (node: StructureNode, prefix: string) => {
    let counter = 0;
    for (const child of node.children) {
      if (isExcluded(child.articleId)) {
        numbers.set(child.articleId, "");
        walk(child, prefix);
        continue;
      }
      counter += 1;
      const number = prefix ? `${prefix}.${counter}` : `${counter}`;
      numbers.set(child.articleId, number);
      walk(child, number);
    }
  };

  walk(root, "");
  return numbers;
}

/**
 * Paragraph markers for the draft's citation gutter — one per top-level block
 * of an article body, so feedback can cite "§2.1 ¶4". The draft builder zips
 * these against the rendered block elements.
 */
export function blockLabels(doc: JSONContent | undefined): string[] {
  const count = doc?.content?.length ?? 0;
  return Array.from({ length: count }, (_, i) => `¶${i + 1}`);
}
