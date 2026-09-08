import { describe, expect, it } from "vitest";
import { createRuleset } from "../schema/createRuleset";
import { nodeDef, type NodeDef } from "../schema/listBuilding";
import { LIST_SCHEMA_VERSION, list, type List } from "../schema/list";
import type { Ruleset } from "../schema/ruleset";
import type { SelectionEntry } from "../schema/selection";
import { computeListCost } from "./cost";

function ruleset(nodeDefs: Record<string, NodeDef>): Ruleset {
  const rs = createRuleset();
  return { ...rs, registry: { ...rs.registry, nodeDefs } };
}

function listWith(root: SelectionEntry): List {
  return list.parse({ schemaVersion: LIST_SCHEMA_VERSION, rulesetId: "abcdefghij", root });
}

const squad = nodeDef.parse({
  id: "squad00000",
  baseCosts: { pts: 65 },
  options: [
    {
      id: "flatopt000",
      kind: "toggleFieldValue",
      fieldId: "keywords",
      fieldValue: "Elite",
      direction: "remove",
      cost: { type: "flat", resourceId: "pts", amount: -5 },
    },
    {
      id: "addheavy00",
      kind: "addChild",
      slotId: "models0000",
      addNodeId: "heavywpn00",
      cost: { type: "flat", resourceId: "pts", amount: 5 },
    },
    {
      id: "swapmelta0",
      kind: "replaceChild",
      slotId: "models0000",
      removeNodeId: "trooper000",
      addNodeId: "melta00000",
      cost: { type: "flat", resourceId: "pts", amount: 3 },
    },
  ],
});
const trooper = nodeDef.parse({ id: "trooper000", baseCosts: { pts: 8 } });
const melta = nodeDef.parse({ id: "melta00000", baseCosts: { pts: 8, special: 1 } });
const ammo = nodeDef.parse({ id: "ammo000000", baseCosts: { pts: 2 } });
const heavy = nodeDef.parse({
  id: "heavywpn00",
  baseCosts: { pts: 20 },
  childSlots: [{ id: "ammoslot00", defaults: [{ nodeId: "ammo000000", count: 2 }] }],
});
const nodeDefs = {
  squad00000: squad,
  trooper000: trooper,
  melta00000: melta,
  ammo000000: ammo,
  heavywpn00: heavy,
};

const troopers = (count: number): SelectionEntry => ({
  kind: "group",
  slotId: "models0000",
  defId: "trooper000",
  count,
});
const squadWith = (opts: string[], children: SelectionEntry[]): SelectionEntry => ({
  kind: "instance",
  slotId: "",
  instanceId: "aaaaaaaaaa",
  defId: "squad00000",
  appliedOptions: opts.map((optionId) => ({ optionId })),
  children,
});

describe("computeListCost", () => {
  it("sums baseCosts across a group by count", () => {
    expect(computeListCost(listWith(troopers(4)), ruleset(nodeDefs))).toEqual({ pts: 32 });
  });

  it("keeps multiple resources separate", () => {
    expect(
      computeListCost(
        listWith({ kind: "group", slotId: "models0000", defId: "melta00000", count: 2 }),
        ruleset(nodeDefs),
      ),
    ).toEqual({ pts: 16, special: 2 });
  });

  it("adds a flat option surcharge and applies a negative one as a refund", () => {
    const cost = computeListCost(listWith(squadWith(["flatopt000"], [])), ruleset(nodeDefs));
    expect(cost).toEqual({ pts: 60 }); // 65 - 5
  });

  it("an addChild option counts the added node's baseCosts + its defaulted grandchildren + surcharge", () => {
    const cost = computeListCost(
      listWith(squadWith(["addheavy00"], [troopers(2)])),
      ruleset(nodeDefs),
    );
    // squad 65 + troopers 2*8 + heavy 20 + ammo 2*2 + surcharge 5
    expect(cost).toEqual({ pts: 65 + 16 + 20 + 4 + 5 });
  });

  it("a replaceChild option nets the removed instance out and the added one in", () => {
    const cost = computeListCost(
      listWith(squadWith(["swapmelta0"], [troopers(2)])),
      ruleset(nodeDefs),
    );
    // squad 65 + one trooper 8 (2 -> 1) + melta 8 + surcharge 3 ; special 1 from the melta
    expect(cost).toEqual({ pts: 65 + 8 + 8 + 3, special: 1 });
  });

  it("a targeted replaceChild nets only the targeted split instance", () => {
    const trooperA: SelectionEntry = {
      kind: "instance",
      slotId: "models0000",
      instanceId: "trprAxxxxx",
      defId: "trooper000",
      appliedOptions: [],
      children: [],
    };
    const trooperB: SelectionEntry = { ...trooperA, instanceId: "trprBxxxxx" };
    const root: SelectionEntry = {
      kind: "instance",
      slotId: "",
      instanceId: "aaaaaaaaaa",
      defId: "squad00000",
      appliedOptions: [{ optionId: "swapmelta0", targetInstanceId: "trprAxxxxx" }],
      children: [trooperA, trooperB],
    };
    // squad 65 + trooper B 8 (A swapped) + melta 8 + surcharge 3 ; special 1
    expect(computeListCost(listWith(root), ruleset(nodeDefs))).toEqual({
      pts: 65 + 8 + 8 + 3,
      special: 1,
    });
  });
});

describe("computeListCost — perChild occupancy counts effective children", () => {
  const pmodel = nodeDef.parse({ id: "pmodel0000" });
  const punit = nodeDef.parse({
    id: "punit00000",
    options: [
      { id: "padd000000", kind: "addChild", slotId: "pslot00000", addNodeId: "pmodel0000" },
      {
        id: "pcost00000",
        kind: "toggleFieldValue",
        fieldId: "x",
        fieldValue: "y",
        direction: "add",
        cost: { type: "perChild", resourceId: "pts", amountPerUnit: 10, slotId: "pslot00000" },
      },
    ],
  });
  const reg = ruleset({ punit00000: punit, pmodel0000: pmodel });
  const pmodels = (count: number): SelectionEntry => ({
    kind: "group",
    slotId: "pslot00000",
    defId: "pmodel0000",
    count,
  });
  const unit = (opts: string[]): SelectionEntry => ({
    kind: "instance",
    slotId: "",
    instanceId: "aaaaaaaaaa",
    defId: "punit00000",
    appliedOptions: opts.map((optionId) => ({ optionId })),
    children: [pmodels(2)],
  });

  it("counts the literal children", () => {
    expect(computeListCost(listWith(unit(["pcost00000"])), reg)).toEqual({ pts: 20 });
  });

  it("counts an option-added child in the same slot", () => {
    expect(computeListCost(listWith(unit(["pcost00000", "padd000000"])), reg)).toEqual({ pts: 30 });
  });
});
