import { describe, expect, it } from "vitest";
import { formatDef, resourceDef, type FormatDef, type ResourceDef } from "../schema/listBuilding";
import { generatedResourceConstraint, syncResourceConstraints } from "./resourceConstraints";

const pts = resourceDef.parse({ id: "pts0000000", name: "Points", cap: { type: "playerChosen" } });
const cp = resourceDef.parse({
  id: "cp00000000",
  name: "Command",
  cap: { type: "fixed", value: 12 },
});

const emptyFormat = (): FormatDef => formatDef.parse({ id: "combatpat0", name: "Combat Patrol" });
const generatedIds = (f: FormatDef): string[] =>
  f.constraints.flatMap((c) => (c.generatedFor ? [c.generatedFor.resourceId] : []));

describe("generatedResourceConstraint", () => {
  it("is a limit on total spend bounded by the resource's own dynamic cap", () => {
    const c = generatedResourceConstraint("pts0000000");
    expect(c).toMatchObject({
      kind: "limit",
      severity: "error",
      generatedFor: { resourceId: "pts0000000" },
      metric: { op: "costSum", selector: { type: "all" }, resourceId: "pts0000000" },
      max: { op: "resourceLimit", resourceId: "pts0000000" },
    });
  });

  it("parses as a real ConstraintDef", () => {
    const f = formatDef.parse({
      id: "combatpat0",
      constraints: [generatedResourceConstraint("pts0000000")],
    });
    expect(f.constraints).toHaveLength(1);
  });
});

describe("syncResourceConstraints", () => {
  it("generates one constraint per declared resource", () => {
    const synced = syncResourceConstraints(emptyFormat(), [pts, cp]);
    expect(generatedIds(synced).sort()).toEqual(["cp00000000", "pts0000000"]);
  });

  it("is idempotent — a second pass adds nothing and returns the same reference", () => {
    const once = syncResourceConstraints(emptyFormat(), [pts, cp]);
    const twice = syncResourceConstraints(once, [pts, cp]);
    expect(twice).toBe(once);
  });

  it("preserves an author's edit to a generated constraint", () => {
    const once = syncResourceConstraints(emptyFormat(), [pts]);
    const edited: FormatDef = {
      ...once,
      constraints: once.constraints.map((c) =>
        c.generatedFor ? { ...c, severity: "warning" as const } : c,
      ),
    };
    const synced = syncResourceConstraints(edited, [pts]);
    expect(synced.constraints[0]?.severity).toBe("warning");
    expect(generatedIds(synced)).toEqual(["pts0000000"]);
  });

  it("drops a generated constraint whose resource no longer exists", () => {
    const both = syncResourceConstraints(emptyFormat(), [pts, cp]);
    const synced = syncResourceConstraints(both, [pts]);
    expect(generatedIds(synced)).toEqual(["pts0000000"]);
  });

  it("never touches hand-written constraints", () => {
    const authored = formatDef.parse({
      id: "combatpat0",
      constraints: [
        {
          id: "c000000001",
          kind: "limit",
          metric: { op: "count", selector: { type: "all" } },
          max: { op: "constant", value: 10 },
        },
      ],
    });
    const synced = syncResourceConstraints(authored, [pts]);
    expect(synced.constraints).toHaveLength(2);
    expect(synced.constraints[0]?.id).toBe("c000000001");
    expect(synced.constraints[0]?.generatedFor).toBeUndefined();
  });

  it("with no resources declared, drops every generated constraint", () => {
    const once = syncResourceConstraints(emptyFormat(), [pts]);
    const emptied: ResourceDef[] = [];
    expect(syncResourceConstraints(once, emptied).constraints).toEqual([]);
  });
});
