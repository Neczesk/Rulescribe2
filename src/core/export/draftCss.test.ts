import { describe, expect, it } from "vitest";
import { draftCss } from "./draftCss";
import { defaultDraftLayout } from "./options";

describe("draftCss", () => {
  it("reflects the paper size", () => {
    expect(draftCss({ ...defaultDraftLayout(), paper: "letter" })).toContain("size: letter");
    expect(draftCss({ ...defaultDraftLayout(), paper: "a4" })).toContain("size: A4");
  });

  it("reflects the body point size", () => {
    expect(draftCss({ ...defaultDraftLayout(), bodyPt: 14 })).toContain("font-size: 14pt");
  });

  it("styles the draft-only marker classes", () => {
    const css = draftCss(defaultDraftLayout());
    for (const selector of [
      ".rs-para-num",
      ".rs-note",
      ".rs-kwnotes",
      ".rs-flag",
      ".rs-unresolved",
    ]) {
      expect(css).toContain(selector);
    }
  });
});
