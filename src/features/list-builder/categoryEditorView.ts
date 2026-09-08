import type { CategoryDef, FieldDef } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";

/**
 * Read model for the category editor. A category is just an author-defined
 * field schema plus a `kind`; nothing here is game-specific. `instanceCount` is
 * how many NodeDefs / CategoryRecords currently conform to it.
 */

export const FIELD_TYPE_LABELS: Record<FieldDef["type"], string> = {
  number: "Number",
  text: "Text",
  boolean: "Yes / no",
  singleValue: "One of a list",
  multiValue: "Several of a list",
  reference: "Reference",
  articleReference: "Article link",
};

/** The order the "add a field" buttons appear in, matching the design. */
export const ADDABLE_FIELD_TYPES: FieldDef["type"][] = [
  "number",
  "text",
  "boolean",
  "singleValue",
  "multiValue",
  "reference",
  "articleReference",
];

export interface FieldRow {
  id: string;
  name: string;
  type: FieldDef["type"];
  typeLabel: string;
  /** One-line summary for the collapsed row. */
  detail: string;
  /** singleValue | multiValue — has a value list. */
  isList: boolean;
  isReference: boolean;
  isArticleReference: boolean;
  optionSource: "freeform" | "keywordRegistry";
  options: string[];
  multiple: boolean;
  targetCategoryId: string | undefined;
  /** The group this field belongs to, or undefined when ungrouped. */
  groupId: string | undefined;
}

export interface FieldGroupView {
  id: string;
  name: string;
  layout: "row" | "stacked";
  /** Members, in the category's own field order. */
  fields: FieldRow[];
}

export interface CategoryEditorView {
  category: CategoryDef;
  /** Every field, in order — regardless of grouping. */
  fields: FieldRow[];
  /** Groups, in the category's group order, each with its members in field order. */
  groups: FieldGroupView[];
  /** Fields in no group, in field order. */
  ungroupedFields: FieldRow[];
  /** Record-kind categories a reference field may point at (this one excluded). */
  referenceTargets: { id: string; name: string }[];
  instanceCount: number;
  /** "node types" | "records" */
  instanceNoun: string;
  constraintCount: number;
}

export function categoryEditorView(
  ruleset: Ruleset,
  categoryId: string,
): CategoryEditorView | null {
  const categories = ruleset.listBuilding?.categories ?? [];
  const category = categories.find((c) => c.id === categoryId);
  if (!category) return null;

  const nameOf = (id: string | undefined) =>
    id ? categories.find((c) => c.id === id)?.name || "Untitled category" : "nothing yet";

  const groupIdByField = new Map<string, string>();
  for (const group of category.fieldGroups) {
    for (const fieldId of group.fieldIds) groupIdByField.set(fieldId, group.id);
  }

  const fields: FieldRow[] = category.fields.map((field) => {
    const isList = field.type === "singleValue" || field.type === "multiValue";
    const isReference = field.type === "reference";
    const optionSource = field.optionSource === "keywordRegistry" ? "keywordRegistry" : "freeform";
    const multiple = field.multiple ?? false;

    let detail = "";
    if (isList) {
      detail =
        optionSource === "keywordRegistry"
          ? "keyword registry"
          : `${field.options.length} allowed value${field.options.length === 1 ? "" : "s"}`;
    } else if (isReference) {
      detail = `${nameOf(field.categoryId)}${multiple ? " · several" : ""}`;
    } else if (field.type === "articleReference" && multiple) {
      detail = "several";
    }

    return {
      id: field.id,
      name: field.name,
      type: field.type,
      typeLabel: FIELD_TYPE_LABELS[field.type],
      detail,
      isList,
      isReference,
      isArticleReference: field.type === "articleReference",
      optionSource,
      options: field.options,
      multiple,
      targetCategoryId: field.categoryId,
      groupId: groupIdByField.get(field.id),
    };
  });

  const groups: FieldGroupView[] = category.fieldGroups.map((group) => ({
    id: group.id,
    name: group.name,
    layout: group.layout,
    fields: fields.filter((row) => row.groupId === group.id),
  }));
  const ungroupedFields = fields.filter((row) => row.groupId === undefined);

  const instanceCount =
    category.kind === "record"
      ? Object.values(ruleset.registry.categoryRecords).filter((r) => r.categoryId === categoryId)
          .length
      : Object.values(ruleset.registry.nodeDefs).filter((n) => n.categoryId === categoryId).length;

  return {
    category,
    fields,
    groups,
    ungroupedFields,
    referenceTargets: categories
      .filter((c) => c.kind === "record" && c.id !== categoryId)
      .map((c) => ({ id: c.id, name: c.name || "Untitled category" })),
    instanceCount,
    instanceNoun: category.kind === "record" ? "records" : "node types",
    constraintCount: category.constraints.length,
  };
}
