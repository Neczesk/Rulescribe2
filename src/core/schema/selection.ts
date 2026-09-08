import * as z from "zod";
import { shortId } from "../../util/nanoid";
import type { NodeDef } from "./listBuilding";
import { fieldValue, type FieldValue } from "./selector";

/**
 * Player instance data. A `NodeDef` is a template; a player's list is a tree of
 * selections against those templates. Selections default to **compressed,
 * identical groups** (`GroupedSelection`) and only gain individual identity
 * (`InstanceSelection`) when a player diverges one member from the default — a
 * ruleset with zero customization never pays for per-instance tracking.
 */

const ID = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

/**
 * Hand-written tagged union — `z.infer` cannot resolve a recursive
 * discriminated union in TS 6.0.3 (see the same note in ./selector.ts). The
 * recursive `children` getter annotates against this; `selectionEntry` stays a
 * real `z.discriminatedUnion` so the engine switches on `.kind`.
 */
export interface AppliedOption {
  optionId: string;
  /** Must reference an `InstanceSelection`, never a group. */
  targetInstanceId?: string;
}

export interface GroupedSelection {
  kind: "group";
  /** The parent `childSlot` this entry fills. Stamped at add-time, never re-derived. */
  slotId: string;
  defId: string;
  /** Identical, untouched copies. */
  count: number;
}

export interface InstanceSelection {
  kind: "instance";
  /** The parent `childSlot` this entry fills; `""` for the single `list.root`. */
  slotId: string;
  /** nanoid — only individuated entries get identity. */
  instanceId: string;
  defId: string;
  /** Player-set or inherited-and-copied field values, layered over `NodeDef.fields`. */
  fieldValues?: Record<string, FieldValue>;
  children: SelectionEntry[];
  appliedOptions: AppliedOption[];
}

export type SelectionEntry = GroupedSelection | InstanceSelection;

export const appliedOption = z.object({
  optionId: z.string(),
  targetInstanceId: z.string().optional(),
});

const groupedSelection = z.object({
  kind: z.literal("group"),
  slotId: z.string().default(""),
  defId: z.string(),
  // No default — a group with an unspecified count is meaningless.
  count: z.number().int().nonnegative(),
});

const instanceSelection = z.object({
  kind: z.literal("instance"),
  slotId: z.string().default(""),
  instanceId: ID.default(shortId),
  defId: z.string(),
  fieldValues: z.record(z.string(), fieldValue).optional(),
  get children(): z.ZodType<SelectionEntry[]> {
    return z.array(selectionEntry).default([]);
  },
  appliedOptions: z.array(appliedOption).default([]),
});

export const selectionEntry: z.ZodType<SelectionEntry> = z.discriminatedUnion("kind", [
  groupedSelection,
  instanceSelection,
]);

// ---------------------------------------------------------------------------
// Structural operations. Both stay purely structural — no recursion into a
// default node's own grandchild defaults, no engine/validation concerns.
// ---------------------------------------------------------------------------

/**
 * A `NodeDef`'s `childSlots[].defaults` flattened into grouped selections. An
 * unknown `defId` (not in `nodeDefs`) yields `[]`; the engine validates
 * references later. Groups are unexpanded placeholders — a default node whose
 * own slots have defaults is *not* recursed into.
 */
export function expandDefaultsAsGroups(
  defId: string,
  nodeDefs: Record<string, NodeDef>,
): SelectionEntry[] {
  const def = nodeDefs[defId];
  if (!def) return [];
  return def.childSlots.flatMap((slot) =>
    slot.defaults.map(
      (d): GroupedSelection => ({
        kind: "group",
        slotId: slot.id,
        defId: d.nodeId,
        count: d.count,
      }),
    ),
  );
}

/**
 * Peel one member off a group: the single operation every per-instance
 * mutation (option application, later per-instance removal) depends on. The
 * peeled instance still starts fully default. Does **not** mutate `group`.
 *
 * Callers replace the group entry in its parent's `children` with the
 * (possibly null) shrunk group plus the peeled instance, then apply the actual
 * change to the instance.
 */
export function splitOne(
  group: GroupedSelection,
  nodeDefs: Record<string, NodeDef>,
): [GroupedSelection | null, InstanceSelection] {
  const remaining = group.count - 1;
  const shrunk: GroupedSelection | null = remaining > 0 ? { ...group, count: remaining } : null;
  const peeled: InstanceSelection = {
    kind: "instance",
    slotId: group.slotId,
    instanceId: shortId(),
    defId: group.defId,
    children: expandDefaultsAsGroups(group.defId, nodeDefs),
    appliedOptions: [],
  };
  return [shrunk, peeled];
}
