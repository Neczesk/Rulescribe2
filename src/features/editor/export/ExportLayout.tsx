import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router";
import { loadExportPrefs, saveExportPrefs } from "../../../core/export/exportPrefs";
import { buildOutline, defaultIncludedIds } from "../../../core/export/outline";
import { type ExportOptions, defaultExportOptions } from "../../../core/export/options";
import { type ExportTheme, DEFAULT_THEME } from "../../../core/export/theme";
import { useRuleset } from "../state/useCurrentRuleset";
import type { ExportCtx } from "./exportContext";

/**
 * Shell for the export route. Owns the theme + options shared by the config
 * screen and the theme workspace: seeded from `defaultExportOptions()` +
 * this ruleset's outline, then overlaid with the device-local prefs, then
 * debounce-persisted back whenever they change.
 */
export function ExportLayout() {
  const ruleset = useRuleset();

  const [theme, setTheme] = useState<ExportTheme>(DEFAULT_THEME);
  const [customPresets, setCustomPresets] = useState<ExportTheme[]>([]);
  const [options, setOptions] = useState<ExportOptions>(() => {
    const base = defaultExportOptions();
    return {
      ...base,
      includedIds: ruleset ? [...defaultIncludedIds(buildOutline(ruleset), base.mode)] : [],
    };
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (!ruleset) return;
    let cancelled = false;
    loadExportPrefs().then((prefs) => {
      if (cancelled) return;
      if (prefs) {
        setTheme(prefs.theme);
        setCustomPresets(prefs.customPresets);
        setOptions((current) => ({
          ...current,
          mode: prefs.options.mode,
          format: prefs.options.format,
          extras: prefs.options.extras,
          draft: prefs.options.draft,
          includedIds: [...defaultIncludedIds(buildOutline(ruleset), prefs.options.mode)],
        }));
      }
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ruleset]);

  useEffect(() => {
    if (!hydrated) return;
    const timer = setTimeout(() => {
      void saveExportPrefs({
        theme,
        options: {
          mode: options.mode,
          format: options.format,
          extras: options.extras,
          draft: options.draft,
        },
        customPresets,
      });
    }, 500);
    return () => clearTimeout(timer);
  }, [hydrated, theme, options, customPresets]);

  if (!ruleset) return <Navigate to="/" replace />;

  const saveCustomPreset = (preset: ExportTheme) =>
    setCustomPresets((list) =>
      [preset, ...list.filter((p) => p.name !== preset.name)].slice(0, 12),
    );

  return (
    <Outlet
      context={
        {
          theme,
          setTheme,
          options,
          setOptions,
          customPresets,
          saveCustomPreset,
        } satisfies ExportCtx
      }
    />
  );
}
