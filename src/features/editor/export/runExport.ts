import type { ExportOptions } from "../../../core/export/options";
import type { ExportTheme } from "../../../core/export/theme";
import type { Ruleset } from "../../../core/schema/ruleset";
import { slugify } from "../../../util/slug";
import { buildDraftHtml } from "./buildDraftHtml";
import { buildRulebookHtml } from "./buildRulebookHtml";
import { downloadFile } from "./download";

/** True when `options` produces a full HTML document (everything but the zip bundle). */
export function isDocFormat(options: ExportOptions): boolean {
  return options.mode === "draft" || options.format === "html";
}

/**
 * The single HTML document for the current selection — the Draft layout or the
 * themed Rulebook. Shared by the download and the in-app preview so the preview
 * is always exactly what ships.
 */
export function buildExportDoc(
  ruleset: Ruleset,
  options: ExportOptions,
  theme: ExportTheme,
): Promise<string> {
  return options.mode === "draft"
    ? buildDraftHtml(ruleset, options)
    : buildRulebookHtml(ruleset, options, theme);
}

/** Build the export for `options` and hand it to the browser as a download. */
export async function runExport(
  ruleset: Ruleset,
  options: ExportOptions,
  theme: ExportTheme,
): Promise<void> {
  if (!isDocFormat(options)) {
    throw new Error("That export format isn't available yet.");
  }
  const slug = slugify(ruleset.metadata.title);
  const filename = options.mode === "draft" ? `${slug}-draft.html` : `${slug}.html`;
  downloadFile(filename, await buildExportDoc(ruleset, options, theme), "text/html");
}
