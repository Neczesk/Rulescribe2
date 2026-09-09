import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import { article, keyword, metadata, ruleset, type Ruleset } from "../schema/ruleset";
import { draftKeywordNotes, unresolvedArticleRefCount } from "./draftAnalysis";

const kwRef = (id: string): JSONContent => ({ type: "keywordRef", attrs: { keywordId: id } });
const artRef = (id: string): JSONContent => ({ type: "articleRef", attrs: { articleId: id } });

function fixture(body: JSONContent[]): Ruleset {
  const root = article.parse({
    id: "rootaaaaaa",
    title: "Root",
    text: { type: "doc", content: [{ type: "paragraph", content: body }] },
  });
  const skill = keyword.parse({
    id: "skillaaaaa",
    displayName: "Skill",
    notes: "Rename to Prowess?",
  });
  const cover = keyword.parse({ id: "coveraaaaa", displayName: "Cover", notes: "" });

  return ruleset.parse({
    schemaVersion: 13,
    metadata: metadata.parse({ title: "Test" }),
    registry: {
      articles: { [root.id]: root },
      keywords: { [skill.id]: skill, [cover.id]: cover },
    },
    structure: { articleId: root.id, children: [] },
  });
}

describe("draftKeywordNotes", () => {
  it("lists referenced keywords that have notes, and flags deleted ones", () => {
    const rs = fixture([kwRef("skillaaaaa"), kwRef("coveraaaaa"), kwRef("goneaaaaaa")]);
    const notes = draftKeywordNotes(rs.registry.articles.rootaaaaaa.text, rs);
    expect(notes).toEqual([
      { label: "Skill", notes: "Rename to Prowess?", unresolved: false },
      {
        label: "deleted keyword",
        notes: "Referenced here, but the keyword was removed after it was linked.",
        unresolved: true,
      },
    ]);
  });

  it("de-duplicates repeated references", () => {
    const rs = fixture([kwRef("skillaaaaa"), kwRef("skillaaaaa")]);
    expect(draftKeywordNotes(rs.registry.articles.rootaaaaaa.text, rs)).toHaveLength(1);
  });
});

describe("unresolvedArticleRefCount", () => {
  it("counts articleRef nodes pointing at a missing id", () => {
    const rs = fixture([artRef("rootaaaaaa"), artRef("goneaaaaaa"), artRef("alsogoneee")]);
    expect(unresolvedArticleRefCount(rs.registry.articles.rootaaaaaa.text, rs)).toBe(2);
  });
});
