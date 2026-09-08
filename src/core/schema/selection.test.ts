import { describe, expect, it } from "vitest";
import type { NodeDef } from "./listBuilding";
import { nodeDef } from "./listBuilding";
import {
  expandDefaultsAsGroups,
  type GroupedSelection,
  selectionEntry,
  splitOne,
} from "./selection";

const ID_RE = /^[A-Za-z0-9_-]{10}$/;

/** A registry: a Platoon whose two slots default to Rifle / HQ teams. */
function registry(): Record<string, NodeDef> {
  const platoon = nodeDef.parse({
    id: "platoon000",
    childSlots: [
      { id: "teams00000", defaults: [{ nodeId: "rifleteam0", count: 3 }] },
      { id: "hq00000000", defaults: [{ nodeId: "hqteam0000", count: 1 }] },
    ],
  });
  const rifleTeam = nodeDef.parse({
    id: "rifleteam0",
    // its own slot default — must NOT be recursed into by expandDefaultsAsGroups
    childSlots: [{ id: "models0000", defaults: [{ nodeId: "rifleman00", count: 5 }] }],
  });
  return { platoon000: platoon, rifleteam0: rifleTeam };
}

describe("selectionEntry", () => {
  it("parses a group and a minimal instance, slotId defaulting to ''", () => {
    expect(selectionEntry.parse({ kind: "group", defId: "d", count: 3 })).toEqual({
      kind: "group",
      slotId: "",
      defId: "d",
      count: 3,
    });
    const inst = selectionEntry.parse({ kind: "instance", defId: "d" });
    if (inst.kind !== "instance") throw new Error("expected instance");
    expect(inst.instanceId).toMatch(ID_RE);
    expect(inst.slotId).toBe("");
    expect(inst.fieldValues).toBeUndefined();
    expect(inst.children).toEqual([]);
    expect(inst.appliedOptions).toEqual([]);
  });

  it("parses a nested tree with slotId + fieldValues and preserves it", () => {
    const tree = {
      kind: "instance",
      slotId: "",
      instanceId: "aaaaaaaaaa",
      defId: "d",
      fieldValues: { faction: "empire" },
      appliedOptions: [],
      children: [
        {
          kind: "instance",
          slotId: "detach0000",
          instanceId: "bbbbbbbbbb",
          defId: "e",
          appliedOptions: [{ optionId: "opt0000000", targetInstanceId: "cccccccccc" }],
          children: [{ kind: "group", slotId: "units00000", defId: "f", count: 2 }],
        },
      ],
    };
    expect(selectionEntry.parse(tree)).toEqual(tree);
  });

  it("round-trips through JSON", () => {
    const tree = selectionEntry.parse({
      kind: "instance",
      defId: "d",
      fieldValues: { pts: 5 },
      children: [{ kind: "group", slotId: "s", defId: "f", count: 4 }],
    });
    expect(selectionEntry.parse(JSON.parse(JSON.stringify(tree)))).toEqual(tree);
  });

  it("rejects an unknown kind and a group with no count", () => {
    expect(selectionEntry.safeParse({ kind: "squad", defId: "d" }).success).toBe(false);
    expect(selectionEntry.safeParse({ kind: "group", defId: "d" }).success).toBe(false);
  });
});

describe("expandDefaultsAsGroups", () => {
  it("flattens every slot's defaults into groups stamped with the slot id", () => {
    expect(expandDefaultsAsGroups("platoon000", registry())).toEqual([
      { kind: "group", slotId: "teams00000", defId: "rifleteam0", count: 3 },
      { kind: "group", slotId: "hq00000000", defId: "hqteam0000", count: 1 },
    ]);
  });

  it("returns [] for a node with no slot defaults", () => {
    const reg = { bare000000: nodeDef.parse({ id: "bare000000" }) };
    expect(expandDefaultsAsGroups("bare000000", reg)).toEqual([]);
  });

  it("returns [] for an unknown defId", () => {
    expect(expandDefaultsAsGroups("missing000", registry())).toEqual([]);
  });
});

describe("splitOne", () => {
  const grp = (over: Partial<GroupedSelection> = {}): GroupedSelection => ({
    kind: "group",
    slotId: "teams00000",
    defId: "platoon000",
    count: 3,
    ...over,
  });

  it("shrinks the group by one, carries slotId, peels a fully-default instance", () => {
    const reg = registry();
    const [shrunk, peeled] = splitOne(grp(), reg);

    expect(shrunk).toEqual({ kind: "group", slotId: "teams00000", defId: "platoon000", count: 2 });
    expect(peeled.kind).toBe("instance");
    expect(peeled.slotId).toBe("teams00000");
    expect(peeled.instanceId).toMatch(ID_RE);
    expect(peeled.defId).toBe("platoon000");
    expect(peeled.appliedOptions).toEqual([]);
    expect(peeled.children).toEqual(expandDefaultsAsGroups("platoon000", reg));
  });

  it("collapses the group to null when count was 1", () => {
    const [shrunk, peeled] = splitOne(grp({ count: 1 }), registry());
    expect(shrunk).toBeNull();
    expect(peeled.kind).toBe("instance");
  });

  it("does not mutate the input group", () => {
    const group = grp();
    splitOne(group, registry());
    expect(group).toEqual(grp());
  });
});
