import { describe, expect, it } from "vitest";
import { categoryRecord, listBuilding, nodeDef, type NodeDef } from "../schema/listBuilding";
import { createRuleset } from "../schema/createRuleset";
import type { Ruleset } from "../schema/ruleset";
import type { InstanceSelection, SelectionEntry } from "../schema/selection";
import {
  effectiveChildren,
  effectiveFields,
  resolveArticleReference,
  resolveReference,
} from "./resolve";

const g = (defId: string, count: number, slotId = "s"): SelectionEntry => ({
  kind: "group",
  slotId,
  defId,
  count,
});

describe("effectiveFields — layering", () => {
  const nodeDefs: Record<string, NodeDef> = {
    unit000000: nodeDef.parse({
      id: "unit000000",
      fields: { faction: "empire", keywords: ["Infantry"] },
      options: [
        {
          id: "drop000000",
          kind: "toggleFieldValue",
          fieldId: "keywords",
          fieldValue: "Infantry",
          direction: "remove",
        },
      ],
    }),
  };
  const base: InstanceSelection = {
    kind: "instance",
    slotId: "",
    instanceId: "aaaaaaaaaa",
    defId: "unit000000",
    children: [],
    appliedOptions: [],
  };

  it("falls back to NodeDef.fields when nothing overrides", () => {
    expect(effectiveFields(base, nodeDefs)).toEqual({ faction: "empire", keywords: ["Infantry"] });
  });

  it("instance.fieldValues beats NodeDef.fields", () => {
    const withOverride = { ...base, fieldValues: { faction: "bretonnia" } };
    expect(effectiveFields(withOverride, nodeDefs).faction).toBe("bretonnia");
  });

  it("toggleFieldValue is applied on top of fieldValues", () => {
    const withOverride: InstanceSelection = {
      ...base,
      fieldValues: { keywords: ["Infantry", "Elite"] },
      appliedOptions: [{ optionId: "drop000000" }],
    };
    expect(effectiveFields(withOverride, nodeDefs).keywords).toEqual(["Elite"]);
  });
});

describe("effectiveChildren", () => {
  const nodeDefs: Record<string, NodeDef> = {
    unit000000: nodeDef.parse({
      id: "unit000000",
      options: [
        { id: "add0000000", kind: "addChild", slotId: "s", addNodeId: "banner0000" },
        { id: "rm00000000", kind: "removeChild", slotId: "s", removeNodeId: "bolter0000" },
        {
          id: "swap000000",
          kind: "replaceChild",
          slotId: "s",
          removeNodeId: "bolter0000",
          addNodeId: "heavy00000",
        },
      ],
    }),
    bolter0000: nodeDef.parse({ id: "bolter0000" }),
    banner0000: nodeDef.parse({ id: "banner0000" }),
    heavy00000: nodeDef.parse({
      id: "heavy00000",
      childSlots: [{ id: "ammo000000", defaults: [{ nodeId: "shell00000", count: 3 }] }],
    }),
  };
  const unit = (children: SelectionEntry[], optionIds: string[]): InstanceSelection => ({
    kind: "instance",
    slotId: "",
    instanceId: "aaaaaaaaaa",
    defId: "unit000000",
    children,
    appliedOptions: optionIds.map((optionId) => ({ optionId })),
  });

  it("returns the literal children when no structural options are applied", () => {
    const kids = [g("bolter0000", 2)];
    expect(effectiveChildren(unit(kids, []), nodeDefs)).toBe(kids);
  });

  it("addChild appends a synthetic instance with expanded grandchildren", () => {
    const out = effectiveChildren(unit([g("bolter0000", 1)], ["add0000000"]), nodeDefs);
    expect(out).toHaveLength(2);
    const added = out[1];
    expect(added).toMatchObject({ kind: "instance", slotId: "s", defId: "banner0000" });
  });

  it("removeChild decrements a group of >1", () => {
    const out = effectiveChildren(unit([g("bolter0000", 2)], ["rm00000000"]), nodeDefs);
    expect(out).toEqual([g("bolter0000", 1)]);
  });

  it("replaceChild drops the removed def and adds the new one with its defaults", () => {
    const out = effectiveChildren(unit([g("bolter0000", 1)], ["swap000000"]), nodeDefs);
    expect(out.some((c) => c.defId === "bolter0000")).toBe(false);
    const heavy = out.find((c) => c.defId === "heavy00000");
    expect(heavy).toBeDefined();
    if (heavy?.kind === "instance") {
      expect(heavy.children).toEqual([
        { kind: "group", slotId: "ammo000000", defId: "shell00000", count: 3 },
      ]);
    }
  });
});

describe("effectiveFields — type-aware toggleFieldValue", () => {
  const rs: Ruleset = {
    ...createRuleset(),
    listBuilding: listBuilding.parse({
      fields: [
        { id: "elite00000", type: "boolean" },
        { id: "rank000000", type: "singleValue" },
        { id: "keywords00", type: "multiValue" },
      ],
    }),
  };
  const nodeDefs: Record<string, NodeDef> = {
    unit000000: nodeDef.parse({
      id: "unit000000",
      fields: { elite00000: true, rank000000: "trooper", keywords00: ["Infantry"] },
      options: [
        {
          id: "unelite000",
          kind: "toggleFieldValue",
          fieldId: "elite00000",
          fieldValue: "true",
          direction: "remove",
        },
        {
          id: "promote000",
          kind: "toggleFieldValue",
          fieldId: "rank000000",
          fieldValue: "sergeant",
          direction: "add",
        },
        {
          id: "addkw00000",
          kind: "toggleFieldValue",
          fieldId: "keywords00",
          fieldValue: "Elite",
          direction: "add",
        },
      ],
    }),
  };
  const inst = (optionIds: string[]): InstanceSelection => ({
    kind: "instance",
    slotId: "",
    instanceId: "aaaaaaaaaa",
    defId: "unit000000",
    children: [],
    appliedOptions: optionIds.map((optionId) => ({ optionId })),
  });

  it("remove on a scalar (boolean) field clears the key; array behaviour without a ruleset", () => {
    expect(effectiveFields(inst(["unelite000"]), nodeDefs, rs)).not.toHaveProperty("elite00000");
    expect(effectiveFields(inst(["unelite000"]), nodeDefs).elite00000).toEqual([]);
  });

  it("add on a scalar (singleValue) field sets the value; array without a ruleset", () => {
    expect(effectiveFields(inst(["promote000"]), nodeDefs, rs).rank000000).toBe("sergeant");
    expect(effectiveFields(inst(["promote000"]), nodeDefs).rank000000).toEqual([
      "trooper",
      "sergeant",
    ]);
  });

  it("multiValue keeps set-membership behaviour with or without a ruleset", () => {
    expect(effectiveFields(inst(["addkw00000"]), nodeDefs, rs).keywords00).toEqual([
      "Infantry",
      "Elite",
    ]);
    expect(effectiveFields(inst(["addkw00000"]), nodeDefs).keywords00).toEqual([
      "Infantry",
      "Elite",
    ]);
  });
});

describe("resolveReference / resolveArticleReference", () => {
  const record = categoryRecord.parse({ id: "fac0000000", categoryId: "faction000" });
  const base = createRuleset();
  const rs: Ruleset = {
    ...base,
    registry: { ...base.registry, categoryRecords: { fac0000000: record } },
  };

  it("resolves a single id and an array, dropping danglers", () => {
    expect(resolveReference("fac0000000", rs)).toEqual([record]);
    expect(resolveReference(["fac0000000", "missing000"], rs)).toEqual([record]);
    expect(resolveReference(undefined, rs)).toEqual([]);
  });

  it("resolveArticleReference resolves against registry.articles", () => {
    const articleId = Object.keys(base.registry.articles)[0]!;
    expect(resolveArticleReference(articleId, rs).map((a) => a.id)).toEqual([articleId]);
    expect(resolveArticleReference("missing000", rs)).toEqual([]);
  });
});
