import { mergeAttributes } from "@tiptap/core";
import { Mention } from "@tiptap/extension-mention";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { richTextToPlainText } from "../../../../core/schema/references";
import { currentRulesetStore } from "../../../../core/state/currentRuleset";
import {
  MISSING_KEYWORD_LABEL,
  normalizeDisplay,
  type RefDisplay,
  resolveKeywordRefText,
} from "../refDisplay";
import { KeywordRefView } from "./KeywordRefView";
import { keywordSuggestion } from "./keywordSuggestion";

export { MISSING_KEYWORD_LABEL } from "../refDisplay";

export interface KeywordRefAttributes {
  keywordId: string | null;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    keywordRef: {
      insertKeywordRef: (attributes: KeywordRefAttributes) => ReturnType;
    };
  }
}

export function resolveKeywordLabel(keywordId: string | null): string {
  if (!keywordId) return MISSING_KEYWORD_LABEL;
  const keyword = currentRulesetStore.getState().ruleset?.registry.keywords[keywordId];
  return keyword?.displayName?.trim() || MISSING_KEYWORD_LABEL;
}

export function resolveKeywordShort(keywordId: string | null): string {
  if (!keywordId) return "";
  const keyword = currentRulesetStore.getState().ruleset?.registry.keywords[keywordId];
  return richTextToPlainText(keyword?.shortText);
}

export function resolveKeywordText(keywordId: string | null): string {
  if (!keywordId) return "";
  const keyword = currentRulesetStore.getState().ruleset?.registry.keywords[keywordId];
  return richTextToPlainText(keyword?.text);
}

export const KeywordRef = Mention.extend({
  name: "keywordRef",

  addAttributes() {
    return {
      keywordId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-keyword-id") || null,
        renderHTML: (attributes) =>
          attributes.keywordId ? { "data-keyword-id": attributes.keywordId } : {},
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

  renderText({ node }) {
    return resolveKeywordRefText(
      currentRulesetStore.getState().ruleset,
      node.attrs.keywordId as string | null,
      normalizeDisplay(node.attrs.display),
    );
  },

  parseHTML() {
    return [{ tag: "span[data-keyword-id]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const id = node.attrs.keywordId as string | null;
    const display = normalizeDisplay(node.attrs.display);
    const value = resolveKeywordRefText(currentRulesetStore.getState().ruleset, id, display);

    if (display === "link") {
      const short = resolveKeywordShort(id);
      return [
        "span",
        mergeAttributes(HTMLAttributes, {
          class: "keyword-ref",
          ...(short ? { title: short } : {}),
        }),
        value,
      ];
    }

    return [
      "span",
      mergeAttributes(HTMLAttributes, { class: "keyword-ref keyword-ref--live" }),
      value,
    ];
  },

  addCommands() {
    return {
      insertKeywordRef:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(KeywordRefView);
  },
}).configure({ suggestion: keywordSuggestion });
