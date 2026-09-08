import type { CategoryDef, FieldDef } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";
import type { FieldValue } from "../../core/schema/selector";
import { FIELD_TYPE_LABELS } from "./categoryEditorView";

/**
 * Read model for browsing every instance of a category as a table. Columns are
 * Name, one per declared resource (node categories only — the base cost), then
 * one per author field. Rows are the `NodeDef`s / `CategoryRecord`s that point
 * at the category. Nothing here is game-specific.
 */

export interface Choice {
  value: string;
  label: string;
}

export interface TableColumn {
  key: string;
  kind: "name" | "cost" | "field";
  label: string;
  /** Column type caption shown above the label, matching the design. */
  typeCaption: string;
  align: "left" | "right" | "center";
  /** `cost` columns. */
  resourceId?: string;
  /** `field` columns. */
  fieldId?: string;
  fieldType?: FieldDef["type"];
  /** True when the cell holds a `string[]` (multiValue, or multiple reference / article link). */
  multiple?: boolean;
  /** Options for select-style cells: list values, referenced records, or articles. */
  choices?: Choice[];
  /** A freeform value list with no predefined options accepts typed entries. */
  freeText?: boolean;
}

export interface TableRow {
  id: string;
  name: string;
  /** Keyed by column key; `undefined` where unset. */
  cells: Record<string, FieldValue | undefined>;
}

export interface CategoryTableView {
  category: CategoryDef;
  kind: "node" | "record";
  /** Singular noun for the "+ New …" button and empty state. */
  itemNoun: string;
  columns: TableColumn[];
  rows: TableRow[];
  fieldCount: number;
}

const alignFor = (type: FieldDef["type"]): TableColumn["align"] =>
  type === "number" ? "right" : type === "boolean" ? "center" : "left";

export function categoryTableView(ruleset: Ruleset, categoryId: string): CategoryTableView | null {
  const listBuilding = ruleset.listBuilding;
  const category = listBuilding?.categories.find((c) => c.id === categoryId);
  if (!category || !listBuilding) return null;

  const recordChoicesByCategory = (targetId: string | undefined): Choice[] => {
    if (!targetId) return [];
    return Object.values(ruleset.registry.categoryRecords)
      .filter((r) => r.categoryId === targetId)
      .map((r) => ({ value: r.id, label: r.name || "Untitled record" }));
  };

  const articleChoices: Choice[] = Object.values(ruleset.registry.articles).map((a) => ({
    value: a.id,
    label: a.title || "Untitled article",
  }));

  const keywordLabel = (id: string) => ruleset.registry.keywords[id]?.displayName || id;

  const columns: TableColumn[] = [
    { key: "name", kind: "name", label: "Name", typeCaption: "Name", align: "left" },
  ];

  if (category.kind === "node") {
    for (const resource of listBuilding.resources) {
      columns.push({
        key: `cost:${resource.id}`,
        kind: "cost",
        label: resource.name || "Untitled resource",
        typeCaption: "Base cost",
        align: "right",
        resourceId: resource.id,
      });
    }
  }

  for (const field of category.fields) {
    const isList = field.type === "singleValue" || field.type === "multiValue";
    const isRef = field.type === "reference";
    const isArticle = field.type === "articleReference";
    const multiple =
      field.type === "multiValue" || ((isRef || isArticle) && (field.multiple ?? false));

    let choices: Choice[] | undefined;
    let freeText = false;
    if (isList) {
      choices =
        field.optionSource === "keywordRegistry"
          ? field.options.map((id) => ({ value: id, label: keywordLabel(id) }))
          : field.options.map((v) => ({ value: v, label: v }));
      freeText = field.optionSource !== "keywordRegistry" && field.options.length === 0;
    } else if (isRef) {
      choices = recordChoicesByCategory(field.categoryId);
    } else if (isArticle) {
      choices = articleChoices;
    }

    columns.push({
      key: `field:${field.id}`,
      kind: "field",
      label: field.name || "Untitled field",
      typeCaption: FIELD_TYPE_LABELS[field.type],
      align: alignFor(field.type),
      fieldId: field.id,
      fieldType: field.type,
      multiple,
      choices,
      freeText,
    });
  }

  const costCols = columns.filter((c) => c.kind === "cost");
  const fieldCols = columns.filter((c) => c.kind === "field");

  let rows: TableRow[];
  if (category.kind === "node") {
    rows = Object.values(ruleset.registry.nodeDefs)
      .filter((n) => n.categoryId === categoryId)
      .map((node) => {
        const cells: TableRow["cells"] = {};
        for (const col of costCols) cells[col.key] = node.baseCosts[col.resourceId!];
        for (const col of fieldCols) cells[col.key] = node.fields[col.fieldId!];
        return { id: node.id, name: node.name, cells };
      });
  } else {
    rows = Object.values(ruleset.registry.categoryRecords)
      .filter((r) => r.categoryId === categoryId)
      .map((record) => {
        const cells: TableRow["cells"] = {};
        for (const col of fieldCols) cells[col.key] = record.values[col.fieldId!];
        return { id: record.id, name: record.name, cells };
      });
  }

  return {
    category,
    kind: category.kind,
    itemNoun: category.kind === "record" ? "record" : "node type",
    columns,
    rows,
    fieldCount: category.fields.length,
  };
}
