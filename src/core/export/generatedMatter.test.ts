import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { listBuilding } from "../schema/listBuilding";
import { article, keyword, metadata, ruleset, type Ruleset } from "../schema/ruleset";
import { listBuildingSummary, termIndex } from "./generatedMatter";

const kwRef = (id: string): JSONContent => ({
  type: "paragraph",
  content: [{ type: "keywordRef", attrs: { keywordId: id } }],
});

function fixture(): Ruleset {
  const root = article.parse({ id: "rootaaaaaa", title: "Root" });
  const combat = article.parse({
    id: "combataaaa",
    title: "Combat",
    text: { type: "doc", content: [kwRef("skillaaaaa"), kwRef("coveraaaaa")] },
  });
  const melee = article.parse({
    id: "meleeaaaaa",
    title: "Melee",
    text: { type: "doc", content: [kwRef("skillaaaaa")] },
  });
  const scratch = article.parse({
    id: "scratchaaa",
    title: "Scratch",
    isNotes: true,
    text: { type: "doc", content: [kwRef("coveraaaaa")] },
  });

  return ruleset.parse({
    schemaVersion: 13,
    metadata: metadata.parse({ title: "Test" }),
    registry: {
      articles: Object.fromEntries([root, combat, melee, scratch].map((a) => [a.id, a])),
      keywords: {
        skillaaaaa: keyword.parse({ id: "skillaaaaa", displayName: "Skill" }),
        coveraaaaa: keyword.parse({ id: "coveraaaaa", displayName: "Cover" }),
        unusedaaaa: keyword.parse({ id: "unusedaaaa", displayName: "Unused" }),
      },
    },
    structure: {
      articleId: root.id,
      children: [
        {
          articleId: combat.id,
          children: [{ articleId: melee.id, children: [] }],
        },
        { articleId: scratch.id, children: [] },
      ],
    },
  });
}

describe("termIndex", () => {
  it("lists used keywords alphabetically with sorted section numbers", () => {
    const index = termIndex(fixture(), ["combataaaa", "meleeaaaaa", "scratchaaa"]);
    expect(index.map((e) => e.label)).toEqual(["Cover", "Skill"]);
    expect(index.find((e) => e.label === "Skill")?.refs.map((r) => r.number)).toEqual(["1", "1.1"]);
  });

  it("omits keywords whose only uses are notes or excluded articles", () => {
    // Cover is referenced only by Combat + the notes article; excluding Combat drops it.
    const index = termIndex(fixture(), ["meleeaaaaa"]);
    expect(index.map((e) => e.label)).toEqual(["Skill"]);
  });
});

describe("listBuildingSummary", () => {
  it("is null when there is nothing to show", () => {
    expect(listBuildingSummary(fixture())).toBeNull();
  });

  it("summarises resources, formats, categories and node types", () => {
    const base = fixture();
    const rs: Ruleset = {
      ...base,
      listBuilding: listBuilding.parse({
        resources: [{ id: "ptsaaaaaaa", name: "Points", cap: { type: "none" } }],
        formats: [{ id: "fmtaaaaaaa", name: "Strike", resourceCaps: { ptsaaaaaaa: 1000 } }],
        categories: [{ id: "unitaaaaaa", name: "Unit", kind: "node", fields: [] }],
      }),
      registry: {
        ...base.registry,
        nodeDefs: {
          troopaaaaa: {
            id: "troopaaaaa",
            name: "Troopers",
            categoryId: "unitaaaaaa",
            fields: {},
            baseCosts: { ptsaaaaaaa: 90 },
            childSlots: [],
            options: [],
            constraints: [],
          },
        },
      },
    };
    const summary = listBuildingSummary(rs);
    expect(summary?.resources).toEqual([{ name: "Points", cap: "—" }]);
    expect(summary?.formats).toEqual([{ name: "Strike", caps: "Points 1000" }]);
    expect(summary?.categories).toEqual([{ name: "Unit", kind: "node", fields: 0, members: 1 }]);
    expect(summary?.nodes).toEqual([{ name: "Troopers", category: "Unit", cost: "Points 90" }]);
  });
});
