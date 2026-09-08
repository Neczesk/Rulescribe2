import { createStore } from "zustand/vanilla";
import { useStore } from "zustand/react";

interface EditorUiState {
  /** Article ids whose branch is collapsed in the navigation tree. */
  collapsedIds: Set<string>;
  toggleCollapsed: (articleId: string) => void;
}

const editorUiStore = createStore<EditorUiState>((set) => ({
  collapsedIds: new Set(),
  toggleCollapsed: (articleId) =>
    set((state) => {
      const collapsedIds = new Set(state.collapsedIds);
      if (collapsedIds.has(articleId)) {
        collapsedIds.delete(articleId);
      } else {
        collapsedIds.add(articleId);
      }
      return { collapsedIds };
    }),
}));

export function useIsCollapsed(articleId: string) {
  return useStore(editorUiStore, (state) => state.collapsedIds.has(articleId));
}

export function useToggleCollapsed() {
  return useStore(editorUiStore, (state) => state.toggleCollapsed);
}
