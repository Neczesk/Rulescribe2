import { describe, expect, it } from "vitest";
import { createList, LIST_SCHEMA_VERSION, list } from "./list";
import type { InstanceSelection } from "./selection";

const ID_RE = /^[A-Za-z0-9_-]{10}$/;

describe("list", () => {
  it("defaults id, name, resourceCaps and leaves root / optionals undefined", () => {
    const l = list.parse({ schemaVersion: LIST_SCHEMA_VERSION, rulesetId: "abcdefghij" });
    expect(l.id).toMatch(ID_RE);
    expect(l.name).toBe("");
    expect(l.resourceCaps).toEqual({});
    expect(l.root).toBeUndefined();
    expect(l.formatId).toBeUndefined();
    expect(typeof l.createdAt).toBe("string");
  });

  it("rejects a list with no rulesetId", () => {
    expect(list.safeParse({ schemaVersion: LIST_SCHEMA_VERSION }).success).toBe(false);
  });

  it("createList produces a list.parse-valid object with no root", () => {
    const l = createList("abcdefghij", "  My List  ");
    expect(list.safeParse(l).success).toBe(true);
    expect(l.schemaVersion).toBe(LIST_SCHEMA_VERSION);
    expect(l.name).toBe("My List");
    expect(l.root).toBeUndefined();
  });

  it("round-trips through JSON with a populated single root", () => {
    const root: InstanceSelection = {
      kind: "instance",
      slotId: "",
      instanceId: "aaaaaaaaaa",
      defId: "armyroot00",
      children: [{ kind: "group", slotId: "detach0000", defId: "battalion0", count: 1 }],
      appliedOptions: [],
    };
    const original = list.parse({
      schemaVersion: LIST_SCHEMA_VERSION,
      rulesetId: "abcdefghij",
      formatId: "combatpat0",
      resourceCaps: { pts: 500 },
      root,
    });
    expect(list.parse(JSON.parse(JSON.stringify(original)))).toEqual(original);
  });
});
