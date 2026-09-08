import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { richTextToPlainText } from "../../../../core/schema/references";
import { currentRulesetStore } from "../../../../core/state/currentRuleset";
import { normalizeDisplay, type RefDisplay, resolveArticleRefText } from "../refDisplay";
import { ArticleRefView } from "./ArticleRefView";

export { MISSING_ARTICLE_LABEL } from "../refDisplay";

export interface ArticleRefAttributes {
  articleId: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    articleRef: {
      insertArticleRef: (attributes: ArticleRefAttributes) => ReturnType;
    };
  }
}

export function resolveArticleTitle(articleId: string | null): string {
  return resolveArticleRefText(currentRulesetStore.getState().ruleset, articleId, "link");
}

export function resolveArticleShort(articleId: string | null): string {
  if (!articleId) return "";
  const article = currentRulesetStore.getState().ruleset?.registry.articles[articleId];
  return richTextToPlainText(article?.shortText);
}

export function resolveArticleText(articleId: string | null): string {
  if (!articleId) return "";
  const article = currentRulesetStore.getState().ruleset?.registry.articles[articleId];
  return richTextToPlainText(article?.text);
}

export const ArticleRef = Node.create({
  name: "articleRef",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      articleId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-article-id") || null,
        renderHTML: (attributes) =>
          attributes.articleId ? { "data-article-id": attributes.articleId } : {},
      },
      display: {
        default: "link" as RefDisplay,
        parseHTML: (element) => normalizeDisplay(element.getAttribute("data-display")),
        renderHTML: (attributes) =>
          attributes.display && attributes.display !== "link"
            ? { "data-display": attributes.display }
            : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: "a[data-article-id]" }, { tag: "span[data-article-id]" }];
  },

  renderText({ node }) {
    return resolveArticleRefText(
      currentRulesetStore.getState().ruleset,
      node.attrs.articleId as string | null,
      normalizeDisplay(node.attrs.display),
    );
  },

  renderHTML({ node, HTMLAttributes }) {
    const id = node.attrs.articleId as string | null;
    const display = normalizeDisplay(node.attrs.display);
    const value = resolveArticleRefText(currentRulesetStore.getState().ruleset, id, display);

    if (display === "link") {
      return [
        "a",
        mergeAttributes(HTMLAttributes, {
          href: id ? `#article-${id}` : "#",
          class: "article-ref",
        }),
        value,
      ];
    }

    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "article-ref article-ref--live" }),
      value,
    ];
  },

  addCommands() {
    return {
      insertArticleRef:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ArticleRefView);
  },
});
