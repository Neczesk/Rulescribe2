import type { ConstraintHost } from "../../core/state/currentRuleset";
import { constraintListView } from "./constraintListView";
import { useRuleset } from "./state/useRuleset";
import { constraintEditorStore, useConstraintEditor } from "./state/constraintEditor";
import classes from "./listBuilding.module.css";

interface ConstraintListProps {
  host: ConstraintHost;
  /** Shown when there are no constraints yet. */
  emptyHint: string;
}

/**
 * The list of constraints on one host, plus "+ Constraint". Opening a row (or the
 * add button) drives the shared `ConstraintEditorPanel` through the transient
 * store — this component only reads the ruleset.
 */
export function ConstraintList({ host, emptyHint }: ConstraintListProps) {
  const ruleset = useRuleset();
  const openId = useConstraintEditor((s) =>
    s.open && s.host?.kind === host.kind && s.host.id === host.id ? s.originalId : null,
  );
  if (!ruleset) return null;

  const rows = constraintListView(ruleset, host);

  const openExisting = (id: string) => {
    const constraint = hostConstraint(id);
    if (constraint) constraintEditorStore.getState().openForExisting(host, constraint);
  };

  function hostConstraint(id: string) {
    switch (host.kind) {
      case "category":
        return ruleset?.listBuilding?.categories
          .find((c) => c.id === host.id)
          ?.constraints.find((c) => c.id === id);
      case "format":
        return ruleset?.listBuilding?.formats
          .find((f) => f.id === host.id)
          ?.constraints.find((c) => c.id === id);
      case "nodeDef":
        return ruleset?.registry.nodeDefs[host.id]?.constraints.find((c) => c.id === id);
      case "categoryRecord":
        return ruleset?.registry.categoryRecords[host.id]?.constraints.find((c) => c.id === id);
      default:
        return undefined;
    }
  }

  return (
    <div className={classes.conList}>
      {rows.length === 0 && <div className={classes.conEmpty}>{emptyHint}</div>}
      {rows.map((row) => (
        <div
          key={row.id}
          className={`${classes.conRow} ${openId === row.id ? classes.conRowActive : ""}`}
        >
          {row.isGenerated ? (
            <span className={classes.conRowText} style={{ cursor: "default" }}>
              {row.text}
            </span>
          ) : (
            <button
              type="button"
              className={classes.conRowText}
              onClick={() => openExisting(row.id)}
            >
              {row.text}
            </button>
          )}
          {row.hasLintError && <span className={classes.conRowFlag}>needs a look</span>}
          <span className={classes.conRowSev}>{row.severity}</span>
          {row.isGenerated ? (
            <span className={classes.conRowSev}>auto</span>
          ) : (
            <button type="button" className={classes.ghostBtn} onClick={() => openExisting(row.id)}>
              Edit
            </button>
          )}
        </div>
      ))}
      <div>
        <button
          type="button"
          className={classes.ghostBtn}
          onClick={() => constraintEditorStore.getState().openForNew(host)}
        >
          + Constraint
        </button>
      </div>
    </div>
  );
}
