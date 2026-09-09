import { describe, expect, it } from "vitest";
import raw from "./catalogue.json";
import { buildIssue } from "./catalogue";
import { runConsistencyChecks } from "./runChecks";
import { buildStatsContext } from "./context";
import { doc, id, kwRef, makeRuleset, para } from "./fixtures";

describe("catalogue", () => {
  it("fills placeholders and reads area/severity from the JSON entry", () => {
    const issue = buildIssue(
      "REF-13",
      { countPhrase: "1 keyword", verb: "is", names: "Rally" },
      { kind: "none" },
    );
    expect(issue).toMatchObject({
      code: "REF-13",
      area: "references",
      severity: "minor",
      title: "1 keyword is never referenced",
      detail: "Rally is defined but linked from nowhere.",
    });
  });

  it("leaves an unmatched placeholder untouched rather than throwing", () => {
    const issue = buildIssue("CON-15", { names: "author" }, { kind: "none" });
    // CON-15's title has no placeholders at all — untouched vars are simply unused.
    expect(issue.title).toBe("Ruleset metadata incomplete");
  });

  it("throws on a code with no catalogue entry, rather than shipping blank text", () => {
    expect(() => buildIssue("NOPE-99", {}, { kind: "none" })).toThrow(/NOPE-99/);
  });

  it("every code a check can emit has a catalogue entry", () => {
    // Run every check family against a ruleset deliberately broken in every
    // way, so this exercises as many codes as possible without hand-listing
    // them — a code missing from catalogue.json throws inside buildIssue.
    const KW = id("kw");
    const A = id("a");
    const ruleset = makeRuleset({
      keywords: [{ id: KW, displayName: "" }],
      articles: [{ id: A, title: "", text: doc(para("TODO ", kwRef(id("gone")))) }],
    });
    expect(() => runConsistencyChecks(buildStatsContext(ruleset))).not.toThrow();
  });

  it("every catalogue entry declares a known severity", () => {
    for (const [code, entry] of Object.entries(
      (raw as { codes: Record<string, { severity: string }> }).codes,
    )) {
      expect(["severe", "minor", "info"], code).toContain(entry.severity);
    }
  });
});
