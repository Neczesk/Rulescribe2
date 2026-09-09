/**
 * The choices made in the export dialog. Kept in `core/` (framework-free) so
 * the pure builders and the future prefs store share one shape; the React
 * dialog holds an instance of this in local state and passes it to the
 * feature-side generator.
 */

export type ExportMode = "rulebook" | "draft";

export type ExportFormat = "html" | "print" | "zip";

/** Optional generated sections. All off unless the author asks. */
export type ExtraKey = "toc" | "glossary" | "index" | "credits" | "listBuilding";

export interface DraftLayout {
  paper: "letter" | "a4";
  bodyPt: 11 | 12 | 14;
  paragraphNumbers: boolean;
}

export interface ExportOptions {
  mode: ExportMode;
  format: ExportFormat;
  /** Article ids to include. Order always follows the structure tree. */
  includedIds: string[];
  extras: Record<ExtraKey, boolean>;
  draft: DraftLayout;
}

export const EXTRA_KEYS: ExtraKey[] = ["toc", "glossary", "index", "credits", "listBuilding"];

export const EXTRA_LABELS: Record<ExtraKey, { label: string; hint: string }> = {
  toc: { label: "Table of contents", hint: "Numbered from the structure tree" },
  glossary: { label: "Keyword glossary", hint: "Every keyword's full text, alphabetical" },
  index: { label: "Index of terms", hint: "Section number per keyword use" },
  credits: { label: "Version & credits page", hint: "Title, author, date, schema version" },
  listBuilding: { label: "List-building data", hint: "Node types and categories as tables" },
};

export function defaultDraftLayout(): DraftLayout {
  return { paper: "letter", bodyPt: 11, paragraphNumbers: true };
}

export function defaultExtras(): Record<ExtraKey, boolean> {
  return { toc: false, glossary: false, index: false, credits: false, listBuilding: false };
}

/** A fresh options object. `includedIds` is filled in by the dialog from the outline. */
export function defaultExportOptions(): ExportOptions {
  return {
    mode: "rulebook",
    format: "html",
    includedIds: [],
    extras: defaultExtras(),
    draft: defaultDraftLayout(),
  };
}

/** Formats offered for a given mode, first entry being the default. */
export function formatsForMode(mode: ExportMode): ExportFormat[] {
  return mode === "rulebook" ? ["html", "zip"] : ["html", "print"];
}
