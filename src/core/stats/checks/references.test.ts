import { describe, expect, it } from "vitest";
import { buildStatsContext, type StatsExtras } from "../context";
import {
  artRef,
  diagramRef,
  doc,
  id,
  imageBlock,
  kwRef,
  makeRuleset,
  para,
  ROOT_ID,
  type RulesetSpec,
} from "../fixtures";
import type { StatsIssue } from "../types";
import { referenceChecks } from "./references";

function run(spec: RulesetSpec, extras: StatsExtras = {}): StatsIssue[] {
  return referenceChecks(buildStatsContext(makeRuleset(spec), extras));
}

const codes = (issues: StatsIssue[]) => issues.map((issue) => issue.code);
const find = (issues: StatsIssue[], code: string) => issues.find((issue) => issue.code === code);

const COVER = id("cover");
const MELEE = id("melee");
const RANGED = id("ranged");

describe("reference checks", () => {
  it("REF-01 flags a keyword name typed as plain text", () => {
    const issues = run({
      keywords: [{ id: COVER, displayName: "Cover" }],
      articles: [
        { id: MELEE, title: "Melee", text: doc(para("A unit in cover is harder to hit.")) },
        { id: RANGED, title: "Ranged", text: doc(para("Cover applies at range too.")) },
      ],
    });

    const issue = find(issues, "REF-01")!;
    expect(issue.title).toBe("2 keyword mentions are not references");
    expect(issue.detail).toContain("Melee and Ranged");
  });

  it("REF-01 ignores mentions that are already references", () => {
    const issues = run({
      keywords: [{ id: COVER, displayName: "Cover" }],
      articles: [{ id: MELEE, title: "Melee", text: doc(para("Applies in ", kwRef(COVER), ".")) }],
    });
    expect(codes(issues)).not.toContain("REF-01");
  });

  it("REF-02/03/04/05 flag references to deleted targets", () => {
    const issues = run({
      articles: [
        {
          id: MELEE,
          title: "Melee",
          text: doc(
            para(kwRef(id("gone"))),
            para(artRef(id("gonetoo"))),
            para(diagramRef(id("nodiag"))),
            para(imageBlock(id("noimg"))),
          ),
        },
      ],
    });
    expect(codes(issues)).toEqual(expect.arrayContaining(["REF-02", "REF-03", "REF-04", "REF-05"]));
    expect(find(issues, "REF-02")!.title).toBe("1 reference points at a deleted keyword");
  });

  it("REF-06 flags an image entry whose bytes are gone", () => {
    const spec: RulesetSpec = {
      images: [{ id: id("img1"), filename: "cover.png" }],
      articles: [{ id: MELEE, title: "Melee", text: doc(para(imageBlock(id("img1")))) }],
    };
    expect(codes(run(spec, { imageBlobIds: new Set() }))).toContain("REF-06");
    expect(codes(run(spec, { imageBlobIds: new Set([id("img1")]) }))).not.toContain("REF-06");
    // Without the extra the check cannot run and must stay silent.
    expect(codes(run(spec))).not.toContain("REF-06");
  });

  it("REF-07 reports a live-embed cycle once, with the chain", () => {
    const issues = run({
      keywords: [
        { id: COVER, displayName: "Cover", text: doc(para(kwRef(id("terrain"), "text"))) },
        { id: id("terrain"), displayName: "Terrain", text: doc(para(kwRef(COVER, "text"))) },
      ],
    });

    const issue = find(issues, "REF-07")!;
    expect(issue.title).toBe("1 circular live reference");
    expect(issue.severity).toBe("severe");
    expect(issue.action.kind).toBe("chain");
  });

  it("REF-07 ignores the same pair when the references are plain links", () => {
    const issues = run({
      keywords: [
        { id: COVER, displayName: "Cover", text: doc(para(kwRef(id("terrain")))) },
        { id: id("terrain"), displayName: "Terrain", text: doc(para(kwRef(COVER))) },
      ],
    });
    expect(codes(issues)).not.toContain("REF-07");
  });

  it("REF-08 flags an entity that live-embeds itself", () => {
    const issues = run({
      keywords: [{ id: COVER, displayName: "Cover", text: doc(para(kwRef(COVER, "text"))) }],
    });
    expect(codes(issues)).toContain("REF-08");
  });

  it("REF-09 flags a Live: Full text reference to a keyword with no full text", () => {
    const issues = run({
      keywords: [{ id: COVER, displayName: "Cover", shortText: doc(para("A summary.")) }],
      articles: [{ id: MELEE, title: "Melee", text: doc(para(kwRef(COVER, "text"))) }],
    });

    const issue = find(issues, "REF-09")!;
    expect(issue.detail).toContain("Live: Full text");
    expect(issue.action).toMatchObject({
      kind: "navigate",
      target: { kind: "keyword", id: COVER },
    });
  });

  it("REF-10 flags a Live: Summary reference to an empty short text", () => {
    const issues = run({
      keywords: [{ id: COVER, displayName: "Cover", text: doc(para("Full text.")) }],
      articles: [{ id: MELEE, title: "Melee", text: doc(para(kwRef(COVER, "shortText"))) }],
    });
    expect(codes(issues)).toContain("REF-10");
  });

  it("REF-11 flags an exported article linking into a notes article", () => {
    const issues = run({
      articles: [
        { id: MELEE, title: "Melee", text: doc(para(artRef(id("scratch")))) },
        { id: id("scratch"), title: "Scratchpad", isNotes: true },
      ],
    });
    expect(find(issues, "REF-11")!.detail).toContain("Melee → Scratchpad");
  });

  it("REF-12 flags a live chain deeper than the threshold", () => {
    const chain = ["a", "b", "c", "d", "e"].map((name) => id(name));
    const issues = run({
      keywords: chain.map((keywordId, index) => ({
        id: keywordId,
        displayName: keywordId,
        text: chain[index + 1] ? doc(para(kwRef(chain[index + 1]!, "text"))) : doc(para("End.")),
      })),
    });
    expect(codes(issues)).toContain("REF-12");
  });

  it("REF-13/REF-14 report unused and single-use keywords", () => {
    const issues = run({
      keywords: [
        { id: COVER, displayName: "Cover", text: doc(para("Text.")) },
        { id: id("stealth"), displayName: "Stealth", text: doc(para("Text.")) },
      ],
      articles: [{ id: RANGED, title: "Ranged", text: doc(para(kwRef(id("stealth")))) }],
    });

    expect(find(issues, "REF-13")!.detail).toContain("Cover");
    expect(find(issues, "REF-14")!.detail).toBe("Stealth appears only in Ranged.");
  });

  it("REF-15/REF-16 report unused diagrams and images", () => {
    const issues = run({
      diagrams: [{ id: id("diag"), kind: "mermaid", name: "Deployment Map" }],
      images: [{ id: id("img1"), filename: "cover.png" }],
    });
    expect(codes(issues)).toEqual(expect.arrayContaining(["REF-15", "REF-16"]));
  });

  it("REF-17 reports articles nothing links to, but never the root", () => {
    const issues = run({
      articles: [
        { id: MELEE, title: "Melee", text: doc(para(artRef(RANGED))) },
        { id: RANGED, title: "Ranged" },
      ],
    });

    const issue = find(issues, "REF-17")!;
    expect(issue.detail).toContain("Melee");
    expect(issue.detail).not.toContain("Ranged");
    expect(issue.detail).not.toContain("Root");
    expect(codes(issues)).not.toContain("STR-01");
  });

  it("a clean ruleset produces no reference issues", () => {
    const issues = run({
      keywords: [{ id: COVER, displayName: "Cover", text: doc(para("Hard to hit.")) }],
      articles: [
        {
          id: MELEE,
          title: "Melee",
          text: doc(para("See ", kwRef(COVER), " and ", artRef(RANGED), ".")),
        },
        {
          id: RANGED,
          title: "Ranged",
          text: doc(para("Shooting rules. ", kwRef(COVER), artRef(MELEE))),
        },
      ],
      structure: {
        articleId: ROOT_ID,
        children: [{ articleId: MELEE }, { articleId: RANGED }],
      },
    });
    expect(codes(issues)).toEqual([]);
  });
});
