import type { StatsIssue } from "../../../core/stats";

const HEADER = ["code", "area", "severity", "warning", "detail", "affected"] as const;

/** The issue list as a CSV, matching `docs/consistency-warnings.csv`'s columns. */
export function issuesToCsv(issues: StatsIssue[]): string {
  const rows = issues.map((issue) => [
    issue.code,
    issue.area,
    issue.severity,
    issue.title,
    issue.detail,
    affected(issue),
  ]);
  return [HEADER, ...rows].map((row) => row.map(escapeCell).join(",")).join("\n");
}

function affected(issue: StatsIssue): string {
  const { action } = issue;
  if (action.kind === "navigate") return action.target.id;
  if (action.kind === "none") return "";
  return action.entries.map((entry) => entry.label).join("; ");
}

function escapeCell(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}
