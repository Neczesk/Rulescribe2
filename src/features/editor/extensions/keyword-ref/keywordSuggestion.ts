import type { Editor, Range } from "@tiptap/core";
import { ReactRenderer } from "@tiptap/react";
import type { SuggestionOptions } from "@tiptap/suggestion";
import { currentRulesetStore } from "../../../../core/state/currentRuleset";
import { KeywordSuggestionList, type KeywordSuggestionListHandle } from "./KeywordSuggestionList";

export type KeywordSuggestionItem =
  | { kind: "keyword"; keywordId: string; label: string }
  | { kind: "create"; query: string };

const MAX_ITEMS = 8;

function getItems(query: string): KeywordSuggestionItem[] {
  const keywords = currentRulesetStore.getState().ruleset?.registry.keywords ?? {};
  const needle = query.trim().toLowerCase();
  const matches = Object.values(keywords)
    .filter((keyword) => (needle ? keyword.displayName.toLowerCase().includes(needle) : true))
    .sort((a, b) => a.displayName.localeCompare(b.displayName))
    .slice(0, MAX_ITEMS)
    .map<KeywordSuggestionItem>((keyword) => ({
      kind: "keyword",
      keywordId: keyword.id,
      label: keyword.displayName || "Untitled keyword",
    }));

  const exact = Object.values(keywords).some(
    (keyword) => keyword.displayName.toLowerCase() === needle,
  );
  if (needle && !exact) matches.push({ kind: "create", query: query.trim() });
  return matches;
}

function selectItem(editor: Editor, range: Range, item: KeywordSuggestionItem) {
  const keywordId =
    item.kind === "create"
      ? currentRulesetStore.getState().addKeyword({ displayName: item.query })
      : item.keywordId;
  if (!keywordId) return;
  editor.chain().focus().deleteRange(range).insertKeywordRef({ keywordId }).run();
}

export const keywordSuggestion: Omit<SuggestionOptions<KeywordSuggestionItem>, "editor"> = {
  char: "@",
  items: ({ query }) => getItems(query),
  command: ({ editor, range, props }) => selectItem(editor, range, props),
  render: () => {
    let renderer: ReactRenderer<KeywordSuggestionListHandle> | null = null;
    let container: HTMLDivElement | null = null;

    const place = (clientRect: (() => DOMRect | null) | null | undefined) => {
      if (!container || !clientRect) return;
      const rect = clientRect();
      if (!rect) return;
      container.style.left = `${rect.left}px`;
      container.style.top = `${rect.bottom + 6}px`;
    };

    return {
      onStart: (props) => {
        renderer = new ReactRenderer(KeywordSuggestionList, {
          props,
          editor: props.editor,
        });
        container = document.createElement("div");
        container.style.position = "fixed";
        container.style.zIndex = "50";
        container.appendChild(renderer.element);
        document.body.appendChild(container);
        place(props.clientRect);
      },
      onUpdate: (props) => {
        renderer?.updateProps(props);
        place(props.clientRect);
      },
      onKeyDown: (props) => {
        if (props.event.key === "Escape") return false;
        return renderer?.ref?.onKeyDown(props.event) ?? false;
      },
      onExit: () => {
        renderer?.destroy();
        container?.remove();
        renderer = null;
        container = null;
      },
    };
  },
};
