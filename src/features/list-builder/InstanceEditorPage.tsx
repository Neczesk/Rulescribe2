import { useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import type { FieldValue } from "../../core/schema/selector";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { ConstraintEditorPanel } from "./ConstraintEditorPanel";
import { ConstraintList } from "./ConstraintList";
import { type InstanceFieldRow, instanceEditorView } from "./instanceEditorView";
import { TableCell } from "./TableCell";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const actions = () => currentRulesetStore.getState();

/** Editor for one `NodeDef` or `CategoryRecord` — name, field values, and its constraints. */
export function InstanceEditorPage() {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  const { nodeId, recordId } = useParams();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const kind = nodeId ? "nodeDef" : "categoryRecord";
  const id = nodeId ?? recordId;
  const view = ruleset && id ? instanceEditorView(ruleset, kind, id) : null;
  if (!ruleset) return null;
  if (!id || !view) return <Navigate to=".." replace />;

  const { name, category, categoryName, fieldRows, inheritedConstraints, baseCostSummary, backTo } =
    view;

  const setName = (value: string) => {
    if (kind === "nodeDef") actions().updateNodeDef(id, { name: value });
    else actions().updateCategoryRecord(id, { name: value });
  };

  const commit = (row: InstanceFieldRow, next: FieldValue | undefined) => {
    if (row.column.kind === "cost") {
      actions().setNodeDefBaseCost(
        id,
        row.column.resourceId ?? "",
        typeof next === "number" ? next : undefined,
      );
    } else if (kind === "nodeDef") {
      actions().setNodeDefFieldValue(id, row.column.fieldId ?? "", next);
    } else {
      actions().setCategoryRecordValue(id, row.column.fieldId ?? "", next);
    }
  };

  const remove = () => {
    if (kind === "nodeDef") actions().deleteNodeDef(id);
    else actions().deleteCategoryRecord(id);
    navigate(backTo);
  };

  return (
    <>
      <div className={classes.editorSplit}>
        <div className={classes.editorMain}>
          <div>
            <div className={classes.titleRow}>
              <input
                type="text"
                className={classes.catNameInput}
                value={name}
                placeholder={kind === "nodeDef" ? "Node type name" : "Record name"}
                onChange={(event) => setName(event.currentTarget.value)}
              />
              <span className={classes.typeChip}>{categoryName}</span>
            </div>
            <div className={classes.appliesRow}>
              <Link to={backTo} className={classes.ghostBtn}>
                ← Back to {categoryName}
              </Link>
            </div>
          </div>

          <div className={classes.editSection}>
            <span className={classes.editSectionLabel}>Values</span>
            {category ? (
              fieldRows.map((row) => (
                <div key={row.column.key} className={classes.nodeFieldRow}>
                  <span className={classes.nodeFieldLabel}>{row.column.label}</span>
                  <TableCell
                    column={row.column}
                    value={row.value}
                    onChange={(next) => commit(row, next)}
                  />
                </div>
              ))
            ) : (
              <span className={classes.fieldHint}>
                This {view.noun} has no category, so it has no fields yet. Give it one from the{" "}
                <Link to={backTo} className={classes.inlineLink}>
                  category table
                </Link>
                .
              </span>
            )}
          </div>

          <div>
            <div className={classes.sectionHead}>
              <h2 className={classes.sectionTitle}>Constraints</h2>
              <span className={classes.sectionHint}>
                {kind === "nodeDef"
                  ? `Checked against this ${name || "node type"} and everything inside it — never its siblings.`
                  : "Contributed wherever a node's reference field points at this record."}
              </span>
            </div>
            <ConstraintList host={{ kind, id }} emptyHint="None on this one yet." />
          </div>

          {inheritedConstraints.length > 0 && (
            <div className={classes.editSection}>
              <span className={classes.editSectionLabel}>Inherited from {categoryName}</span>
              {inheritedConstraints.map((c) => (
                <div key={c.id} className={classes.ceInheritedRow}>
                  <span style={{ flex: 1 }}>{c.text}</span>
                  <span className={classes.ceInheritedSev}>{c.severity}</span>
                </div>
              ))}
              <span className={classes.fieldHint}>Edit these on the category.</span>
            </div>
          )}
        </div>

        <aside className={classes.editorAside}>
          {kind === "nodeDef" && (
            <div className={classes.asideBlock}>
              <span className={classes.asideLabel}>Base cost</span>
              <span className={classes.asideText}>{baseCostSummary || "None set."}</span>
            </div>
          )}
          <div className={`${classes.asideBlock} ${classes.asideBlockTop}`}>
            {confirmDelete ? (
              <>
                <span className={classes.asideText}>Delete {name || `this ${view.noun}`}?</span>
                <div className={classes.rowFooter}>
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className={classes.dangerBtn} onClick={remove}>
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <button
                type="button"
                className={classes.secondaryBtn}
                style={{ width: "100%" }}
                onClick={() => setConfirmDelete(true)}
              >
                Delete {view.noun}
              </button>
            )}
          </div>
        </aside>
      </div>
      <ConstraintEditorPanel />
    </>
  );
}
