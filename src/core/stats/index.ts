export { BLOCKING_SEVERITY, blockingIssues } from "./blocking";
export { buildStatsContext, REF_DISPLAYS, isLiveText } from "./context";
export type { EntityInfo, RefDisplayMode, RefNode, StatsContext, StatsExtras } from "./context";
export { buildRulesetStats } from "./overview";
export type { BarRow, Figure, RulesetStats } from "./overview";
export { scoreText, weightedGrade } from "./readability";
export type { ReadabilityScore } from "./readability";
export { runConsistencyChecks } from "./runChecks";
export { THRESHOLDS } from "./thresholds";
export { SEVERITY_ORDER } from "./types";
export type {
  IssueAction,
  IssueEntry,
  IssueTarget,
  Severity,
  StatsArea,
  StatsIssue,
} from "./types";
