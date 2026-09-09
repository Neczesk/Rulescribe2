import { describe, expect, it } from "vitest";
import { buildStatsContext } from "../context";
import { doc, heading, id, makeRuleset, para, ROOT_ID, type RulesetSpec } from "../fixtures";
import type { StatsIssue } from "../types";
import { structureChecks } from "./structure";

function run(spec: RulesetSpec): StatsIssue[] {
  return structureChecks(buildStatsContext(makeRuleset(spec)));
}

const codes = (issues: StatsIssue[]) => issues.map((issue) => issue.code);
const find = (issues: StatsIssue[], code: string) => issues.find((issue) => issue.code === code);

const A = id("a");
const B = id("b");

const body = (words: number) => doc(para("word ".repeat(words).trim()));

describe("structure checks", () => {
  it("STR-01 flags an article the tree cannot reach", () => {
    const issues = run({
      articles: [{ id: A, title: "Stranded", text: body(20) }],
      structure: { articleId: ROOT_ID, children: [] },
    });
    expect(find(issues, "STR-01")!.detail).toContain("Stranded");
  });

  it("STR-02 flags a tree node with no article behind it", () => {
    const issues = run({
      structure: { articleId: ROOT_ID, children: [{ articleId: id("ghost") }] },
    });
    expect(find(issues, "STR-02")!.severity).toBe("severe");
  });

  it("STR-03 flags an article placed twice", () => {
    const issues = run({
      articles: [
        { id: A, title: "Cover", text: body(20) },
        { id: B, title: "Terrain", text: body(20) },
      ],
      structure: {
        articleId: ROOT_ID,
        children: [{ articleId: A }, { articleId: B, children: [{ articleId: A }] }],
      },
    });
    expect(find(issues, "STR-03")!.detail).toContain("Cover");
  });

  it("STR-04 flags a section with exactly one child", () => {
    const issues = run({
      articles: [
        { id: A, title: "Parent", text: body(20) },
        { id: B, title: "Only child", text: body(20) },
      ],
      structure: { articleId: ROOT_ID, children: [{ articleId: A, children: [{ articleId: B }] }] },
    });
    expect(find(issues, "STR-04")!.detail).toContain("Parent");
  });

  it("STR-05 flags nesting past the depth threshold", () => {
    const ids = ["l1", "l2", "l3", "l4", "l5", "l6"].map((name) => id(name));
    const nest = (index: number): { articleId: string; children?: unknown[] } =>
      index >= ids.length
        ? { articleId: ids[ids.length - 1]! }
        : { articleId: ids[index]!, children: [nest(index + 1)] };

    const issues = run({
      articles: ids.map((articleId) => ({ id: articleId, title: articleId, text: body(20) })),
      structure: { articleId: ROOT_ID, children: [nest(0)] } as RulesetSpec["structure"],
    });
    expect(codes(issues)).toContain("STR-05");
  });

  it("STR-06 flags a long article with no headings, and spares one with them", () => {
    const long = run({ articles: [{ id: A, title: "Wound Rolls", text: body(1600) }] });
    expect(codes(long)).toContain("STR-06");

    const sectioned = run({
      articles: [
        { id: A, title: "Wound Rolls", text: doc(heading("Part"), para("word ".repeat(1600))) },
      ],
    });
    expect(codes(sectioned)).not.toContain("STR-06");
  });

  it("STR-07 flags a very short leaf", () => {
    const issues = run({
      articles: [{ id: A, title: "Rally", text: doc(para("Nine words is not much of a rule.")) }],
    });
    expect(find(issues, "STR-07")!.detail).toContain("Rally");
  });

  it("STR-08 flags a notes article between two exported ones", () => {
    const issues = run({
      articles: [
        { id: A, title: "One", text: body(20) },
        { id: id("notes"), title: "Scratch", isNotes: true, text: body(20) },
        { id: B, title: "Two", text: body(20) },
      ],
    });
    expect(find(issues, "STR-08")!.detail).toContain("Scratch");
  });

  it("a tidy tree produces no structure issues", () => {
    const issues = run({
      articles: [
        { id: A, title: "One", text: body(40) },
        { id: B, title: "Two", text: body(40) },
      ],
    });
    expect(codes(issues)).toEqual([]);
  });
});
