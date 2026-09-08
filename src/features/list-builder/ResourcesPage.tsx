import { useState } from "react";
import type { ResourceCap } from "../../core/schema/listBuilding";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { type ResourceRow, resourceRows } from "./resourcesView";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const actions = () => currentRulesetStore.getState();

function capOfType(type: ResourceCap["type"], value: number): ResourceCap {
  switch (type) {
    case "fixed":
      return { type: "fixed", value: Number.isFinite(value) && value > 0 ? Math.trunc(value) : 0 };
    case "playerChosen":
      return { type: "playerChosen" };
    case "none":
      return { type: "none" };
  }
}

function capHint(type: ResourceCap["type"]): string {
  switch (type) {
    case "fixed":
      return "Every list gets this cap, whatever the format.";
    case "playerChosen":
      return "The player picks the cap for each list they build.";
    case "none":
      return "No cap here — each format sets one, and where a format is silent this resource is uncapped.";
  }
}

export function ResourcesPage() {
  const ruleset = useRuleset();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!ruleset) return null;

  const rows = resourceRows(ruleset);

  const addResource = () => {
    const id = actions().addResource();
    if (id) {
      setExpandedId(id);
      setConfirmDeleteId(null);
    }
  };

  const removeResource = (id: string) => {
    actions().deleteResource(id);
    setConfirmDeleteId(null);
    setExpandedId((current) => (current === id ? null : current));
  };

  return (
    <div className={classes.content}>
      <div className={classes.pageHead}>
        <div className={classes.pageHeadText}>
          <h1 className={classes.pageTitle}>Resources</h1>
          <div className={classes.pageSub}>
            What a list spends. A node type can cost some of each, and a format caps them.
          </div>
        </div>
        <button type="button" className={classes.primaryBtn} onClick={addResource}>
          + Add resource
        </button>
      </div>

      {rows.length === 0 ? (
        <div className={classes.emptyState}>
          No resources yet. A resource is anything a list spends down — points, command points,
          requisition. Node types cost them; formats cap them.
        </div>
      ) : (
        <div className={classes.rowList}>
          {rows.map((row) => (
            <ResourceRowView
              key={row.id}
              row={row}
              expanded={expandedId === row.id}
              confirmingDelete={confirmDeleteId === row.id}
              onToggle={() => {
                setExpandedId((current) => (current === row.id ? null : row.id));
                setConfirmDeleteId(null);
              }}
              onAskDelete={() => setConfirmDeleteId(row.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={() => removeResource(row.id)}
              onDone={() => setExpandedId(null)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface ResourceRowViewProps {
  row: ResourceRow;
  expanded: boolean;
  confirmingDelete: boolean;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onDone: () => void;
}

function ResourceRowView({
  row,
  expanded,
  confirmingDelete,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onDone,
}: ResourceRowViewProps) {
  const usage =
    row.usedByCount > 0
      ? ` · used by ${row.usedByCount} node type${row.usedByCount === 1 ? "" : "s"}`
      : "";

  const deleteNote =
    row.usedByCount > 0
      ? `${row.name || "This resource"} is spent by ${row.usedByCount} node type${
          row.usedByCount === 1 ? "" : "s"
        } — those costs will point at nothing.`
      : `Delete ${row.name || "this resource"}?`;

  return (
    <div className={classes.row}>
      <div className={classes.rowHead}>
        <span className={classes.rowName}>{row.name || "Untitled resource"}</span>
        <span className={classes.rowMeta}>
          {row.capLabel}
          {usage}
        </span>
        <button type="button" className={classes.ghostBtn} onClick={onToggle}>
          {expanded ? "Close" : "Edit"}
        </button>
      </div>

      {expanded && (
        <div className={classes.rowEdit}>
          <div className={classes.fieldGrid}>
            <div className={`${classes.field} ${classes.fieldGrow}`}>
              <label className={classes.fieldLabel}>Name</label>
              <input
                type="text"
                className={classes.textInput}
                value={row.name}
                placeholder="e.g. Points"
                onChange={(event) =>
                  actions().updateResource(row.id, { name: event.currentTarget.value })
                }
              />
            </div>

            <div className={classes.field}>
              <label className={classes.fieldLabel}>Cap</label>
              <select
                className={classes.select}
                value={row.capType}
                onChange={(event) =>
                  actions().updateResource(row.id, {
                    cap: capOfType(event.currentTarget.value as ResourceCap["type"], row.capValue),
                  })
                }
              >
                <option value="none">Set per format</option>
                <option value="fixed">Fixed for every list</option>
                <option value="playerChosen">Player sets it</option>
              </select>
            </div>

            {row.capType === "fixed" && (
              <div className={classes.field}>
                <label className={classes.fieldLabel}>Amount</label>
                <input
                  type="number"
                  min={0}
                  className={classes.numberInput}
                  value={row.capValue}
                  onChange={(event) =>
                    actions().updateResource(row.id, {
                      cap: capOfType("fixed", Number.parseInt(event.currentTarget.value, 10)),
                    })
                  }
                />
              </div>
            )}

            <p className={classes.fieldHint}>{capHint(row.capType)}</p>
          </div>

          <div className={classes.rowFooter}>
            {confirmingDelete ? (
              <>
                <span className={classes.rowFooterNote}>{deleteNote}</span>
                <button type="button" className={classes.secondaryBtn} onClick={onCancelDelete}>
                  Cancel
                </button>
                <button type="button" className={classes.dangerBtn} onClick={onDelete}>
                  Delete resource
                </button>
              </>
            ) : (
              <>
                <button type="button" className={classes.dangerBtn} onClick={onAskDelete}>
                  Delete resource
                </button>
                <button type="button" className={classes.primaryBtn} onClick={onDone}>
                  Done
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
