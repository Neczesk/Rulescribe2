import type { CategoryRecord, FieldDef, NodeDef } from "../schema/listBuilding";
import type { Article, Ruleset } from "../schema/ruleset";
import type { FieldValue } from "../schema/selector";
import {
  expandDefaultsAsGroups,
  type InstanceSelection,
  type SelectionEntry,
} from "../schema/selection";
import { assertNever } from "./assertNever";

/** Look up a `NodeDef` by id; `undefined` when the reference is dangling. */
export function nodeDefById(defId: string, nodeDefs: Record<string, NodeDef>): NodeDef | undefined {
  return nodeDefs[defId];
}

/** Find a `FieldDef` by id across `listBuilding.fields` and every category's fields. */
export function findFieldDef(fieldId: string, ruleset: Ruleset): FieldDef | undefined {
  const lb = ruleset.listBuilding;
  if (!lb) return undefined;
  return (
    lb.fields.find((f) => f.id === fieldId) ??
    lb.categories.flatMap((c) => c.fields).find((f) => f.id === fieldId)
  );
}

/**
 * An instance's field values, layered **`NodeDef.fields` < `instance.fieldValues`
 * < `toggleFieldValue` options**.
 *
 * `toggleFieldValue` is set membership by default — `add`/`remove` a member of a
 * `string[]` field. Pass `ruleset` to make it **type-aware**: a `multiValue`
 * field (or one with no resolvable `FieldDef`) keeps the set-membership
 * behaviour; a scalar field (`singleValue` / `boolean` / `number` / `text`) is
 * set to the value on `add` and cleared on `remove`.
 */
export function effectiveFields(
  instance: InstanceSelection,
  nodeDefs: Record<string, NodeDef>,
  ruleset?: Ruleset,
): Record<string, FieldValue> {
  const def = nodeDefs[instance.defId];
  if (!def) return { ...(instance.fieldValues ?? {}) };

  const fields: Record<string, FieldValue> = { ...def.fields, ...(instance.fieldValues ?? {}) };

  for (const applied of instance.appliedOptions) {
    const opt = def.options.find((o) => o.id === applied.optionId);
    if (!opt || opt.kind !== "toggleFieldValue" || typeof opt.fieldValue !== "string") continue;

    const type = ruleset ? findFieldDef(opt.fieldId, ruleset)?.type : undefined;
    const scalar = type != null && type !== "multiValue";

    if (scalar) {
      if (opt.direction === "add") fields[opt.fieldId] = opt.fieldValue;
      else delete fields[opt.fieldId];
      continue;
    }

    const current = fields[opt.fieldId];
    const members = Array.isArray(current) ? current : current == null ? [] : [String(current)];
    const without = members.filter((v) => v !== opt.fieldValue);
    fields[opt.fieldId] = opt.direction === "add" ? [...without, opt.fieldValue] : without;
  }

  return fields;
}

/** A `reference` / `articleReference` field value (`string` id or `string[]`) as an id list. */
function idList(value: FieldValue | undefined): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.filter((v) => typeof v === "string");
  return typeof value === "string" ? [value] : [];
}

/** Resolve a `reference` field value to the `CategoryRecord`(s) it points at, dropping danglers. */
export function resolveReference(
  value: FieldValue | undefined,
  ruleset: Ruleset,
): CategoryRecord[] {
  const records = ruleset.registry.categoryRecords;
  return idList(value)
    .map((id) => records[id])
    .filter((r): r is CategoryRecord => r !== undefined);
}

/**
 * Resolve an `articleReference` field value to the `Article`(s) it points at.
 * Display-only — no engine evaluation depends on this.
 */
export function resolveArticleReference(
  value: FieldValue | undefined,
  ruleset: Ruleset,
): Article[] {
  const articles = ruleset.registry.articles;
  return idList(value)
    .map((id) => articles[id])
    .filter((a): a is Article => a !== undefined);
}

/**
 * The children of `instance` with its **structural** applied-options folded in —
 * `addChild` appends, `removeChild` drops, `replaceChild` does both. Both
 * `cost.ts` and `evaluateSelector` walk this instead of the literal
 * `instance.children`, so swapped / option-added units are costed and counted.
 *
 * Option-added children are synthesized as `InstanceSelection`s (so their own
 * `baseCosts` and defaulted grandchildren are walked); their `instanceId` is a
 * deterministic, deliberately non-`ID`-shaped string — this tree is never
 * persisted.
 */
export function effectiveChildren(
  instance: InstanceSelection,
  nodeDefs: Record<string, NodeDef>,
): SelectionEntry[] {
  const def = nodeDefs[instance.defId];
  if (!def || instance.appliedOptions.length === 0) return instance.children;

  let children: SelectionEntry[] = [...instance.children];
  const addCounts = new Map<string, number>();
  const nextIndex = (optionId: string): number => {
    const i = addCounts.get(optionId) ?? 0;
    addCounts.set(optionId, i + 1);
    return i;
  };

  for (const applied of instance.appliedOptions) {
    const opt = def.options.find((o) => o.id === applied.optionId);
    if (!opt) continue;
    switch (opt.kind) {
      case "toggleFieldValue":
        break;
      case "addChild":
        children = [
          ...children,
          synthChild(instance, opt.id, opt.slotId, opt.addNodeId, nextIndex(opt.id), nodeDefs),
        ];
        break;
      case "removeChild":
        children = removeOne(children, opt.slotId, opt.removeNodeId, applied.targetInstanceId);
        break;
      case "replaceChild":
        children = removeOne(children, opt.slotId, opt.removeNodeId, applied.targetInstanceId);
        children = [
          ...children,
          synthChild(instance, opt.id, opt.slotId, opt.addNodeId, nextIndex(opt.id), nodeDefs),
        ];
        break;
      default:
        return assertNever(opt);
    }
  }
  return children;
}

function synthChild(
  parent: InstanceSelection,
  optionId: string,
  slotId: string,
  defId: string,
  index: number,
  nodeDefs: Record<string, NodeDef>,
): InstanceSelection {
  return {
    kind: "instance",
    slotId,
    instanceId: `${parent.instanceId}:${optionId}:${index}`,
    defId,
    children: expandDefaultsAsGroups(defId, nodeDefs),
    appliedOptions: [],
  };
}

/** Remove one occupant of `slotId` — a specific instance, or one matching `defId`. */
function removeOne(
  children: SelectionEntry[],
  slotId: string,
  defId: string,
  targetInstanceId: string | undefined,
): SelectionEntry[] {
  const idx = children.findIndex(
    (c) =>
      c.slotId === slotId &&
      (targetInstanceId
        ? c.kind === "instance" && c.instanceId === targetInstanceId
        : c.defId === defId),
  );
  if (idx === -1) return children;
  const entry = children[idx];
  if (entry.kind === "group" && entry.count > 1) {
    const next = [...children];
    next[idx] = { ...entry, count: entry.count - 1 };
    return next;
  }
  return [...children.slice(0, idx), ...children.slice(idx + 1)];
}
