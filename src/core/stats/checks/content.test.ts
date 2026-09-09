import { describe, expect, it } from "vitest";
import { buildStatsContext } from "../context";
import { doc, id, makeRuleset, para, ROOT_ID, type RulesetSpec } from "../fixtures";
import type { StatsIssue } from "../types";
import { contentChecks } from "./content";

function run(spec: RulesetSpec): StatsIssue[] {
  return contentChecks(buildStatsContext(makeRuleset(spec)));
}

const codes = (issues: StatsIssue[]) => issues.map((issue) => issue.code);
const find = (issues: StatsIssue[], code: string) => issues.find((issue) => issue.code === code);

const CHARGE = id("charge");
const WOUND = id("wound");
const MELEE = id("melee");

describe("content checks", () => {
  it("CON-01 flags a keyword with a short text only", () => {
    const issues = run({
      keywords: [{ id: CHARGE, displayName: "Charge", shortText: doc(para("A move.")) }],
    });
    const issue = find(issues, "CON-01")!;
    expect(issue.severity).toBe("minor");
    expect(issue.action).toMatchObject({ kind: "navigate", target: { kind: "keyword" } });
  });

  it("CON-02 flags a keyword with no text at all, and not CON-01", () => {
    const issues = run({ keywords: [{ id: CHARGE, displayName: "Charge" }] });
    expect(codes(issues)).toContain("CON-02");
    expect(codes(issues)).not.toContain("CON-01");
  });

  it("CON-03 flags an empty leaf article but not an empty parent", () => {
    const issues = run({
      articles: [
        { id: MELEE, title: "Melee" },
        { id: WOUND, title: "Wound", text: doc(para("Text.")) },
      ],
      structure: { articleId: ROOT_ID, children: [{ articleId: MELEE, children: [] }] },
    });
    expect(find(issues, "CON-03")!.detail).toContain("Melee");
  });

  it("CON-04 ignores a blank root title but flags other untitled articles", () => {
    const issues = run({
      articles: [
        { id: ROOT_ID, title: "" },
        { id: MELEE, title: "" },
      ],
    });
    expect(find(issues, "CON-04")!.title).toBe("1 article has no title");
  });

  it("CON-05 flags a keyword with no display name", () => {
    expect(codes(run({ keywords: [{ id: CHARGE, displayName: "" }] }))).toContain("CON-05");
  });

  it("CON-06 groups entities sharing a short text", () => {
    const issues = run({
      keywords: [
        { id: CHARGE, displayName: "Charge", shortText: doc(para("A point of damage.")) },
        { id: WOUND, displayName: "Wound", shortText: doc(para("A point of damage.")) },
      ],
    });
    expect(find(issues, "CON-06")!.detail).toContain("Charge and Wound");
  });

  it("CON-07/CON-08 flag duplicate names", () => {
    const issues = run({
      articles: [
        { id: MELEE, title: "Movement" },
        { id: WOUND, title: "movement" },
      ],
      keywords: [
        { id: id("k1"), displayName: "Charge" },
        { id: id("k2"), displayName: "charge" },
      ],
    });
    expect(codes(issues)).toEqual(expect.arrayContaining(["CON-07", "CON-08"]));
    expect(find(issues, "CON-08")!.severity).toBe("severe");
  });

  it("CON-09 flags a plural near-miss without re-reporting an exact duplicate", () => {
    const issues = run({
      keywords: [
        { id: id("k1"), displayName: "Cover" },
        { id: id("k2"), displayName: "Covers" },
      ],
    });
    expect(codes(issues)).toContain("CON-09");
    expect(codes(issues)).not.toContain("CON-08");
  });

  it("CON-10 flags a summary longer than the body", () => {
    const issues = run({
      keywords: [
        {
          id: CHARGE,
          displayName: "Charge",
          shortText: doc(para("one two three four five six")),
          text: doc(para("one two")),
        },
      ],
    });
    expect(codes(issues)).toContain("CON-10");
  });

  it("CON-11 flags an over-long short text", () => {
    const issues = run({
      keywords: [{ id: CHARGE, displayName: "Charge", shortText: doc(para("x ".repeat(200))) }],
    });
    expect(codes(issues)).toContain("CON-11");
  });

  it("CON-12/CON-13/CON-14 flag draft leftovers", () => {
    const issues = run({
      articles: [
        { id: MELEE, title: "Melee", text: doc(para("TODO: decide the modifier.")) },
        { id: WOUND, title: "Wound", text: doc(para("Lorem ipsum dolor.")), notes: "Ask Ben." },
      ],
    });
    expect(codes(issues)).toEqual(expect.arrayContaining(["CON-12", "CON-13", "CON-14"]));
  });

  it("CON-15 flags missing ruleset metadata", () => {
    expect(find(run({ author: "" }), "CON-15")!.detail).toContain("author");
    expect(codes(run({}))).not.toContain("CON-15");
  });

  it("a complete ruleset produces no content issues", () => {
    const issues = run({
      articles: [{ id: MELEE, title: "Melee", text: doc(para("Melee rules.")) }],
      keywords: [
        {
          id: CHARGE,
          displayName: "Charge",
          shortText: doc(para("A move into contact.")),
          text: doc(para("A charge move ends in base contact.")),
        },
      ],
    });
    expect(codes(issues)).toEqual([]);
  });
});
