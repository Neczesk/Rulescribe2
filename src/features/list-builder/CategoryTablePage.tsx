import { useState } from "react";
import { Link, Navigate, useParams } from "react-router";
import type { FieldValue } from "../../core/schema/selector";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { categoryTableView, type TableColumn } from "./categoryTableView";
import { TableCell } from "./TableCell";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const actions = () => currentRulesetStore.getState();

export function CategoryTablePage() {
  const ruleset = useRuleset();
  const { categoryId } = useParams();
  const [query, setQuery] = useState("");

  const view = ruleset && categoryId ? categoryTableView(ruleset, categoryId) : null;
  if (!ruleset) return null;
  if (!categoryId || !view) return <Navigate to=".." replace />;

  const { category, kind, itemNoun, columns, rows, fieldCount } = view;

  const addRow = () => {
    if (kind === "node") actions().addNodeDef({ categoryId });
    else actions().addCategoryRecord({ categoryId });
  };

  const deleteRow = (rowId: string) => {
    if (kind === "node") actions().deleteNodeDef(rowId);
    else actions().deleteCategoryRecord(rowId);
  };

  const setCell = (rowId: string, column: TableColumn, value: FieldValue | undefined) => {
    if (column.kind === "name") {
      const name = typeof value === "string" ? value : "";
      if (kind === "node") actions().updateNodeDef(rowId, { name });
      else actions().updateCategoryRecord(rowId, { name });
    } else if (column.kind === "cost") {
      actions().setNodeDefBaseCost(
        rowId,
        column.resourceId!,
        typeof value === "number" ? value : undefined,
      );
    } else if (kind === "node") {
      actions().setNodeDefFieldValue(rowId, column.fieldId!, value);
    } else {
      actions().setCategoryRecordValue(rowId, column.fieldId!, value);
    }
  };

  const needle = query.trim().toLowerCase();
  const shown = needle
    ? rows.filter((row) => (row.name || "").toLowerCase().includes(needle))
    : rows;

  return (
    <div className={classes.tablePage}>
      <div className={classes.tableHeaderRow}>
        <div className={classes.pageHeadText}>
          <h1 className={classes.pageTitle}>{category.name || "Untitled category"}</h1>
          <div className={classes.pageSub}>
            {rows.length} {rows.length === 1 ? itemNoun : `${itemNoun}s`} · {fieldCount} field
            {fieldCount === 1 ? "" : "s"}
          </div>
        </div>
        <input
          type="search"
          className={classes.filterInput}
          placeholder="Filter by name…"
          value={query}
          onChange={(event) => setQuery(event.currentTarget.value)}
        />
        <Link to="fields" className={classes.secondaryBtn}>
          Fields &amp; constraints
        </Link>
        <button type="button" className={classes.primaryBtn} onClick={addRow}>
          + New {itemNoun}
        </button>
      </div>

      {rows.length === 0 ? (
        <div className={classes.emptyState}>
          No {itemNoun}s yet. Each one is a row here; its columns come from this category's fields.
        </div>
      ) : (
        <div className={classes.tableWrap}>
          <table className={classes.dataTable}>
            <thead>
              <tr>
                {columns.map((column) => (
                  <th key={column.key} style={{ textAlign: column.align }}>
                    <div className={classes.colCaption}>{column.typeCaption}</div>
                    <div>{column.label}</div>
                  </th>
                ))}
                <th aria-label="Actions" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr key={row.id}>
                  {columns.map((column) => (
                    <td key={column.key} style={{ textAlign: column.align }}>
                      <TableCell
                        column={column}
                        value={column.kind === "name" ? row.name : row.cells[column.key]}
                        onChange={(next) => setCell(row.id, column, next)}
                      />
                    </td>
                  ))}
                  <td className={classes.rowActionsCell}>
                    <Link
                      to={kind === "node" ? `nodes/${row.id}` : `records/${row.id}`}
                      className={classes.rowDelete}
                    >
                      Edit
                    </Link>
                    <button
                      type="button"
                      className={classes.rowDelete}
                      aria-label={`Delete ${row.name || "row"}`}
                      onClick={() => deleteRow(row.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {shown.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 1} className={classes.tableEmpty}>
                    No {itemNoun}s match “{query}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
