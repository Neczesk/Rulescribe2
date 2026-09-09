import type { JSONContent } from "@tiptap/core";
import { article, metadata, ruleset, type Ruleset } from "./ruleset";

const DEMO_DOC: JSONContent = {
  type: "doc",
  content: [
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Untitled" }] },
    {
      type: "paragraph",
      content: [
        { type: "text", text: "Start writing your rules here. Use " },
        { type: "text", marks: [{ type: "bold" }], text: "bold" },
        { type: "text", text: ", " },
        { type: "text", marks: [{ type: "italic" }], text: "italic" },
        { type: "text", text: ", or " },
        { type: "text", marks: [{ type: "underline" }], text: "underline" },
        { type: "text", text: " to emphasize a rule." },
      ],
    },
    { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "A subsection" }] },
    {
      type: "bulletList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Bullet lists work well for keyword lists" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "…or short lists of options" }],
            },
          ],
        },
      ],
    },
    {
      type: "orderedList",
      content: [
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "Numbered lists work well for sequenced steps" }],
            },
          ],
        },
        {
          type: "listItem",
          content: [
            {
              type: "paragraph",
              content: [{ type: "text", text: "…like phases of a turn" }],
            },
          ],
        },
      ],
    },
  ],
};

export function createRuleset(title?: string): Ruleset {
  const rootArticle = article.parse({ title: "Untitled", text: DEMO_DOC });

  return ruleset.parse({
    schemaVersion: 14,
    metadata: metadata.parse({ title: title?.trim() || "Untitled ruleset" }),
    registry: {
      articles: { [rootArticle.id]: rootArticle },
      keywords: {},
      images: {},
    },
    structure: { articleId: rootArticle.id, children: [] },
  });
}
