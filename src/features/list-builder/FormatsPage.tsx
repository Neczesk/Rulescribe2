import { useState } from "react";
import { Link } from "react-router";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { ConstraintEditorPanel } from "./ConstraintEditorPanel";
import { ConstraintList } from "./ConstraintList";
import { type FormatCap, type FormatRow, formatRows } from "./formatsView";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const actions = () => currentRulesetStore.getState();

function capsRecord(row: FormatRow): Record<string, number> {
  return Object.fromEntries(
    row.caps.flatMap((cap) => (cap.value === null ? [] : [[cap.resourceId, cap.value]])),
  );
}

function capHint(cap: FormatCap): string {
  switch (cap.resourceCapType) {
    case "fixed":
      return `Empty uses the resource's fixed cap of ${cap.resourceFixedValue}; a value here overrides it for this format.`;
    case "playerChosen":
      return "Empty lets the player set it; a value here caps it for this format.";
    case "none":
      return "Empty leaves it uncapped in this format.";
  }
}

export function FormatsPage() {
  const ruleset = useRuleset();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  if (!ruleset) return null;

  const rows = formatRows(ruleset);
  const hasResources = (ruleset.listBuilding?.resources.length ?? 0) > 0;

  const addFormat = () => {
    const id = actions().addFormat();
    if (id) {
      setExpandedId(id);
      setConfirmDeleteId(null);
    }
  };

  const removeFormat = (id: string) => {
    actions().deleteFormat(id);
    setConfirmDeleteId(null);
    setExpandedId((current) => (current === id ? null : current));
  };

  return (
    <div className={classes.content}>
      <div className={classes.pageHead}>
        <div className={classes.pageHeadText}>
          <h1 className={classes.pageTitle}>Formats</h1>
          <div className={classes.pageSub}>
            A size of game: what each resource is capped at, plus any rules that apply to the whole
            list.
          </div>
        </div>
        <button type="button" className={classes.primaryBtn} onClick={addFormat}>
          + Add format
        </button>
      </div>

      {rows.length === 0 ? (
        <div className={classes.emptyState}>
          No formats yet. A format is a size of game — it caps each resource and can add whole-list
          rules. Most rulesets have two or three.
        </div>
      ) : (
        <div className={classes.rowList}>
          {rows.map((row) => (
            <FormatRowView
              key={row.id}
              row={row}
              hasResources={hasResources}
              expanded={expandedId === row.id}
              confirmingDelete={confirmDeleteId === row.id}
              onToggle={() => {
                setExpandedId((current) => (current === row.id ? null : row.id));
                setConfirmDeleteId(null);
              }}
              onAskDelete={() => setConfirmDeleteId(row.id)}
              onCancelDelete={() => setConfirmDeleteId(null)}
              onDelete={() => removeFormat(row.id)}
              onDone={() => setExpandedId(null)}
            />
          ))}
        </div>
      )}
      <ConstraintEditorPanel />
    </div>
  );
}

interface FormatRowViewProps {
  row: FormatRow;
  hasResources: boolean;
  expanded: boolean;
  confirmingDelete: boolean;
  onToggle: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
  onDone: () => void;
}

function FormatRowView({
  row,
  hasResources,
  expanded,
  confirmingDelete,
  onToggle,
  onAskDelete,
  onCancelDelete,
  onDelete,
  onDone,
}: FormatRowViewProps) {
  const setCaps = row.caps.filter((cap) => cap.value !== null);
  const capText = setCaps.length
    ? setCaps.map((cap) => `${cap.resourceName || "—"} ${cap.value}`).join(" · ")
    : "No caps set";
  const constraintText = row.listConstraintCount
    ? ` · ${row.listConstraintCount} list constraint${row.listConstraintCount === 1 ? "" : "s"}`
    : "";

  const editCap = (cap: FormatCap, raw: string) => {
    const next = capsRecord(row);
    const parsed = Number.parseInt(raw, 10);
    if (raw.trim() === "" || !Number.isFinite(parsed) || parsed < 0) delete next[cap.resourceId];
    else next[cap.resourceId] = parsed;
    actions().updateFormat(row.id, { resourceCaps: next });
  };

  return (
    <div className={classes.row}>
      <div className={classes.rowHead}>
        <span className={classes.rowName}>{row.name || "Untitled format"}</span>
        <span className={classes.rowMeta}>
          {capText}
          {constraintText}
        </span>
        <button type="button" className={classes.ghostBtn} onClick={onToggle}>
          {expanded ? "Close" : "Edit"}
        </button>
      </div>

      {expanded && (
        <div className={classes.rowEdit}>
          <div className={`${classes.field} ${classes.fieldGrow}`}>
            <label className={classes.fieldLabel}>Name</label>
            <input
              type="text"
              className={classes.textInput}
              value={row.name}
              placeholder="e.g. Strike Force"
              onChange={(event) =>
                actions().updateFormat(row.id, { name: event.currentTarget.value })
              }
            />
          </div>

          <div className={classes.editSection}>
            <span className={classes.editSectionLabel}>Resource caps</span>
            {!hasResources ? (
              <p className={classes.fieldHint}>
                No resources yet —{" "}
                <Link to="../resources" className={classes.inlineLink}>
                  define one
                </Link>{" "}
                first, then set its cap here.
              </p>
            ) : (
              row.caps.map((cap) => (
                <div key={cap.resourceId} className={classes.capRow}>
                  <span className={classes.capName}>{cap.resourceName || "Untitled resource"}</span>
                  <input
                    type="number"
                    min={0}
                    className={classes.numberInput}
                    value={cap.value ?? ""}
                    placeholder="—"
                    onChange={(event) => editCap(cap, event.currentTarget.value)}
                  />
                  <span className={classes.capUnit}>per list</span>
                  <span className={classes.capHint}>{capHint(cap)}</span>
                </div>
              ))
            )}
          </div>

          <div className={classes.editSection}>
            <span className={classes.editSectionLabel}>List constraints</span>
            <ConstraintList
              host={{ kind: "format", id: row.id }}
              emptyHint="Checked against the whole list rather than one node's subtree. None yet."
            />
          </div>

          <div className={classes.rowFooter}>
            {confirmingDelete ? (
              <>
                <span className={classes.rowFooterNote}>
                  Delete {row.name || "this format"}? Its caps and any list constraints go with it.
                </span>
                <button type="button" className={classes.secondaryBtn} onClick={onCancelDelete}>
                  Cancel
                </button>
                <button type="button" className={classes.dangerBtn} onClick={onDelete}>
                  Delete format
                </button>
              </>
            ) : (
              <>
                <button type="button" className={classes.dangerBtn} onClick={onAskDelete}>
                  Delete format
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
