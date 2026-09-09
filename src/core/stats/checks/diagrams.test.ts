import { describe, expect, it } from "vitest";
import { buildStatsContext, type StatsExtras } from "../context";
import { doc, id, link, makeRuleset, para, type RulesetSpec } from "../fixtures";
import type { StatsIssue } from "../types";
import { diagramChecks } from "./diagrams";
import { exportChecks } from "./exportHygiene";

const DIAG = id("diag");
const A = id("a");

function diagrams(spec: RulesetSpec, extras: StatsExtras = {}): StatsIssue[] {
  return diagramChecks(buildStatsContext(makeRuleset(spec), extras));
}
function exports_(spec: RulesetSpec): StatsIssue[] {
  return exportChecks(buildStatsContext(makeRuleset(spec)));
}

const codes = (issues: StatsIssue[]) => issues.map((issue) => issue.code);
const find = (issues: StatsIssue[], code: string) => issues.find((issue) => issue.code === code);

describe("diagram checks", () => {
  it("DIA-01 reports a mermaid parse failure supplied by the caller", () => {
    const spec: RulesetSpec = {
      diagrams: [{ id: DIAG, kind: "mermaid", name: "Deployment Flow" }],
    };
    const extras = { mermaidErrors: new Map([[DIAG, "Parse error on line 2"]]) };

    expect(find(diagrams(spec, extras), "DIA-01")!.detail).toContain("Deployment Flow");
    // Without a parse pass the check stays silent rather than guessing.
    expect(codes(diagrams(spec))).not.toContain("DIA-01");
  });

  it("DIA-02 flags empty diagrams, including untouched starter source", () => {
    const issues = diagrams({
      diagrams: [
        { id: DIAG, kind: "mermaid", name: "Starter", source: "graph TD;\nA-->B;" },
        { id: id("d2"), kind: "excalidraw", name: "Blank", elements: [] },
      ],
    });
    expect(find(issues, "DIA-02")!.title).toBe("2 diagrams are empty");
  });

  it("DIA-03 flags an unnamed diagram", () => {
    expect(codes(diagrams({ diagrams: [{ id: DIAG, kind: "mermaid", name: "" }] }))).toContain(
      "DIA-03",
    );
  });

  it("a healthy diagram produces nothing", () => {
    expect(codes(diagrams({ diagrams: [{ id: DIAG, kind: "mermaid", name: "Flow" }] }))).toEqual(
      [],
    );
  });
});

describe("export checks", () => {
  it("EXP-01 flags an external link", () => {
    const issues = exports_({
      articles: [{ id: A, title: "Scenario 3", text: doc(para(link("errata", "https://x.test"))) }],
    });
    expect(find(issues, "EXP-01")!.detail).toContain("Scenario 3");
  });

  it("EXP-02/EXP-03 flag oversized and under-described images", () => {
    const issues = exports_({
      images: [
        { id: id("img1"), filename: "cover.png", width: 4200, height: 3100 },
        { id: id("img2"), filename: "", mimeType: "" },
      ],
    });
    expect(codes(issues)).toEqual(expect.arrayContaining(["EXP-02", "EXP-03"]));
  });

  it("a self-contained ruleset produces no export issues", () => {
    expect(codes(exports_({ images: [{ id: id("img1") }] }))).toEqual([]);
  });
});
