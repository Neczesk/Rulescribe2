/**
 * Consistency checks: warnings derivable from a ruleset by simple, objective
 * algorithms. The catalogue (codes, wording, severities) lives in
 * `docs/consistency-warnings.csv`; each check here implements one row of it.
 *
 * Nothing in here is subjective or heuristic beyond the readability scores,
 * which come from a published formula. A check either fires on a structural
 * fact or it doesn't.
 */

/**
 * - `severe` — the export or the engine is provably broken: dangling ids, live
 *   references that resolve to nothing, unreachable content.
 * - `minor` — output is stale, misleading, or contradicts author intent, but
 *   nothing breaks.
 * - `info` — awareness only; no defect implied.
 */
export type Severity = "severe" | "minor" | "info";

export const SEVERITY_ORDER: Record<Severity, number> = {
  severe: 0,
  minor: 1,
  info: 2,
};

export type StatsArea =
  | "references"
  | "content"
  | "structure"
  | "readability"
  | "diagrams"
  | "export";

/** Where an issue's action can send the author. */
export type IssueTarget = { kind: "article"; id: string } | { kind: "keyword"; id: string };

/** One affected entity inside a `list` / `chain` / `compare` action. */
export interface IssueEntry {
  label: string;
  /** Absent when the entity is gone (a deleted keyword) or has no editor route. */
  target?: IssueTarget;
}

/**
 * What the issue row's button does. `navigate` jumps straight to the single
 * offender; the others expand the row in place to enumerate them. No action
 * mutates the ruleset — fixing is the author's move.
 */
export type IssueAction =
  | { kind: "navigate"; label: string; target: IssueTarget }
  | { kind: "list" | "chain" | "compare"; label: string; entries: IssueEntry[] }
  | { kind: "none" };

export interface StatsIssue {
  /** Catalogue id, e.g. `"REF-07"`. Stable across releases. */
  code: string;
  area: StatsArea;
  severity: Severity;
  /** Headline, with the count folded in: `"2 references point at a deleted source"`. */
  title: string;
  /** One sentence naming the offenders and the consequence. */
  detail: string;
  action: IssueAction;
}

export const articleTarget = (id: string): IssueTarget => ({ kind: "article", id });
export const keywordTarget = (id: string): IssueTarget => ({ kind: "keyword", id });
