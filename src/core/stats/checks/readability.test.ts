import { describe, expect, it } from "vitest";
import { buildStatsContext } from "../context";
import { doc, id, makeRuleset, para, type RulesetSpec } from "../fixtures";
import type { StatsIssue } from "../types";
import { readabilityChecks } from "./readability";

function run(spec: RulesetSpec): StatsIssue[] {
  return readabilityChecks(buildStatsContext(makeRuleset(spec)));
}

const codes = (issues: StatsIssue[]) => issues.map((issue) => issue.code);
const find = (issues: StatsIssue[], code: string) => issues.find((issue) => issue.code === code);

const A = id("a");

/** Dense, polysyllabic, and long — reliably above grade 12. */
const DENSE_SENTENCE =
  "The determination of a successful engagement necessitates the comprehensive " +
  "consideration of numerous simultaneous modifications, notwithstanding the " +
  "aforementioned qualifications enumerated within the preceding subsections, " +
  "which collectively establish the methodology for adjudicating contested " +
  "circumstances arising from incompatible interpretations of the regulations.";

/** Two of those, so the article clears the minimum length to be scored. */
const DENSE = `${DENSE_SENTENCE} ${DENSE_SENTENCE}`;

/** Short words, short sentences — comfortably below it. */
const PLAIN = Array.from({ length: 12 }, () => "Roll a die. Add the score. Hit on a six.").join(
  " ",
);

describe("readability checks", () => {
  it("RDB-01 flags an article above the grade threshold", () => {
    const issues = run({ articles: [{ id: A, title: "Wound Rolls", text: doc(para(DENSE)) }] });
    const issue = find(issues, "RDB-01")!;
    expect(issue.detail).toMatch(/Wound Rolls \d+\.\d/);
    expect(issue.severity).toBe("minor");
  });

  it("skips articles too short to score meaningfully", () => {
    expect(
      codes(
        run({
          articles: [{ id: A, title: "Rally", text: doc(para(DENSE_SENTENCE.slice(0, 90))) }],
        }),
      ),
    ).toEqual([]);
  });

  it("RDB-02 flags a high average sentence length", () => {
    const issues = run({ articles: [{ id: A, title: "Line of Sight", text: doc(para(DENSE)) }] });
    expect(codes(issues)).toContain("RDB-02");
  });

  it("RDB-03 flags a single very long sentence", () => {
    const long = `${"word ".repeat(70).trim()}. ${PLAIN}`;
    const issues = run({ articles: [{ id: A, title: "Scenario 3", text: doc(para(long)) }] });
    expect(find(issues, "RDB-03")!.detail).toContain("Scenario 3");
  });

  it("plain prose produces no readability issues", () => {
    expect(
      codes(run({ articles: [{ id: A, title: "Movement", text: doc(para(PLAIN)) }] })),
    ).toEqual([]);
  });
});
