import type { JSONContent } from "@tiptap/core";
import { shortId } from "../../util/nanoid";
import { article, keyword, metadata, ruleset, type Ruleset } from "./ruleset";

/* Tiny builders so the demo document below stays readable. */
const t = (text: string, ...marks: string[]): JSONContent =>
  marks.length
    ? { type: "text", text, marks: marks.map((type) => ({ type })) }
    : { type: "text", text };
const p = (...content: JSONContent[]): JSONContent => ({ type: "paragraph", content });
const h = (level: 1 | 2, text: string): JSONContent => ({
  type: "heading",
  attrs: { level },
  content: [t(text)],
});
const li = (...content: JSONContent[]): JSONContent => ({ type: "listItem", content });
const ul = (...items: JSONContent[]): JSONContent => ({ type: "bulletList", content: items });
const ol = (...items: JSONContent[]): JSONContent => ({ type: "orderedList", content: items });
const cell = (kind: "tableHeader" | "tableCell", text: string): JSONContent => ({
  type: kind,
  content: [text ? p(t(text)) : { type: "paragraph" }],
});
const row = (kind: "tableHeader" | "tableCell", ...cells: string[]): JSONContent => ({
  type: "tableRow",
  content: cells.map((c) => cell(kind, c)),
});

/** A one-paragraph rich-text doc, for the demo keyword's short/full text. */
const doc = (text: string): JSONContent => ({ type: "doc", content: [p(t(text))] });

/**
 * The starter article dropped into every new ruleset — a working tour of the
 * editor and the exporter. It is meant to be read once and then deleted. The
 * demo keyword it links to is real, so the `@` reference renders live.
 */
function demoDoc(keywordId: string): JSONContent {
  const kw = (): JSONContent => ({ type: "keywordRef", attrs: { keywordId, display: "link" } });

  return {
    type: "doc",
    content: [
      h(1, "Welcome to your ruleset"),
      p(
        t(
          "Everything you write here is saved to this device as you type — no account, no server — and the app works offline. This first article is a tour of what the editor and the exporter can do; replace it with your real rules once you've read it.",
        ),
      ),
      p(
        t("The panel on the left is your ruleset: an "),
        t("Articles", "bold"),
        t(" tab with the section tree, a "),
        t("Keywords", "bold"),
        t(" tab with every defined term, and a "),
        t("TODOs", "bold"),
        t(" tab collecting unfinished notes."),
      ),

      h(2, "Writing"),
      p(
        t("Select text to raise the toolbar. You get "),
        t("bold", "bold"),
        t(", "),
        t("italic", "italic"),
        t(", "),
        t("underline", "underline"),
        t(", "),
        t("strikethrough", "strike"),
        t(", and "),
        t("inline code", "code"),
        t(". "),
        t("Heading 1", "bold"),
        t(" and "),
        t("Heading 2", "bold"),
        t(
          " structure the article, and their order and nesting drive the section numbering in the export (2, 2.1, 2.1.1…).",
        ),
      ),
      ul(
        li(p(t("Bulleted lists suit keyword lists and groups of options."))),
        li(p(t("Numbered lists suit anything sequenced:"))),
      ),
      ol(li(p(t("Command phase"))), li(p(t("Movement phase"))), li(p(t("Shooting phase")))),

      h(2, "Callouts and tables"),
      p(
        t("The "),
        t("Callout", "bold"),
        t(
          " button boxes a rule off from the main text. Click its label to rename it — “Example”, “Designer's note”, “Exception”, whatever you need.",
        ),
      ),
      {
        type: "callout",
        attrs: { label: "Example" },
        content: [
          p(t("A unit that Falls Back cannot shoot or declare a charge for the rest of the turn.")),
        ],
      },
      p(
        t(
          "Tables suit stat lines and weapon profiles. Insert one from the table menu, which also adds and removes rows and columns.",
        ),
      ),
      {
        type: "table",
        content: [
          row("tableHeader", "Weapon", "Range", "Attacks", "Damage"),
          row("tableCell", "Bolt rifle", '24"', "2", "1"),
          row("tableCell", "Plasma gun", '18"', "1", "2"),
        ],
      },

      h(2, "Keywords"),
      p(
        t("Type "),
        t("@", "code"),
        t(
          " anywhere to link a keyword. Pick an existing one or create it on the spot — a stub is added to the registry and you fill in the definition later. Here is one now: ",
        ),
        kw(),
        t("."),
      ),
      p(
        t("Every keyword has a "),
        t("short text", "bold"),
        t(" (shown in tooltips and the printed glossary) and a "),
        t("full definition", "bold"),
        t(
          " (the authoritative wording). Open the Keywords tab, or click any link, to edit them or see where a term is used.",
        ),
      ),
      p(
        t(
          "A link can also render its target live — as the name, the summary, or the whole definition — so wording written once stays in sync everywhere it appears. Click a keyword in the editor to switch how it shows or to jump to its definition.",
        ),
      ),

      h(2, "Cross-references, diagrams, images"),
      ul(
        li(
          p(
            t("Article links", "bold"),
            t(
              " connect one section to another. In the export they become clickable, and in print they resolve to the section's number. You can create the target article without leaving the page.",
            ),
          ),
        ),
        li(
          p(
            t("Diagrams", "bold"),
            t(" come in two kinds: a freehand "),
            t("sketch", "italic"),
            t(" (Excalidraw) or a "),
            t("flowchart", "italic"),
            t(
              " written as text (Mermaid). Both are stored in the ruleset and rendered into the exported document.",
            ),
          ),
        ),
        li(
          p(
            t("Images", "bold"),
            t(
              " can be pasted or dragged straight into the text. Set one to wrap left or right, drag its corner to resize, and give it alt text for the export.",
            ),
          ),
        ),
      ),

      h(2, "Organising the ruleset"),
      p(
        t("In the "),
        t("Articles", "bold"),
        t(
          " tab you can nest sections to any depth, drag them to reorder, and add a child or sibling from each row's menu. The export follows that order exactly.",
        ),
      ),
      p(
        t("Mark an article as "),
        t("Notes", "bold"),
        t(
          " to keep it in the editor but leave it out of every export — use it for scratch work and open questions. Or drop a TODO inline, right where the gap is:",
        ),
      ),
      {
        type: "todo",
        attrs: {
          todoId: shortId(),
          text: "Decide whether Overwatch is a core rule or an optional one.",
          resolved: false,
        },
      },
      p(
        t(
          "Open TODOs gather in the TODOs tab with a running count. They are stripped from the finished rulebook but kept in the Draft export, so playtesters see what's still in flux. The ",
        ),
        t("Stats", "bold"),
        t(
          " button in the top bar audits the whole ruleset — undefined keywords, broken links, readability, and more.",
        ),
      ),

      { type: "horizontalRule" },

      h(2, "Exporting"),
      p(
        t("Open "),
        t("Ruleset actions ▸ Export…", "bold"),
        t(" to build a standalone document. There are two modes:"),
      ),
      ul(
        li(
          p(
            t("Draft", "bold"),
            t(
              " — a fixed, neutral layout for playtesters. Author notes are printed inline and paragraphs are numbered so feedback can cite §2.1 ¶4. Choose Letter or A4 and a body size; export as one HTML file or straight to the print dialog.",
            ),
          ),
        ),
        li(
          p(
            t("Rulebook", "bold"),
            t(
              " — the finished book. Notes are removed and every visual choice is yours. Export as a single self-contained HTML file, or as a ",
            ),
            t(".zip", "code"),
            t(" that also bundles the images, diagrams, metadata, and your original JSON."),
          ),
        ),
      ),
      p(
        t(
          "Either way you pick exactly which sections to include, watch a live preview, and can add generated matter: a table of contents, a keyword glossary, an index of where each term is used, and a version and credits page. Serious consistency problems are flagged before export, with a checkbox to override them.",
        ),
      ),

      h(2, "Themes"),
      p(
        t(
          "A Rulebook's look is a theme. In the theme workspace you set the ink, paper, and accent colours (with a live contrast check), choose heading and body fonts and a type scale, pick the cover style, decide how keywords render (tooltip, inline definition, small caps, or plain), and set divider and table styles — with a custom CSS box for anything else.",
        ),
      ),
      p(
        t("A theme is a small, shareable "),
        t(".rulescribe-theme.json", "code"),
        t(
          " file; you can import one, save your own as a preset, and it never touches the ruleset itself. The app's own light and dark mode is separate — set it from the sun/moon control in the top bar; by default it follows your system.",
        ),
      ),
      p(
        t(
          "When you're ready, select everything here and delete it, then start writing your rules.",
        ),
      ),
    ],
  };
}

export function createRuleset(title?: string): Ruleset {
  const demoKeyword = keyword.parse({
    displayName: "Fall Back",
    shortText: doc(
      "A unit that Falls Back moves as in the Movement phase but cannot end within Engagement Range of an enemy.",
    ),
    text: doc(
      "In the Movement phase, a unit that is within Engagement Range of an enemy unit can Fall Back. It makes a normal move but cannot move within Engagement Range of any enemy unit. A unit that Falls Back cannot shoot or declare a charge later in the same turn unless a rule says otherwise.",
    ),
  });
  const rootArticle = article.parse({ title: "Untitled", text: demoDoc(demoKeyword.id) });

  return ruleset.parse({
    schemaVersion: 14,
    metadata: metadata.parse({ title: title?.trim() || "Untitled ruleset" }),
    registry: {
      articles: { [rootArticle.id]: rootArticle },
      keywords: { [demoKeyword.id]: demoKeyword },
      images: {},
    },
    structure: { articleId: rootArticle.id, children: [] },
  });
}
