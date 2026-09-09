import { describe, expect, it } from "vitest";
import { BLOCKING_SEVERITY, blockingIssues } from "./blocking";
import { buildStatsContext } from "./context";
import { doc, id, makeRuleset, para } from "./fixtures";
import { runConsistencyChecks } from "./runChecks";

describe("blockingIssues", () => {
  it("keeps only issues at the catalogue's blocking severity", () => {
    const issues = [
      {
        code: "A",
        area: "content" as const,
        severity: "severe" as const,
        title: "",
        detail: "",
        action: { kind: "none" as const },
      },
      {
        code: "B",
        area: "content" as const,
        severity: "minor" as const,
        title: "",
        detail: "",
        action: { kind: "none" as const },
      },
      {
        code: "C",
        area: "content" as const,
        severity: "info" as const,
        title: "",
        detail: "",
        action: { kind: "none" as const },
      },
    ];
    expect(blockingIssues(issues).map((issue) => issue.code)).toEqual(["A"]);
    expect(BLOCKING_SEVERITY).toBe("severe");
  });

  it("blocks on a real severe issue and lets minor/info ones through", () => {
    // A keyword reference pointing at a deleted keyword is REF-02, severe.
    const A = id("a");
    const ruleset = makeRuleset({
      articles: [
        {
          id: A,
          title: "Melee",
          text: doc(
            para({ type: "keywordRef", attrs: { keywordId: id("gone"), display: "link" } }),
          ),
        },
      ],
    });
    const issues = runConsistencyChecks(buildStatsContext(ruleset));
    expect(blockingIssues(issues).map((issue) => issue.code)).toContain("REF-02");
  });

  it("a clean ruleset has nothing to block on", () => {
    const issues = runConsistencyChecks(buildStatsContext(makeRuleset()));
    expect(blockingIssues(issues)).toEqual([]);
  });
});
