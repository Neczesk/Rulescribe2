import { describe, expect, it } from "vitest";
import { article, metadata, ruleset, type Ruleset } from "../schema/ruleset";
import { buildOutline, defaultIncludedIds } from "./outline";

/** A ruleset with root → [core → [turns, notes-scratch], units]. */
function fixture(): Ruleset {
  const root = article.parse({ id: "rootaaaaaa", title: "Age of Iron" });
  const core = article.parse({ id: "coreaaaaaa", title: "Core Rules" });
  const turns = article.parse({
    id: "turnsaaaaa",
    title: "Turn Order",
    text: {
      type: "doc",
      content: [{ type: "paragraph", content: [{ type: "text", text: "one two three four" }] }],
    },
  });
  const scratch = article.parse({ id: "scratchaaa", title: "Scratch", isNotes: true });
  const units = article.parse({ id: "unitsaaaaa", title: "Units" });

  return ruleset.parse({
    schemaVersion: 13,
    metadata: metadata.parse({ title: "Age of Iron" }),
    registry: {
      articles: Object.fromEntries([root, core, turns, scratch, units].map((a) => [a.id, a])),
      keywords: {},
    },
    structure: {
      articleId: root.id,
      children: [
        {
          articleId: core.id,
          children: [
            { articleId: turns.id, children: [] },
            { articleId: scratch.id, children: [] },
          ],
        },
        { articleId: units.id, children: [] },
      ],
    },
  });
}

describe("buildOutline", () => {
  it("flattens the tree in order, skipping notes articles in the numbering", () => {
    const outline = buildOutline(fixture());
    expect(outline.map((s) => [s.title, s.number, s.depth])).toEqual([
      ["Age of Iron", "", 0],
      ["Core Rules", "1", 1],
      ["Turn Order", "1.1", 2],
      ["Scratch", "", 2],
      ["Units", "2", 1],
    ]);
    expect(outline.find((s) => s.title === "Turn Order")?.words).toBe(4);
    expect(outline.find((s) => s.title === "Scratch")?.isNotes).toBe(true);
  });
});

describe("defaultIncludedIds", () => {
  it("drops notes articles for the rulebook, keeps them for the draft", () => {
    const outline = buildOutline(fixture());
    expect(defaultIncludedIds(outline, "rulebook").has("scratchaaa")).toBe(false);
    expect(defaultIncludedIds(outline, "draft").has("scratchaaa")).toBe(true);
  });
});
