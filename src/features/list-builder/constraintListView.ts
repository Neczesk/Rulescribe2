import type { ConstraintDef } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";
import { describeConstraint } from "../../core/engine/describeConstraint";
import { lintDraftConstraint } from "../../core/engine/constraintLint";
import type { ConstraintHost } from "../../core/state/currentRuleset";

/** A row in a host's "Constraints" section. */
export interface ConstraintSummaryRow {
  id: string;
  /** Plain-English one-liner from `describeConstraint`. */
  text: string;
  severity: "error" | "warning";
  /** A lint error is present — the row is flagged and worth opening. */
  hasLintError: boolean;
  /** Engine-generated (a format's resource cap): shown, but not editable or deletable. */
  isGenerated: boolean;
}

/** The constraints currently stored on `host`, in order. */
export function hostConstraints(ruleset: Ruleset, host: ConstraintHost): ConstraintDef[] {
  switch (host.kind) {
    case "category":
      return ruleset.listBuilding?.categories.find((c) => c.id === host.id)?.constraints ?? [];
    case "format":
      return ruleset.listBuilding?.formats.find((f) => f.id === host.id)?.constraints ?? [];
    case "nodeDef":
      return ruleset.registry.nodeDefs[host.id]?.constraints ?? [];
    case "categoryRecord":
      return ruleset.registry.categoryRecords[host.id]?.constraints ?? [];
    default:
      return [];
  }
}

export function constraintListView(ruleset: Ruleset, host: ConstraintHost): ConstraintSummaryRow[] {
  return hostConstraints(ruleset, host).map((c) => ({
    id: c.id,
    text: describeConstraint(c, ruleset),
    severity: c.severity,
    hasLintError: lintDraftConstraint(c, ruleset, host).some((i) => i.severity === "error"),
    isGenerated: c.generatedFor != null,
  }));
}
