import { rulesetSlugId } from "../paths";
import { useRuleset } from "./useCurrentRuleset";

export interface EditorPaths {
  /** The ruleset root (its root article). */
  root: string;
  article: (articleId: string) => string;
  keyword: (keywordId: string) => string;
  /** The list-building side of this ruleset. */
  listBuilding: string;
  /** The export configuration screen for this ruleset. */
  export: string;
  /** The rulebook theme workspace for this ruleset. */
  exportTheme: string;
}

/** Absolute editor routes for the currently loaded ruleset. */
export function useEditorPaths(): EditorPaths {
  const ruleset = useRuleset();
  const base = ruleset ? `/editor/${rulesetSlugId(ruleset.metadata)}` : "/editor";
  return {
    root: base,
    article: (articleId) => `${base}/${articleId}`,
    keyword: (keywordId) => `${base}/keyword/${keywordId}`,
    listBuilding: `${base}/list-building`,
    export: `${base}/export`,
    exportTheme: `${base}/export/theme`,
  };
}
