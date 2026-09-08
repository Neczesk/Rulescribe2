import { describe, expect, it } from "vitest";
import { createRuleset } from "../schema/createRuleset";
import { listBuilding, nodeDef, type NodeDef } from "../schema/listBuilding";
import { createList } from "../schema/list";
import type { Ruleset } from "../schema/ruleset";
import {
  addChild,
  applyOption,
  removeChild,
  removeOption,
  setFieldValue,
  setRoot,
  splitOneInSlot,
} from "./listEngine";

const nodeDefs: Record<string, NodeDef> = {
  armyroot00: nodeDef.parse({
    id: "armyroot00",
    fields: { faction000: "empire" },
    childSlots: [{ id: "detach0000" }],
    options: [
      { id: "opt0000000", kind: "addChild", slotId: "detach0000", addNodeId: "somedet000", max: 1 },
    ],
  }),
  allieddet0: nodeDef.parse({ id: "allieddet0", fields: { faction000: "" } }),
  plaindet00: nodeDef.parse({ id: "plaindet00" }),
};

const rs: Ruleset = {
  ...createRuleset(),
  registry: { ...createRuleset().registry, nodeDefs },
  listBuilding: listBuilding.parse({
    fields: [
      { id: "faction000", name: "Faction", type: "text", inherited: true },
      { id: "nick000000", name: "Nickname", type: "text", editableByPlayer: true },
    ],
  }),
};

const rooted = () => setRoot(createList("rulesaaaaa"), rs, "armyroot00");
const rootId = (l: ReturnType<typeof rooted>) => {
  if (l.root?.kind !== "instance") throw new Error("no root");
  return l.root.instanceId;
};

describe("setRoot", () => {
  it("establishes an Army instance with expanded defaults and slotId ''", () => {
    const l = rooted();
    expect(l.root).toMatchObject({ kind: "instance", slotId: "", defId: "armyroot00" });
  });

  it("throws if a root already exists", () => {
    expect(() => setRoot(rooted(), rs, "armyroot00")).toThrow();
  });
});

describe("addChild", () => {
  it("appends a compressed group for a plain def", () => {
    const l = rooted();
    const next = addChild(l, rs, rootId(l), "detach0000", "plaindet00", 3);
    expect(next.root).toMatchObject({
      children: [{ kind: "group", slotId: "detach0000", defId: "plaindet00", count: 3 }],
    });
  });

  it("appends an instance with inherited fieldValues copied from the parent", () => {
    const l = rooted();
    const next = addChild(l, rs, rootId(l), "detach0000", "allieddet0");
    const child = next.root?.kind === "instance" ? next.root.children[0] : undefined;
    expect(child).toMatchObject({
      kind: "instance",
      defId: "allieddet0",
      fieldValues: { faction000: "empire" },
    });
  });

  it("does not mutate the input list", () => {
    const l = rooted();
    const before = JSON.stringify(l);
    addChild(l, rs, rootId(l), "detach0000", "plaindet00");
    expect(JSON.stringify(l)).toBe(before);
  });
});

describe("removeChild / splitOneInSlot", () => {
  it("splitOneInSlot peels one and removeChild drops it", () => {
    let l = rooted();
    l = addChild(l, rs, rootId(l), "detach0000", "plaindet00", 2);
    const split = splitOneInSlot(l, rs, rootId(l), "detach0000", "plaindet00");
    const kids = split.list.root?.kind === "instance" ? split.list.root.children : [];
    expect(kids).toEqual([
      { kind: "group", slotId: "detach0000", defId: "plaindet00", count: 1 },
      expect.objectContaining({ kind: "instance", instanceId: split.instanceId }),
    ]);

    const removed = removeChild(split.list, rootId(split.list), split.instanceId);
    const after = removed.root?.kind === "instance" ? removed.root.children : [];
    expect(after).toEqual([{ kind: "group", slotId: "detach0000", defId: "plaindet00", count: 1 }]);
  });

  it("removeChild throws for an unknown target", () => {
    const l = rooted();
    expect(() => removeChild(l, rootId(l), "zzzzzzzzzz")).toThrow();
  });
});

describe("applyOption / removeOption", () => {
  it("records an applied option and rejects going past max", () => {
    const l = rooted();
    const once = applyOption(l, rs, rootId(l), "opt0000000");
    expect(once.root?.kind === "instance" && once.root.appliedOptions).toEqual([
      { optionId: "opt0000000" },
    ]);
    expect(() => applyOption(once, rs, rootId(once), "opt0000000")).toThrow();
  });

  it("throws for an option not on the NodeDef", () => {
    const l = rooted();
    expect(() => applyOption(l, rs, rootId(l), "nope000000")).toThrow();
  });

  it("removeOption removes one matching entry", () => {
    const l = rooted();
    const applied = applyOption(l, rs, rootId(l), "opt0000000");
    const cleared = removeOption(applied, rootId(applied), "opt0000000");
    expect(cleared.root?.kind === "instance" && cleared.root.appliedOptions).toEqual([]);
  });
});

describe("setFieldValue", () => {
  it("sets a player-editable field", () => {
    const l = rooted();
    const next = setFieldValue(l, rs, rootId(l), "nick000000", "The Reikland Guard");
    expect(next.root?.kind === "instance" && next.root.fieldValues).toEqual({
      nick000000: "The Reikland Guard",
    });
  });

  it("throws for a field that is not editableByPlayer", () => {
    const l = rooted();
    expect(() => setFieldValue(l, rs, rootId(l), "faction000", "bretonnia")).toThrow();
  });
});
