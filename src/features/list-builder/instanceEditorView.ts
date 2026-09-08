import type { CategoryDef, CategoryRecord, NodeDef } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";
import type { FieldValue } from "../../core/schema/selector";
import { describeConstraint } from "../../core/engine/describeConstraint";
import { categoryTableView, type TableColumn } from "./categoryTableView";

/**
 * Read model for the instance editor — a thin screen whose reason to exist is
 * hosting per-instance constraints, shared by `NodeDef` and `CategoryRecord`.
 * Field/base-cost columns are reused from `categoryTableView` so choice
 * resolution stays in one place (records naturally get field columns only).
 */

export type InstanceKind = "nodeDef" | "categoryRecord";

export interface InstanceFieldRow {
  column: TableColumn;
  value: FieldValue | undefined;
}

export interface InstanceEditorView {
  kind: InstanceKind;
  /** "node type" | "record" — for copy. */
  noun: string;
  id: string;
  name: string;
  category: CategoryDef | null;
  categoryName: string;
  fieldRows: InstanceFieldRow[];
  /** The instance's own, author-written constraints (excludes engine-generated). */
  constraintCount: number;
  /** The instance's category's constraints, shown read-only. */
  inheritedConstraints: { id: string; text: string; severity: "error" | "warning" }[];
  /** Base-cost summary string for the aside ("" for records / when none set). */
  baseCostSummary: string;
  /** Relative path back to the category table. */
  backTo: string;
}

export function instanceEditorView(
  ruleset: Ruleset,
  kind: InstanceKind,
  id: string,
): InstanceEditorView | null {
  const node: NodeDef | undefined = kind === "nodeDef" ? ruleset.registry.nodeDefs[id] : undefined;
  const record: CategoryRecord | undefined =
    kind === "categoryRecord" ? ruleset.registry.categoryRecords[id] : undefined;
  const instance = node ?? record;
  if (!instance) return null;

  const categoryId = node ? node.categoryId : record?.categoryId;
  const category = categoryId
    ? (ruleset.listBuilding?.categories.find((c) => c.id === categoryId) ?? null)
    : null;

  const fieldRows: InstanceFieldRow[] = [];
  if (category) {
    const table = categoryTableView(ruleset, category.id);
    for (const column of table?.columns ?? []) {
      if (column.kind === "cost" && node) {
        fieldRows.push({ column, value: node.baseCosts[column.resourceId ?? ""] });
      } else if (column.kind === "field") {
        const values = node ? node.fields : (record?.values ?? {});
        fieldRows.push({ column, value: values[column.fieldId ?? ""] });
      }
    }
  }

  const baseCostSummary = node
    ? Object.entries(node.baseCosts)
        .map(([resourceId, amount]) => {
          const name = ruleset.listBuilding?.resources.find((r) => r.id === resourceId)?.name;
          return `${name || "—"} ${amount}`;
        })
        .join(" · ")
    : "";

  return {
    kind,
    noun: kind === "nodeDef" ? "node type" : "record",
    id,
    name: instance.name,
    category,
    categoryName: category ? category.name.trim() || "Untitled category" : "No category",
    fieldRows,
    constraintCount: instance.constraints.filter((c) => c.generatedFor == null).length,
    inheritedConstraints: (category?.constraints ?? [])
      .filter((c) => c.generatedFor == null)
      .map((c) => ({ id: c.id, text: describeConstraint(c, ruleset), severity: c.severity })),
    baseCostSummary,
    backTo: "../..",
  };
}
