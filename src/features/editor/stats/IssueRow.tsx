import { useState } from "react";
import type { IssueTarget, Severity, StatsIssue } from "../../../core/stats";
import classes from "./StatsModal.module.css";

const DOT_CLASS: Record<Severity, string> = {
  severe: classes.dotSevere,
  minor: classes.dotMinor,
  info: classes.dotInfo,
};

const SEVERITY_LABEL: Record<Severity, string> = {
  severe: "Breaks the export",
  minor: "Needs attention",
  info: "For information",
};

interface IssueRowProps {
  issue: StatsIssue;
  onNavigate: (target: IssueTarget) => void;
}

/**
 * One row of the Consistency tab. `navigate` actions jump straight to the
 * offender; the list-shaped actions expand the row in place so the author can
 * see everything involved before moving. No action changes the ruleset.
 */
export function IssueRow({ issue, onNavigate }: IssueRowProps) {
  const [expanded, setExpanded] = useState(false);
  const { action } = issue;
  const isChain = action.kind === "chain";

  return (
    <div className={classes.issue}>
      <span
        className={`${classes.dot} ${DOT_CLASS[issue.severity]}`}
        title={SEVERITY_LABEL[issue.severity]}
      />
      <span className={classes.issueText}>
        <span className={classes.issueTitle}>{issue.title}</span>
        <br />
        <span className={classes.issueDetail}>{issue.detail}</span>

        {expanded && action.kind !== "navigate" && action.kind !== "none" && (
          <ul className={`${classes.entries} ${isChain ? classes.chain : ""}`}>
            {action.entries.map((entry, index) => (
              <li key={`${entry.label}-${index}`}>
                {entry.target ? (
                  <button
                    type="button"
                    className={classes.issueAction}
                    style={{ marginLeft: 0 }}
                    onClick={() => onNavigate(entry.target!)}
                  >
                    {entry.label}
                  </button>
                ) : (
                  entry.label
                )}
                {isChain && index < action.entries.length - 1 ? " →" : null}
              </li>
            ))}
          </ul>
        )}
      </span>

      {action.kind === "navigate" && (
        <button
          type="button"
          className={classes.issueAction}
          onClick={() => onNavigate(action.target)}
        >
          {action.label}
        </button>
      )}
      {(action.kind === "list" || action.kind === "chain" || action.kind === "compare") && (
        <button
          type="button"
          className={classes.issueAction}
          aria-expanded={expanded}
          onClick={() => setExpanded((open) => !open)}
        >
          {expanded ? "Hide" : action.label}
        </button>
      )}
    </div>
  );
}
