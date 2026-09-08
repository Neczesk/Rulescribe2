import { describe, expect, it } from "vitest";
import { createRuleset } from "../schema/createRuleset";
import { createList } from "../schema/list";
import { listBuilding, nodeDef } from "../schema/listBuilding";
import type { Ruleset } from "../schema/ruleset";
import { addChild, setRoot } from "./listEngine";
import { computeListCost } from "./cost";
import { syncResourceConstraints } from "./resourceConstraints";
import { validateList } from "./validate";

const PTS = "pts0000000";
const ALL = { type: "all" } as const;

function build(): Ruleset {
  const rs = createRuleset();
  const lb = listBuilding.parse({
    resources: [{ id: PTS, name: "Points", cap: { type: "playerChosen" } }],
    formats: [{ id: "tourney000", name: "Tournament", resourceCaps: { [PTS]: 2000 } }],
  });
  return {
    ...rs,
    registry: {
      ...rs.registry,
      nodeDefs: {
        armyroot00: nodeDef.parse({
          id: "armyroot00",
          name: "Army",
          childSlots: [{ id: "models0000", name: "Models", min: 3 }],
          constraints: [
            {
              id: "c000000001",
              kind: "limit",
              metric: {
                op: "percentOf",
                part: {
                  op: "costSum",
                  selector: { type: "nodeCategory", categoryId: "char000000" },
                  resourceId: PTS,
                },
                whole: { op: "costSum", selector: ALL, resourceId: PTS },
              },
              max: { op: "constant", value: 25 },
            },
          ],
        }),
        hero000000: nodeDef.parse({
          id: "hero000000",
          categoryId: "char000000",
          baseCosts: { [PTS]: 200 },
        }),
        trooper000: nodeDef.parse({ id: "trooper000", baseCosts: { [PTS]: 100 } }),
      },
    },
    listBuilding: {
      ...lb,
      formats: lb.formats.map((f) => syncResourceConstraints(f, lb.resources)),
    },
  };
}

describe("end-to-end: engine mutations into the constraint algebra", () => {
  const rs = build();

  it("builds a list, then reports slot, percentage and cap violations together", () => {
    const empty = { ...createList(rs.metadata.id, "Test"), formatId: "tourney000" };
    const rooted = setRoot(empty, rs, "armyroot00");
    const rootId = rooted.root?.kind === "instance" ? rooted.root.instanceId : "";

    // 2 models only -> the slot's min of 3 is unmet.
    const thin = addChild(rooted, rs, rootId, "models0000", "trooper000", 2);
    expect(validateList(thin, rs).errors.map((e) => e.code)).toEqual(["slot-below-min"]);

    // 1 hero (200) + 7 troopers (700) = 900; characters are 22% -> clean.
    const ok = addChild(
      addChild(rooted, rs, rootId, "models0000", "trooper000", 7),
      rs,
      rootId,
      "models0000",
      "hero000000",
      1,
    );
    expect(computeListCost(ok, rs)).toEqual({ [PTS]: 900 });
    expect(validateList(ok, rs)).toEqual({ errors: [], warnings: [] });

    // 2 heroes (400) + 4 troopers (400) = 800; characters are 50% -> flagged.
    const heavy = addChild(
      addChild(rooted, rs, rootId, "models0000", "trooper000", 4),
      rs,
      rootId,
      "models0000",
      "hero000000",
      2,
    );
    const heavyResult = validateList(heavy, rs);
    expect(heavyResult.errors.map((e) => e.code)).toEqual(["limit-above-max"]);
    expect(heavyResult.errors[0]?.values).toEqual({ metric: 50, max: 25 });

    // 25 troopers = 2500 -> over the format's 2000 cap, via the generated constraint.
    const overspent = addChild(rooted, rs, rootId, "models0000", "trooper000", 25);
    expect(validateList(overspent, rs).errors.map((e) => e.code)).toEqual(["resource-over-cap"]);

    // The input list is never mutated.
    expect(rooted.root?.kind === "instance" ? rooted.root.children : null).toEqual([]);
  });
});
