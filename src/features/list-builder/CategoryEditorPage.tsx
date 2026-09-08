import { type ReactNode, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import type { FieldDef } from "../../core/schema/listBuilding";
import { type CategoryFieldPatch, currentRulesetStore } from "../../core/state/currentRuleset";
import {
  ADDABLE_FIELD_TYPES,
  type CategoryEditorView,
  categoryEditorView,
  FIELD_TYPE_LABELS,
  type FieldGroupView,
  type FieldRow,
} from "./categoryEditorView";
import { ConstraintEditorPanel } from "./ConstraintEditorPanel";
import { ConstraintList } from "./ConstraintList";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const actions = () => currentRulesetStore.getState();

export function CategoryEditorPage() {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  const { categoryId } = useParams();
  const [expandedFieldId, setExpandedFieldId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [dragFieldId, setDragFieldId] = useState<string | null>(null);
  const [overFieldId, setOverFieldId] = useState<string | null>(null);

  const view = ruleset && categoryId ? categoryEditorView(ruleset, categoryId) : null;
  if (!ruleset) return null;
  if (!categoryId || !view) return <Navigate to=".." replace />;

  const {
    category,
    fields,
    groups,
    ungroupedFields,
    referenceTargets,
    instanceCount,
    instanceNoun,
  } = view;
  const cid = category.id;

  const addField = (type: FieldDef["type"]) => {
    const id = actions().addCategoryField(cid, { type });
    if (id) setExpandedFieldId(id);
  };

  const duplicate = () => {
    const id = actions().duplicateCategory(cid);
    if (id) navigate(`../${id}`);
  };

  const deleteCategory = () => {
    actions().deleteCategory(cid);
    navigate("..");
  };

  const endDrag = () => {
    setDragFieldId(null);
    setOverFieldId(null);
  };

  /** Drop `dragFieldId` so it lands in `targetGroup` at the flat position `resolveIndex` returns. */
  const applyDrop = (targetGroup: string | null, resolveIndex: (without: string[]) => number) => {
    const dragId = dragFieldId;
    endDrag();
    if (!dragId) return;
    const without = fields.map((f) => f.id).filter((id) => id !== dragId);
    const at = Math.max(0, Math.min(without.length, resolveIndex(without)));
    actions().reorderCategoryFields(cid, [...without.slice(0, at), dragId, ...without.slice(at)]);
    const currentGroup = fields.find((f) => f.id === dragId)?.groupId ?? null;
    if (currentGroup !== targetGroup) actions().setFieldGroup(cid, dragId, targetGroup);
  };

  const dropOnField = (target: FieldRow) => {
    if (!dragFieldId || dragFieldId === target.id) {
      endDrag();
      return;
    }
    applyDrop(target.groupId ?? null, (without) => without.indexOf(target.id));
  };

  const dropAtEndOf = (memberIds: Set<string>, targetGroup: string | null) => {
    applyDrop(targetGroup, (without) => {
      const last = without.reduce((acc, id, i) => (memberIds.has(id) ? i : acc), -1);
      return last === -1 ? without.length : last + 1;
    });
  };

  const fieldCardProps = (row: FieldRow) => ({
    row,
    groups,
    referenceTargets,
    expanded: expandedFieldId === row.id,
    dragging: dragFieldId === row.id,
    dropBefore: overFieldId === row.id && dragFieldId !== null && dragFieldId !== row.id,
    onToggle: () => setExpandedFieldId((c) => (c === row.id ? null : row.id)),
    onChange: (patch: CategoryFieldPatch) => actions().updateCategoryField(cid, row.id, patch),
    onSetGroup: (groupId: string | null) => actions().setFieldGroup(cid, row.id, groupId),
    onKeyMove: (direction: "up" | "down") => actions().moveCategoryField(cid, row.id, direction),
    onDragStart: () => setDragFieldId(row.id),
    onDragEnd: endDrag,
    onDragOverField: () => setOverFieldId(row.id),
    onDropField: () => dropOnField(row),
    onDelete: () => {
      actions().deleteCategoryField(cid, row.id);
      setExpandedFieldId(null);
    },
  });

  return (
    <>
      <div className={classes.editorSplit}>
        <div className={classes.editorMain}>
          <div>
            <div className={classes.titleRow}>
              <input
                type="text"
                className={classes.catNameInput}
                value={category.name}
                placeholder="Category name"
                onChange={(event) =>
                  actions().updateCategory(cid, { name: event.currentTarget.value })
                }
              />
              <button type="button" className={classes.secondaryBtn} onClick={duplicate}>
                Duplicate
              </button>
            </div>
            <div className={classes.appliesRow}>
              <span className={classes.fieldLabel}>Applies to</span>
              <div className={classes.seg}>
                <button
                  type="button"
                  className={`${classes.segOpt} ${category.kind === "node" ? classes.segOptOn : ""}`}
                  onClick={() => actions().updateCategory(cid, { kind: "node" })}
                >
                  Node types
                </button>
                <button
                  type="button"
                  className={`${classes.segOpt} ${category.kind === "record" ? classes.segOptOn : ""}`}
                  onClick={() => actions().updateCategory(cid, { kind: "record" })}
                >
                  Records
                </button>
              </div>
              <span className={classes.capUnit}>
                {category.kind === "node"
                  ? "Things with a cost, slots and options."
                  : "Pure data — no cost, no slots. Other things reference them."}
              </span>
            </div>
          </div>

          <div className={classes.field}>
            <label className={classes.fieldLabel}>What this is for</label>
            <textarea
              className={classes.textareaInput}
              rows={2}
              value={category.description}
              placeholder="Shown to co-authors, and to players wherever this category is surfaced."
              onChange={(event) =>
                actions().updateCategory(cid, { description: event.currentTarget.value })
              }
            />
          </div>

          <div>
            <div className={classes.sectionHead}>
              <h2 className={classes.sectionTitle}>Fields</h2>
              <span className={classes.sectionHint}>
                Every {category.name || "one"} gets these, in this order. Drag the handle to
                reorder.
              </span>
              <button
                type="button"
                className={classes.ghostBtn}
                onClick={() => actions().addFieldGroup(cid)}
              >
                + New group
              </button>
            </div>

            {groups.map((group) => (
              <FieldGroupSection
                key={group.id}
                group={group}
                onRename={(name) => actions().updateFieldGroup(cid, group.id, { name })}
                onLayout={(layout) => actions().updateFieldGroup(cid, group.id, { layout })}
                onDelete={() => actions().deleteFieldGroup(cid, group.id)}
                onDropInto={() => dropAtEndOf(new Set(group.fields.map((f) => f.id)), group.id)}
                renderCard={(row) => <FieldCard key={row.id} {...fieldCardProps(row)} />}
              />
            ))}

            <div
              className={groups.length > 0 ? classes.ungroupedZone : classes.fieldList}
              onDragOver={(event) => {
                if (dragFieldId) event.preventDefault();
              }}
              onDrop={() => dropAtEndOf(new Set(ungroupedFields.map((f) => f.id)), null)}
            >
              {groups.length > 0 && (
                <div className={classes.ungroupedLabel}>
                  {ungroupedFields.length === 0
                    ? "Drop here to remove from a group"
                    : "Not in a group"}
                </div>
              )}
              {ungroupedFields.map((row) => (
                <FieldCard key={row.id} {...fieldCardProps(row)} />
              ))}
            </div>

            <div className={classes.dashRow}>
              {ADDABLE_FIELD_TYPES.map((type) => (
                <button
                  key={type}
                  type="button"
                  className={classes.dashBtn}
                  onClick={() => addField(type)}
                >
                  + {FIELD_TYPE_LABELS[type]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className={classes.sectionHead}>
              <h2 className={classes.sectionTitle}>Constraints</h2>
              <span className={classes.sectionHint}>
                Apply to every {category.name || "instance"}, wherever it ends up in a list.
              </span>
            </div>
            <ConstraintList
              host={{ kind: "category", id: cid }}
              emptyHint={`A category constraint is one you'd otherwise repeat on every ${
                category.name || "instance"
              }. None yet.`}
            />
          </div>
        </div>

        <aside className={classes.editorAside}>
          <div className={classes.asideBlock}>
            <span className={classes.asideLabel}>In this category</span>
            <span className={classes.asideValue}>
              {instanceCount} {instanceNoun}
            </span>
            <Link to=".." className={`${classes.ghostBtn} ${classes.ghostBtnFlush}`}>
              Browse them →
            </Link>
          </div>
          <div className={classes.asideBlock}>
            <span className={classes.asideLabel}>Changing a field</span>
            <span className={classes.asideText}>
              Adding one leaves it empty everywhere. Removing one deletes its values. Changing a
              type keeps what it can.
            </span>
          </div>
          <div className={`${classes.asideBlock} ${classes.asideBlockTop}`}>
            {confirmDelete ? (
              <>
                <span className={classes.asideText}>
                  Delete {category.name || "this category"}? Its {instanceCount} {instanceNoun} keep
                  their values but lose the shared shape.
                </span>
                <div className={classes.rowFooter}>
                  <button
                    type="button"
                    className={classes.secondaryBtn}
                    onClick={() => setConfirmDelete(false)}
                  >
                    Cancel
                  </button>
                  <button type="button" className={classes.dangerBtn} onClick={deleteCategory}>
                    Delete
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  className={classes.secondaryBtn}
                  style={{ width: "100%" }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete category
                </button>
                <span className={classes.asideText}>
                  The {instanceCount} {instanceNoun} that use it keep their values but lose the
                  shared shape.
                </span>
              </>
            )}
          </div>
        </aside>
      </div>
      <ConstraintEditorPanel />
    </>
  );
}

interface FieldGroupSectionProps {
  group: FieldGroupView;
  onRename: (name: string) => void;
  onLayout: (layout: "row" | "stacked") => void;
  onDelete: () => void;
  onDropInto: () => void;
  renderCard: (row: FieldRow) => ReactNode;
}

function FieldGroupSection({
  group,
  onRename,
  onLayout,
  onDelete,
  onDropInto,
  renderCard,
}: FieldGroupSectionProps) {
  return (
    <div
      className={classes.fieldGroupWrap}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.stopPropagation();
        onDropInto();
      }}
    >
      <div className={classes.fieldGroupHeader}>
        <input
          type="text"
          className={classes.groupNameInput}
          value={group.name}
          placeholder="Group name"
          onChange={(event) => onRename(event.currentTarget.value)}
        />
        <div className={classes.seg}>
          <button
            type="button"
            className={`${classes.segOpt} ${group.layout === "stacked" ? classes.segOptOn : ""}`}
            onClick={() => onLayout("stacked")}
          >
            Stacked
          </button>
          <button
            type="button"
            className={`${classes.segOpt} ${group.layout === "row" ? classes.segOptOn : ""}`}
            onClick={() => onLayout("row")}
          >
            Row
          </button>
        </div>
        <button type="button" className={classes.dangerBtn} onClick={onDelete}>
          Ungroup all
        </button>
      </div>
      <div className={classes.fieldList}>
        {group.fields.map((row) => renderCard(row))}
        {group.fields.length === 0 && (
          <div className={classes.groupEmpty}>Drop a field here to add it to this group.</div>
        )}
      </div>
    </div>
  );
}

interface FieldCardProps {
  row: FieldRow;
  groups: FieldGroupView[];
  referenceTargets: CategoryEditorView["referenceTargets"];
  expanded: boolean;
  dragging: boolean;
  dropBefore: boolean;
  onToggle: () => void;
  onChange: (patch: CategoryFieldPatch) => void;
  onSetGroup: (groupId: string | null) => void;
  onKeyMove: (direction: "up" | "down") => void;
  onDragStart: () => void;
  onDragEnd: () => void;
  onDragOverField: () => void;
  onDropField: () => void;
  onDelete: () => void;
}

function FieldCard({
  row,
  groups,
  referenceTargets,
  expanded,
  dragging,
  dropBefore,
  onToggle,
  onChange,
  onSetGroup,
  onKeyMove,
  onDragStart,
  onDragEnd,
  onDragOverField,
  onDropField,
  onDelete,
}: FieldCardProps) {
  const [draftValue, setDraftValue] = useState("");

  const commitValue = () => {
    const value = draftValue.trim();
    if (value && !row.options.includes(value)) onChange({ options: [...row.options, value] });
    setDraftValue("");
  };

  return (
    <div
      className={`${classes.fieldCard} ${dropBefore ? classes.fieldCardOver : ""} ${dragging ? classes.fieldCardDragging : ""}`}
      onDragOver={(event) => {
        event.preventDefault();
        onDragOverField();
      }}
      onDrop={(event) => {
        event.stopPropagation();
        onDropField();
      }}
    >
      <div className={classes.fieldCardHead}>
        <button
          type="button"
          className={classes.dragHandleBtn}
          draggable
          aria-label="Reorder field (drag, or use the arrow keys)"
          onDragStart={(event) => {
            // Firefox only starts a drag once dataTransfer carries something.
            event.dataTransfer.setData("text/plain", row.id);
            event.dataTransfer.effectAllowed = "move";
            onDragStart();
          }}
          onDragEnd={onDragEnd}
          onKeyDown={(event) => {
            if (event.key === "ArrowUp") {
              event.preventDefault();
              onKeyMove("up");
            } else if (event.key === "ArrowDown") {
              event.preventDefault();
              onKeyMove("down");
            }
          }}
        >
          ⠿
        </button>
        <span className={classes.fieldCardName}>{row.name || "Untitled field"}</span>
        <span className={classes.typeChip}>{row.typeLabel}</span>
        {row.detail && <span className={classes.fieldCardDetail}>{row.detail}</span>}
        <button type="button" className={classes.ghostBtn} onClick={onToggle}>
          {expanded ? "Close" : "Edit"}
        </button>
      </div>

      {expanded && (
        <div className={classes.fieldCardBody}>
          <div className={classes.fieldGrid}>
            <div className={`${classes.field} ${classes.fieldGrow}`}>
              <label className={classes.fieldLabel}>Field name</label>
              <input
                type="text"
                className={classes.textInput}
                value={row.name}
                onChange={(event) => onChange({ name: event.currentTarget.value })}
              />
            </div>
            <div className={classes.field}>
              <label className={classes.fieldLabel}>Type</label>
              <select
                className={classes.select}
                value={row.type}
                onChange={(event) =>
                  onChange({ type: event.currentTarget.value as FieldDef["type"] })
                }
              >
                {ADDABLE_FIELD_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {FIELD_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
            </div>
            <div className={classes.field}>
              <label className={classes.fieldLabel}>Group</label>
              <select
                className={classes.select}
                value={row.groupId ?? ""}
                onChange={(event) => onSetGroup(event.currentTarget.value || null)}
              >
                <option value="">No group</option>
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name || "Untitled group"}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {row.isList && (
            <div className={classes.editSection}>
              <span className={classes.editSectionLabel}>Where the values come from</span>
              <div className={classes.seg}>
                <button
                  type="button"
                  className={`${classes.segOpt} ${row.optionSource === "freeform" ? classes.segOptOn : ""}`}
                  onClick={() => onChange({ optionSource: "freeform" })}
                >
                  A list I write
                </button>
                <button
                  type="button"
                  className={`${classes.segOpt} ${row.optionSource === "keywordRegistry" ? classes.segOptOn : ""}`}
                  onClick={() => onChange({ optionSource: "keywordRegistry" })}
                >
                  Keyword registry
                </button>
              </div>
              {row.optionSource === "keywordRegistry" ? (
                <span className={classes.fieldHint}>
                  Whoever fills this in picks from the registry — nothing to list here.
                </span>
              ) : (
                <div>
                  <span className={classes.editSectionLabel}>Allowed values</span>
                  <div className={classes.tagList} style={{ marginTop: "8px" }}>
                    {row.options.map((option) => (
                      <span key={option} className={classes.valueTag}>
                        {option}
                        <button
                          type="button"
                          className={classes.valueTagRemove}
                          aria-label={`Remove ${option}`}
                          onClick={() =>
                            onChange({ options: row.options.filter((o) => o !== option) })
                          }
                        >
                          ×
                        </button>
                      </span>
                    ))}
                    <input
                      type="text"
                      className={classes.addValueInput}
                      placeholder="Add value…"
                      value={draftValue}
                      onChange={(event) => setDraftValue(event.currentTarget.value)}
                      onBlur={commitValue}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          commitValue();
                        }
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {row.isReference && (
            <div className={classes.editSection}>
              <span className={classes.editSectionLabel}>Points at</span>
              {referenceTargets.length === 0 ? (
                <span className={classes.fieldHint}>
                  No record categories yet — a Reference field points at the records of one.
                </span>
              ) : (
                <div className={classes.fieldGrid}>
                  <select
                    className={classes.select}
                    value={row.targetCategoryId ?? ""}
                    onChange={(event) =>
                      onChange({ categoryId: event.currentTarget.value || undefined })
                    }
                  >
                    <option value="">Choose a record category…</option>
                    {referenceTargets.map((target) => (
                      <option key={target.id} value={target.id}>
                        {target.name}
                      </option>
                    ))}
                  </select>
                  <label className={classes.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={row.multiple}
                      onChange={(event) => onChange({ multiple: event.currentTarget.checked })}
                    />
                    Allow several
                  </label>
                </div>
              )}
              <span className={classes.fieldHint}>
                Stores the record itself, so renaming it updates everything that points at it.
              </span>
            </div>
          )}

          {row.isArticleReference && (
            <label className={classes.checkboxLabel}>
              <input
                type="checkbox"
                checked={row.multiple}
                onChange={(event) => onChange({ multiple: event.currentTarget.checked })}
              />
              Allow several links
            </label>
          )}

          <div className={classes.rowFooter}>
            <button type="button" className={classes.dangerBtn} onClick={onDelete}>
              Delete field
            </button>
            <button type="button" className={classes.primaryBtn} onClick={onToggle}>
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
