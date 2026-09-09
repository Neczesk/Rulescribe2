import { BLOCKING_SEVERITY } from "./catalogue";
import type { StatsIssue } from "./types";

/**
 * Which issues stop an export. The threshold itself is data
 * (`catalogue.json`'s `blockingSeverity`, "severe" by default) — reclassify a
 * check's severity there and it moves in or out of this set on its own.
 *
 * Blocking is always advisory, never absolute: the export flow shows these and
 * lets the author proceed anyway (see `ExportConfigPage`'s "Export anyway").
 * Nothing here refuses to run a check or hides an issue — it only decides
 * which ones the export screen surfaces as a gate rather than a footnote.
 */
export function blockingIssues(issues: StatsIssue[]): StatsIssue[] {
  return issues.filter((issue) => issue.severity === BLOCKING_SEVERITY);
}

export { BLOCKING_SEVERITY };
