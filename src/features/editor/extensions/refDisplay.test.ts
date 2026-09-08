import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import type { Ruleset } from "../../../core/schema/ruleset";
import {
  normalizeDisplay,
  REF_DISPLAY_MODES,
  resolveArticleRefText,
  resolveKeywordRefText,
} from "./refDisplay";

const doc = (value: string): JSONContent => ({
  type: "doc",
  content: [{ type: "paragraph", content: value ? [{ type: "text", text: value }] : [] }],
});

const ruleset = {
  registry: {
    keywords: {
      k1: {
        id: "k1",
        displayName: "  Cover  ",
        shortText: doc("Terrain that makes a unit harder to hit."),
        text: doc("Soft cover gives -1 to hit; hard cover gives -2."),
        notes: "",
      },
    },
    articles: {
      a1: {
        id: "a1",
        title: "  Wound Rolls  ",
        shortText: doc("Converts a successful hit into a casualty."),
        text: doc("Roll a d6 and compare Strength against Toughness."),
        notes: "",
        isNotes: false,
      },
    },
  },
} as unknown as Ruleset;

describe("normalizeDisplay", () => {
  it("passes through valid modes", () => {
    for (const mode of REF_DISPLAY_MODES) {
      expect(normalizeDisplay(mode)).toBe(mode);
    }
  });

  it("coerces unknown / missing values to 'link'", () => {
    expect(normalizeDisplay(undefined)).toBe("link");
    expect(normalizeDisplay(null)).toBe("link");
    expect(normalizeDisplay("bogus")).toBe("link");
    expect(normalizeDisplay(42)).toBe("link");
  });
});

describe("resolveKeywordRefText", () => {
  it("returns the trimmed display name for link and name modes", () => {
    expect(resolveKeywordRefText(ruleset, "k1", "link")).toBe("Cover");
    expect(resolveKeywordRefText(ruleset, "k1", "name")).toBe("Cover");
  });

  it("returns flattened summary and full text", () => {
    expect(resolveKeywordRefText(ruleset, "k1", "shortText")).toBe(
      "Terrain that makes a unit harder to hit.",
    );
    expect(resolveKeywordRefText(ruleset, "k1", "text")).toBe(
      "Soft cover gives -1 to hit; hard cover gives -2.",
    );
  });

  it("falls back for a missing keyword", () => {
    expect(resolveKeywordRefText(ruleset, "gone", "name")).toBe("Unknown keyword");
    expect(resolveKeywordRefText(ruleset, "gone", "link")).toBe("Unknown keyword");
    expect(resolveKeywordRefText(ruleset, "gone", "shortText")).toBe("");
    expect(resolveKeywordRefText(ruleset, "gone", "text")).toBe("");
    expect(resolveKeywordRefText(ruleset, null, "name")).toBe("Unknown keyword");
    expect(resolveKeywordRefText(null, "k1", "name")).toBe("Unknown keyword");
  });
});

describe("resolveArticleRefText", () => {
  it("returns the trimmed title for link and name modes", () => {
    expect(resolveArticleRefText(ruleset, "a1", "link")).toBe("Wound Rolls");
    expect(resolveArticleRefText(ruleset, "a1", "name")).toBe("Wound Rolls");
  });

  it("returns flattened summary and full text", () => {
    expect(resolveArticleRefText(ruleset, "a1", "shortText")).toBe(
      "Converts a successful hit into a casualty.",
    );
    expect(resolveArticleRefText(ruleset, "a1", "text")).toBe(
      "Roll a d6 and compare Strength against Toughness.",
    );
  });

  it("falls back for a missing article", () => {
    expect(resolveArticleRefText(ruleset, "gone", "name")).toBe("Unknown article");
    expect(resolveArticleRefText(ruleset, "gone", "shortText")).toBe("");
    expect(resolveArticleRefText(ruleset, null, "text")).toBe("");
  });
});
