import { describe, expect, it } from "vitest";
import { createRuleset } from "../schema/createRuleset";
import { buildStatsContext } from "./context";
import { doc, id, kwRef, makeRuleset, para } from "./fixtures";
import { buildRulesetStats } from "./overview";
import { runConsistencyChecks } from "./runChecks";
import { SEVERITY_ORDER } from "./types";

const COVER = id("cover");
const MELEE = id("melee");

const messy = () =>
  makeRuleset({
    keywords: [
      // No full text (CON-01) and referenced live (REF-09).
      { id: COVER, displayName: "Cover", shortText: doc(para("Harder to hit.")) },
    ],
    articles: [
      {
        id: MELEE,
        title: "Melee",
        text: doc(para("In cover, see ", kwRef(COVER, "text"), ".")),
      },
    ],
  });

describe("runConsistencyChecks", () => {
  it("returns issues most severe first", () => {
    const issues = runConsistencyChecks(buildStatsContext(messy()));
    const order = issues.map((issue) => SEVERITY_ORDER[issue.severity]);
    expect(order).toEqual([...order].sort((a, b) => a - b));
    expect(issues.map((issue) => issue.code)).toEqual(expect.arrayContaining(["REF-09", "CON-01"]));
  });

  it("every issue carries a code, a title and a detail", () => {
    for (const issue of runConsistencyChecks(buildStatsContext(messy()))) {
      expect(issue.code).toMatch(/^[A-Z]{3}-\d{2}$/);
      expect(issue.title.length).toBeGreaterThan(0);
      expect(issue.detail.length).toBeGreaterThan(0);
    }
  });

  it("runs over the ruleset a new user starts with", () => {
    // Not asserting zero issues — the starter ruleset is a stub, and info-level
    // observations about it are correct. It must not throw or report severe.
    const issues = runConsistencyChecks(buildStatsContext(createRuleset("Core Rules")));
    expect(issues.filter((issue) => issue.severity === "severe")).toEqual([]);
  });
});

describe("buildRulesetStats", () => {
  it("counts the ruleset's size and reference mix", () => {
    const stats = buildRulesetStats(buildStatsContext(messy()));

    expect(stats.figures.map((figure) => figure.label)).toEqual([
      "Articles",
      "Words",
      "Keywords",
      "References",
      "List nodes",
    ]);
    // Root + Melee.
    expect(stats.figures[0]!.value).toBe("2");
    expect(stats.figures[3]!.sub).toBe("1 live, 0 links");
    expect(stats.keywordUsage).toEqual([{ name: "Cover", value: 1 }]);
    expect(stats.referenceModes.find((row) => row.name === "Live full text")!.value).toBe(1);
    expect(stats.coverage).toMatchObject({ keywords: 1, keywordsWithFullText: 0 });
  });
});
