import type { Dispatch, SetStateAction } from "react";
import { useOutletContext } from "react-router";
import type { ExportOptions } from "../../../core/export/options";
import type { ExportTheme } from "../../../core/export/theme";

/**
 * Shared between the export config screen and the theme workspace (sibling
 * routes under `export`), held by `ExportLayout` and hydrated from / persisted
 * to the local prefs store.
 */
export interface ExportCtx {
  theme: ExportTheme;
  setTheme: Dispatch<SetStateAction<ExportTheme>>;
  options: ExportOptions;
  setOptions: Dispatch<SetStateAction<ExportOptions>>;
  customPresets: ExportTheme[];
  saveCustomPreset: (theme: ExportTheme) => void;
}

export function useExportCtx(): ExportCtx {
  return useOutletContext<ExportCtx>();
}
