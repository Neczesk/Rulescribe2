import { createStore, get, set } from "idb-keyval";
import { type ExportOptions, defaultExtras, defaultDraftLayout } from "./options";
import { type ExportTheme, normalizeTheme } from "./theme";

/**
 * Last-used export choices, kept device-local (never in the ruleset). A
 * separate IndexedDB database from the ruleset / image stores — same reason as
 * `imageStorage.ts`: idb-keyval only creates object stores at DB-creation time.
 */
const store = createStore("rulescribe-prefs", "export");
const KEY = "prefs";

/** The slice of `ExportOptions` worth remembering across sessions (not the per-ruleset `includedIds`). */
export type RememberedOptions = Pick<ExportOptions, "mode" | "format" | "extras" | "draft">;

export interface ExportPrefs {
  theme: ExportTheme;
  options: RememberedOptions;
  /** Themes the user saved with "Save as preset", newest first. */
  customPresets: ExportTheme[];
}

function coerceOptions(raw: unknown): RememberedOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    mode: r.mode === "draft" ? "draft" : "rulebook",
    format: r.format === "zip" || r.format === "print" ? r.format : "html",
    extras: { ...defaultExtras(), ...(r.extras && typeof r.extras === "object" ? r.extras : {}) },
    draft: { ...defaultDraftLayout(), ...(r.draft && typeof r.draft === "object" ? r.draft : {}) },
  };
}

export async function loadExportPrefs(): Promise<ExportPrefs | null> {
  try {
    const raw = (await get(KEY, store)) as Record<string, unknown> | undefined;
    if (!raw) return null;
    const customPresets = Array.isArray(raw.customPresets)
      ? raw.customPresets.map((entry) => normalizeTheme(entry))
      : [];
    return {
      theme: normalizeTheme(raw.theme),
      options: coerceOptions(raw.options),
      customPresets,
    };
  } catch {
    return null;
  }
}

export async function saveExportPrefs(prefs: ExportPrefs): Promise<void> {
  try {
    await set(KEY, prefs, store);
  } catch {
    // Local convenience only — a failed write is not worth surfacing.
  }
}
