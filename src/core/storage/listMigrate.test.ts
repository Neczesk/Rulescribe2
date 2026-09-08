import { describe, expect, it } from "vitest";
import { LIST_SCHEMA_VERSION, list } from "../schema/list";
import { migrateList } from "./listMigrate";

const entry = {
  kind: "instance" as const,
  slotId: "",
  instanceId: "aaaaaaaaaa",
  defId: "armyroot00",
  children: [],
  appliedOptions: [],
};

describe("migrateList", () => {
  it("collapses roots[0] -> root and stamps the version", () => {
    const migrated = migrateList({
      schemaVersion: 1,
      id: "listaaaaaa",
      rulesetId: "rulesaaaaa",
      detachmentTypeId: "dt00000000",
      roots: [entry],
    }) as Record<string, unknown>;
    expect(migrated.schemaVersion).toBe(LIST_SCHEMA_VERSION);
    expect(migrated.root).toEqual(entry);
    expect(migrated).not.toHaveProperty("roots");
  });

  it("produces a blob list.parse accepts (detachmentTypeId dropped)", () => {
    const parsed = list.parse(
      migrateList({ schemaVersion: 1, id: "listaaaaaa", rulesetId: "rulesaaaaa", roots: [entry] }),
    );
    expect(parsed.schemaVersion).toBe(LIST_SCHEMA_VERSION);
    expect(parsed.root).toEqual(entry);
    expect(parsed).not.toHaveProperty("detachmentTypeId");
  });

  it("leaves root unset for an empty roots array", () => {
    const migrated = migrateList({
      schemaVersion: 1,
      id: "l",
      rulesetId: "r",
      roots: [],
    }) as Record<string, unknown>;
    expect(migrated).not.toHaveProperty("root");
    expect(migrated).not.toHaveProperty("roots");
  });

  it("leaves an already-current blob untouched", () => {
    const current = { schemaVersion: LIST_SCHEMA_VERSION, id: "l", rulesetId: "r" };
    expect(migrateList(current)).toBe(current);
  });
});
