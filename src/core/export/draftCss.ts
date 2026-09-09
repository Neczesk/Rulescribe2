import type { DraftLayout } from "./options";

/**
 * The draft's one fixed, deliberately neutral stylesheet — no theme, so
 * playtest feedback lands on the rules rather than the styling. Only the two
 * `DraftLayout` knobs (paper size, body point size) vary.
 *
 * Class contract, wrapped in `.rs-draft`: rich-text nodes keep the same
 * `.keyword-ref` / `.article-ref` / `.callout` classes as the rulebook; the
 * draft adds `.rs-para` / `.rs-para-num` (citation gutter), `.rs-note` (author
 * note), `.rs-kwnotes` (keyword notes), `.rs-flag` (notes-only marker) and
 * `.rs-unresolved` (dangling ref).
 */
export function draftCss(layout: DraftLayout): string {
  const size = `${layout.bodyPt}pt`;
  const paper = layout.paper === "a4" ? "A4" : "letter";
  const accent = "#ae1800";

  return `
@page { size: ${paper}; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: #d7d3d3;
  color: #201e1d;
  font-family: Georgia, "Times New Roman", serif;
  line-height: 1.55;
}
.rs-draft {
  max-width: 46rem;
  margin: 0 auto;
  padding: 40px 48px 56px;
  background: #fff;
  font-size: ${size};
  box-shadow: 0 10px 30px rgba(45, 43, 43, 0.28);
}

/* cover / metadata */
.rs-draft-cover {
  display: flex;
  align-items: flex-start;
  gap: 20px;
  border-bottom: 2px solid #201e1d;
  padding-bottom: 14px;
  margin-bottom: 28px;
}
.rs-draft-title { font-family: system-ui, sans-serif; font-weight: 800; font-size: 26px; line-height: 1.1; }
.rs-draft-meta {
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 11px;
  color: #605d5d;
  margin-top: 6px;
  line-height: 1.7;
  white-space: pre-line;
}
.rs-stamp {
  margin-left: auto;
  flex: none;
  border: 2px solid ${accent};
  color: ${accent};
  padding: 8px 12px;
  text-align: center;
  transform: rotate(-3deg);
}
.rs-stamp-word { font-family: system-ui, sans-serif; font-weight: 800; font-size: 20px; letter-spacing: 0.1em; text-transform: uppercase; line-height: 1; }
.rs-stamp-sub { font-family: ui-monospace, monospace; font-size: 10px; margin-top: 3px; display: block; }

/* sections */
.rs-draft section { margin: 30px 0; page-break-inside: auto; }
.rs-draft-head { display: flex; align-items: baseline; gap: 12px; margin-bottom: 12px; flex-wrap: wrap; }
.rs-sec { font-family: ui-monospace, monospace; font-size: 0.8em; color: #605d5d; }
.rs-draft h1, .rs-draft h2, .rs-draft h3, .rs-draft h4, .rs-draft h5, .rs-draft h6 {
  font-family: system-ui, sans-serif; font-weight: 800; margin: 0; line-height: 1.15;
}
.rs-draft h1 { font-size: 1.5em; }
.rs-draft h2 { font-size: 1.35em; }
.rs-draft h3 { font-size: 1.1em; }
.rs-flag {
  font-family: system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: ${accent};
  border: 1px solid ${accent};
  padding: 1px 6px;
}

/* body + citation gutter */
.rs-draft p { margin: 0 0 12px; text-wrap: pretty; }
.rs-para { display: grid; grid-template-columns: 40px 1fr; gap: 0 14px; }
.rs-para-num {
  font-family: ui-monospace, monospace;
  font-size: 12px;
  color: #a8a4a4;
  text-align: right;
  padding-top: 4px;
  user-select: none;
}
.rs-para-body > :last-child { margin-bottom: 0; }

/* rich-text nodes */
.keyword-ref { font-weight: 700; background: #f1efef; padding: 0 3px; }
.article-ref { color: inherit; text-decoration: none; border-bottom: 1px solid #201e1d; }
.callout { border-left: 3px solid #201e1d; padding: 4px 0 4px 12px; margin: 12px 0; }
.callout-label { font-family: system-ui, sans-serif; font-weight: 800; font-size: 0.7em; letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 4px; }
.todo { display: flex; gap: 10px; align-items: baseline; border: 1.5px dashed ${accent}; background: #fff6f3; padding: 8px 12px; margin: 12px 0; }
.todo--resolved { border-style: solid; border-color: #b3afaf; background: transparent; }
.todo-label { font-family: system-ui, sans-serif; font-weight: 800; font-size: 0.7em; letter-spacing: 0.14em; text-transform: uppercase; color: ${accent}; flex: none; }
.todo--resolved .todo-label { color: #605d5d; }
.todo--resolved .todo-text { text-decoration: line-through; color: #605d5d; }
.rs-draft table { width: 100%; border-collapse: collapse; font-size: 0.95em; margin: 12px 0; }
.rs-draft th, .rs-draft td { border: 1px solid #b3afaf; padding: 6px 9px; text-align: left; vertical-align: top; }
.rs-draft img, .rs-draft figure { max-width: 100%; margin: 12px 0; }
.rs-draft figure svg { display: block; width: 100%; height: auto; }
.rs-placeholder { border: 1px dashed #b3afaf; color: #605d5d; font-size: 0.85em; padding: 10px 12px; margin: 12px 0; }

/* author note */
.rs-note { border: 1px dashed ${accent}; background: #fff6f3; padding: 10px 12px; margin: 12px 0; }
.rs-note-label { font-family: system-ui, sans-serif; font-weight: 800; font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: ${accent}; margin-bottom: 4px; }
.rs-note p { margin: 0; font-size: 0.9em; }

/* keyword notes */
.rs-kwnotes { margin-top: 20px; border-top: 1px solid #d7d3d3; padding-top: 12px; }
.rs-kwnotes-label { font-family: system-ui, sans-serif; font-weight: 800; font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase; color: #605d5d; margin-bottom: 8px; }
.rs-kwnote { display: flex; gap: 12px; font-size: 0.9em; line-height: 1.5; margin-bottom: 8px; }
.rs-kwnote-term { font-family: ui-monospace, monospace; font-size: 0.85em; color: #8a8686; flex: none; width: 88px; }
.rs-unresolved, .rs-unresolved .rs-kwnote-term { color: ${accent}; }

/* footer */
.rs-draft-foot {
  margin-top: 32px;
  border-top: 1px solid #d7d3d3;
  padding-top: 12px;
  display: flex;
  justify-content: space-between;
  gap: 16px;
  flex-wrap: wrap;
  font-family: ui-monospace, monospace;
  font-size: 11px;
  color: #605d5d;
}

@media print {
  body { background: #fff; }
  .rs-draft { max-width: none; margin: 0; padding: 0; box-shadow: none; }
  .rs-draft section { page-break-inside: auto; }
}
`.trim();
}
