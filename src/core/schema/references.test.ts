import type { JSONContent } from "@tiptap/core";
import { describe, expect, it } from "vitest";
import {
  collectNodes,
  diagramReferences,
  diagramUseCount,
  imageReferences,
  keywordReferences,
  keywordUseCount,
  richTextToPlainText,
} from "./references";
import type { Article, Ruleset } from "./ruleset";

const kwRef = (keywordId: string): JSONContent => ({ type: "keywordRef", attrs: { keywordId } });

const imgRef = (imageId: string): JSONContent => ({ type: "imageBlock", attrs: { imageId } });

const diagramRef = (diagramId: string): JSONContent => ({
  type: "diagramRef",
  attrs: { diagramId },
});

const para = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });

const doc = (...content: JSONContent[]): JSONContent => ({ type: "doc", content });

const text = (value: string): JSONContent => ({ type: "text", text: value });

const article = (id: string, text: JSONContent, shortText: JSONContent = doc(para())): Article => ({
  id,
  title: id,
  text,
  shortText,
  notes: "",
  isNotes: false,
});

const rulesetWith = (...articles: Article[]): Ruleset =>
  ({
    registry: { articles: Object.fromEntries(articles.map((a) => [a.id, a])), keywords: {} },
  }) as unknown as Ruleset;

describe("collectNodes", () => {
  it("collects nested nodes of the given type", () => {
    const d = doc(para(text("a"), kwRef("k1")), para(kwRef("k2")));
    expect(collectNodes(d, "keywordRef")).toHaveLength(2);
    expect(collectNodes(d, "paragraph")).toHaveLength(2);
    expect(collectNodes(undefined, "keywordRef")).toEqual([]);
  });
});

describe("richTextToPlainText", () => {
  it("flattens text nodes and trims", () => {
    expect(richTextToPlainText(doc(para(text(" hello "), kwRef("k1"), text("world"))))).toBe(
      "hello world",
    );
    expect(richTextToPlainText(undefined)).toBe("");
  });
});

describe("keywordReferences", () => {
  it("maps keyword ids to the articles that reference them, deduped", () => {
    const map = keywordReferences(
      rulesetWith(
        article("art1", doc(para(kwRef("k1"), kwRef("k1")), para(kwRef("k2")))),
        article("art2", doc(para(kwRef("k1")))),
        article("art3", doc(para(text("no refs")))),
      ),
    );
    expect(map.k1.sort()).toEqual(["art1", "art2"]);
    expect(map.k2).toEqual(["art1"]);
    expect(map.k3).toBeUndefined();
  });

  it("also scans shortText", () => {
    const map = keywordReferences(
      rulesetWith(article("art1", doc(para()), doc(para(kwRef("k9"))))),
    );
    expect(map.k9).toEqual(["art1"]);
  });

  it("still counts a reference converted to an enriched display mode", () => {
    const enrichedRef: JSONContent = {
      type: "keywordRef",
      attrs: { keywordId: "k1", display: "text" },
    };
    const rs = rulesetWith(article("art1", doc(para(enrichedRef))));
    expect(keywordReferences(rs).k1).toEqual(["art1"]);
    expect(keywordUseCount(rs, "k1")).toBe(1);
  });
});

describe("imageReferences", () => {
  it("maps image ids to the articles that reference them, deduped", () => {
    const map = imageReferences(
      rulesetWith(
        article("art1", doc(para(imgRef("i1")))),
        article("art2", doc(para(imgRef("i1"))), doc(para(imgRef("i2")))),
      ),
    );
    expect(map.i1.sort()).toEqual(["art1", "art2"]);
    expect(map.i2).toEqual(["art2"]);
    expect(map.i3).toBeUndefined();
  });
});

describe("keywordUseCount", () => {
  it("counts referencing articles", () => {
    const rs = rulesetWith(
      article("art1", doc(para(kwRef("k1")))),
      article("art2", doc(para(kwRef("k1")))),
    );
    expect(keywordUseCount(rs, "k1")).toBe(2);
    expect(keywordUseCount(rs, "missing")).toBe(0);
  });
});

describe("diagramReferences", () => {
  it("maps diagram ids to the articles that reference them, deduped", () => {
    const map = diagramReferences(
      rulesetWith(
        article("art1", doc(para(diagramRef("d1")))),
        article("art2", doc(para(diagramRef("d1"))), doc(para(diagramRef("d2")))),
        article("art3", doc(para(text("no refs")))),
      ),
    );
    expect(map.d1.sort()).toEqual(["art1", "art2"]);
    expect(map.d2).toEqual(["art2"]);
    expect(map.d3).toBeUndefined();
  });
});

describe("diagramUseCount", () => {
  it("counts referencing articles", () => {
    const rs = rulesetWith(
      article("art1", doc(para(diagramRef("d1")))),
      article("art2", doc(para(diagramRef("d1")))),
    );
    expect(diagramUseCount(rs, "d1")).toBe(2);
    expect(diagramUseCount(rs, "missing")).toBe(0);
  });
});
