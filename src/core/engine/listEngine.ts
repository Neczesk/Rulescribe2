import { shortId } from "../../util/nanoid";
import type { Ruleset } from "../schema/ruleset";
import type { FieldValue } from "../schema/selector";
import {
  expandDefaultsAsGroups,
  type InstanceSelection,
  type SelectionEntry,
  splitOne,
} from "../schema/selection";
import type { List } from "../schema/list";
import { effectiveFields, findFieldDef } from "./resolve";

/**
 * Interactive list construction. Every function is pure — it returns a new
 * `List` with only the touched spine rebuilt and never mutates its input
 * (`structure.ts` precedent). Structural option effects stay derived
 * (`effectiveChildren`); these functions only edit the stored tree.
 *
 * These mutators do not gate on slot `eligibility` or `requires` / `excludes` —
 * `validateList` reports slot / option `min`/`max` and constraint violations
 * after the fact.
 */

const touch = (list: List): List => ({ ...list, updatedAt: new Date().toISOString() });

function findInstance(
  entry: SelectionEntry | undefined,
  instanceId: string,
): InstanceSelection | undefined {
  if (!entry || entry.kind !== "instance") return undefined;
  if (entry.instanceId === instanceId) return entry;
  for (const child of entry.children) {
    const found = findInstance(child, instanceId);
    if (found) return found;
  }
  return undefined;
}

function requireInstance(list: List, instanceId: string): InstanceSelection {
  const found = findInstance(list.root, instanceId);
  if (!found) throw new Error(`No instance "${instanceId}" in list "${list.id}"`);
  return found;
}

/** Rebuild the tree with `fn` applied to the instance `instanceId`. */
function mapInstance(
  entry: SelectionEntry,
  instanceId: string,
  fn: (i: InstanceSelection) => InstanceSelection,
): SelectionEntry {
  if (entry.kind !== "instance") return entry;
  if (entry.instanceId === instanceId) return fn(entry);
  return { ...entry, children: entry.children.map((c) => mapInstance(c, instanceId, fn)) };
}

function withMappedInstance(
  list: List,
  instanceId: string,
  fn: (i: InstanceSelection) => InstanceSelection,
): List {
  if (!list.root) throw new Error(`List "${list.id}" has no root`);
  return touch({ ...list, root: mapInstance(list.root, instanceId, fn) });
}

/** Establish the Army root. Throws if the list already has one. */
export function setRoot(list: List, ruleset: Ruleset, rootDefId: string): List {
  if (list.root) throw new Error(`List "${list.id}" already has a root`);
  const root: InstanceSelection = {
    kind: "instance",
    slotId: "",
    instanceId: shortId(),
    defId: rootDefId,
    children: expandDefaultsAsGroups(rootDefId, ruleset.registry.nodeDefs),
    appliedOptions: [],
  };
  return touch({ ...list, root });
}

/**
 * Add `count` of `defId` to `parentInstanceId`'s `slotId`. Compressed to a
 * `GroupedSelection` unless `defId` declares an `inherited` field — then a
 * single `InstanceSelection` with `fieldValues` copied from the parent's
 * resolved values (the phase-3 `inherited` denormalization hook).
 */
export function addChild(
  list: List,
  ruleset: Ruleset,
  parentInstanceId: string,
  slotId: string,
  defId: string,
  count = 1,
): List {
  const parent = requireInstance(list, parentInstanceId);
  const nodeDefs = ruleset.registry.nodeDefs;
  const childDef = nodeDefs[defId];

  const inheritedIds = childDef
    ? Object.keys(childDef.fields).filter((fid) => findFieldDef(fid, ruleset)?.inherited)
    : [];

  let entry: SelectionEntry;
  if (inheritedIds.length > 0) {
    const parentFields = effectiveFields(parent, nodeDefs, ruleset);
    const fieldValues: Record<string, FieldValue> = {};
    for (const fid of inheritedIds) {
      if (parentFields[fid] !== undefined) fieldValues[fid] = parentFields[fid];
    }
    entry = {
      kind: "instance",
      slotId,
      instanceId: shortId(),
      defId,
      ...(Object.keys(fieldValues).length > 0 ? { fieldValues } : {}),
      children: expandDefaultsAsGroups(defId, nodeDefs),
      appliedOptions: [],
    };
  } else {
    entry = { kind: "group", slotId, defId, count };
  }

  return withMappedInstance(list, parentInstanceId, (p) => ({
    ...p,
    children: [...p.children, entry],
  }));
}

/** Remove the `InstanceSelection` `targetInstanceId` from a parent's children. */
export function removeChild(list: List, parentInstanceId: string, targetInstanceId: string): List {
  const parent = requireInstance(list, parentInstanceId);
  if (!parent.children.some((c) => c.kind === "instance" && c.instanceId === targetInstanceId)) {
    throw new Error(`No child instance "${targetInstanceId}" under "${parentInstanceId}"`);
  }
  return withMappedInstance(list, parentInstanceId, (p) => ({
    ...p,
    children: p.children.filter(
      (c) => !(c.kind === "instance" && c.instanceId === targetInstanceId),
    ),
  }));
}

/**
 * Individuate one member of a default group in `slotId` — wraps
 * `schema/selection.splitOne`. Returns the new list and the peeled instance id.
 */
export function splitOneInSlot(
  list: List,
  ruleset: Ruleset,
  parentInstanceId: string,
  slotId: string,
  defId: string,
): { list: List; instanceId: string } {
  const parent = requireInstance(list, parentInstanceId);
  const group = parent.children.find(
    (c): c is Extract<SelectionEntry, { kind: "group" }> =>
      c.kind === "group" && c.slotId === slotId && c.defId === defId,
  );
  if (!group) throw new Error(`No "${defId}" group in slot "${slotId}" of "${parentInstanceId}"`);

  const [shrunk, peeled] = splitOne(group, ruleset.registry.nodeDefs);
  const next = withMappedInstance(list, parentInstanceId, (p) => ({
    ...p,
    children: p.children.flatMap((c) =>
      c === group ? (shrunk ? [shrunk, peeled] : [peeled]) : [c],
    ),
  }));
  return { list: next, instanceId: peeled.instanceId };
}

/** Record an applied option. Validates it exists and its `max` is not reached. */
export function applyOption(
  list: List,
  ruleset: Ruleset,
  instanceId: string,
  optionId: string,
  targetInstanceId?: string,
): List {
  const instance = requireInstance(list, instanceId);
  const def = ruleset.registry.nodeDefs[instance.defId];
  const opt = def?.options.find((o) => o.id === optionId);
  if (!opt) throw new Error(`Option "${optionId}" is not defined on "${instance.defId}"`);
  const taken = instance.appliedOptions.filter((a) => a.optionId === optionId).length;
  if (opt.max != null && taken >= opt.max) {
    throw new Error(`Option "${optionId}" already taken ${taken}/${opt.max} times`);
  }
  return withMappedInstance(list, instanceId, (i) => ({
    ...i,
    appliedOptions: [
      ...i.appliedOptions,
      { optionId, ...(targetInstanceId ? { targetInstanceId } : {}) },
    ],
  }));
}

/** Remove one matching applied-option entry. */
export function removeOption(
  list: List,
  instanceId: string,
  optionId: string,
  targetInstanceId?: string,
): List {
  requireInstance(list, instanceId);
  return withMappedInstance(list, instanceId, (i) => {
    const idx = i.appliedOptions.findIndex(
      (a) =>
        a.optionId === optionId &&
        (targetInstanceId ? a.targetInstanceId === targetInstanceId : true),
    );
    if (idx === -1) return i;
    return {
      ...i,
      appliedOptions: [...i.appliedOptions.slice(0, idx), ...i.appliedOptions.slice(idx + 1)],
    };
  });
}

/** Set a player-editable field on an instance. Throws for a non-editable field. */
export function setFieldValue(
  list: List,
  ruleset: Ruleset,
  instanceId: string,
  fieldId: string,
  value: FieldValue,
): List {
  requireInstance(list, instanceId);
  const fieldDef = findFieldDef(fieldId, ruleset);
  if (!fieldDef?.editableByPlayer) {
    throw new Error(`Field "${fieldId}" is not editable by the player`);
  }
  return withMappedInstance(list, instanceId, (i) => ({
    ...i,
    fieldValues: { ...(i.fieldValues ?? {}), [fieldId]: value },
  }));
}
