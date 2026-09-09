/**
 * Export themes. A theme controls only how the *rulebook* export looks; it is
 * never stored in the ruleset (the design's contract: "it never touches your
 * ruleset") — it lives in the local prefs store and travels as a standalone
 * `.rulescribe-theme.json`. Framework-free so `themeToCss` and the validators
 * can be unit-tested and reused by the download, the preview, and file import.
 */

export const FONT_KEYS = ["archivo", "sourceSerif", "plexMono"] as const;
export type FontKey = (typeof FONT_KEYS)[number];

export const FONT_STACKS: Record<FontKey, string> = {
  archivo: '"Archivo", system-ui, sans-serif',
  sourceSerif: '"Source Serif 4", Georgia, serif',
  plexMono: '"IBM Plex Mono", ui-monospace, monospace',
};

export const FONT_LABELS: Record<FontKey, string> = {
  archivo: "Archivo",
  sourceSerif: "Source Serif",
  plexMono: "Plex Mono",
};

/** Google Fonts href covering all three bundled faces. */
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  "family=Archivo:ital,wght@0,400;0,600;0,800;1,400&" +
  "family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;0,8..60,700;1,8..60,400&" +
  "family=IBM+Plex+Mono:wght@400;500&display=swap";

export const KEYWORD_MODES = ["tooltip", "inline", "glossary", "plain"] as const;
export type KeywordMode = (typeof KEYWORD_MODES)[number];

export const DIVIDER_STYLES = ["none", "hairline", "diamond", "double"] as const;
export type DividerStyle = (typeof DIVIDER_STYLES)[number];

export const TABLE_STYLES = ["rules", "zebra", "boxed", "minimal"] as const;
export type TableStyle = (typeof TABLE_STYLES)[number];

export const COVER_STYLES = ["stacked", "centered", "banded"] as const;
export type CoverStyle = (typeof COVER_STYLES)[number];

export const HEADING_CASES = ["upper", "sentence"] as const;
export type HeadingCase = (typeof HEADING_CASES)[number];

export const MIN_SCALE = 0.85;
export const MAX_SCALE = 1.25;

export interface ExportTheme {
  name: string;
  paper: string;
  ink: string;
  accent: string;
  headingFont: FontKey;
  bodyFont: FontKey;
  /** Type scale multiplier, `MIN_SCALE`–`MAX_SCALE`. */
  scale: number;
  headingCase: HeadingCase;
  cover: CoverStyle;
  showSubtitle: boolean;
  keywordMode: KeywordMode;
  divider: DividerStyle;
  table: TableStyle;
  /** Raw CSS appended last, so it wins over everything above. */
  customCss: string;
}

export const PRESS_THEME: ExportTheme = {
  name: "Press",
  paper: "#f5efe2",
  ink: "#241f19",
  accent: "#8c2f1f",
  headingFont: "archivo",
  bodyFont: "sourceSerif",
  scale: 1,
  headingCase: "upper",
  cover: "stacked",
  showSubtitle: true,
  keywordMode: "tooltip",
  divider: "diamond",
  table: "rules",
  customCss: "",
};

const NIGHTWATCH_THEME: ExportTheme = {
  name: "Nightwatch",
  paper: "#14161a",
  ink: "#e8e6e1",
  accent: "#d9a13b",
  headingFont: "archivo",
  bodyFont: "sourceSerif",
  scale: 1.05,
  headingCase: "upper",
  cover: "banded",
  showSubtitle: true,
  keywordMode: "inline",
  divider: "double",
  table: "boxed",
  customCss: "",
};

const LEDGER_THEME: ExportTheme = {
  name: "Ledger",
  paper: "#ffffff",
  ink: "#2b2f33",
  accent: "#1f4f6b",
  headingFont: "archivo",
  bodyFont: "archivo",
  scale: 0.95,
  headingCase: "sentence",
  cover: "stacked",
  showSubtitle: false,
  keywordMode: "glossary",
  divider: "hairline",
  table: "zebra",
  customCss: "",
};

export const PRESETS: ExportTheme[] = [PRESS_THEME, NIGHTWATCH_THEME, LEDGER_THEME];
export const DEFAULT_THEME = PRESS_THEME;

/* ── validation ───────────────────────────────────────────────────────────── */

const isHex = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

function oneOf<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

export function clampScale(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return DEFAULT_THEME.scale;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, n));
}

/**
 * Coerce arbitrary parsed JSON (an imported theme file, a stale prefs blob)
 * into a valid `ExportTheme`, falling back field-by-field to the default. Never
 * throws.
 */
export function normalizeTheme(raw: unknown): ExportTheme {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: typeof r.name === "string" && r.name.trim() ? r.name : "Custom",
    paper: isHex(r.paper) ? r.paper : DEFAULT_THEME.paper,
    ink: isHex(r.ink) ? r.ink : DEFAULT_THEME.ink,
    accent: isHex(r.accent) ? r.accent : DEFAULT_THEME.accent,
    headingFont: oneOf(r.headingFont, FONT_KEYS, DEFAULT_THEME.headingFont),
    bodyFont: oneOf(r.bodyFont, FONT_KEYS, DEFAULT_THEME.bodyFont),
    scale: clampScale(r.scale),
    headingCase: oneOf(r.headingCase, HEADING_CASES, DEFAULT_THEME.headingCase),
    cover: oneOf(r.cover, COVER_STYLES, DEFAULT_THEME.cover),
    showSubtitle: typeof r.showSubtitle === "boolean" ? r.showSubtitle : DEFAULT_THEME.showSubtitle,
    keywordMode: oneOf(r.keywordMode, KEYWORD_MODES, DEFAULT_THEME.keywordMode),
    divider: oneOf(r.divider, DIVIDER_STYLES, DEFAULT_THEME.divider),
    table: oneOf(r.table, TABLE_STYLES, DEFAULT_THEME.table),
    customCss: typeof r.customCss === "string" ? r.customCss : "",
  };
}

export const THEME_FILE_EXTENSION = ".rulescribe-theme.json";

export function serializeTheme(theme: ExportTheme): string {
  return JSON.stringify(theme, null, 2);
}

/** Parse a `.rulescribe-theme.json` file's text. Throws a friendly Error on bad JSON. */
export function parseThemeText(text: string): ExportTheme {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }
  return normalizeTheme(json);
}

/* ── contrast ─────────────────────────────────────────────────────────────── */

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = channel(parseInt(h.slice(0, 2), 16));
  const g = channel(parseInt(h.slice(2, 4), 16));
  const b = channel(parseInt(h.slice(4, 6), 16));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two `#rrggbb` colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** WCAG thresholds the theme workspace warns against. */
export const BODY_CONTRAST_MIN = 7;
export const ACCENT_CONTRAST_MIN = 4.5;

export interface ContrastReport {
  body: number;
  accent: number;
  ok: boolean;
}

export function themeContrast(theme: ExportTheme): ContrastReport {
  const body = contrastRatio(theme.ink, theme.paper);
  const accent = contrastRatio(theme.accent, theme.paper);
  return { body, accent, ok: body >= BODY_CONTRAST_MIN && accent >= ACCENT_CONTRAST_MIN };
}

/* ── CSS ──────────────────────────────────────────────────────────────────── */

/** `color-mix` shorthand — mixes `pct`% of `a` into `b`. */
function mix(a: string, b: string, pct: number): string {
  return `color-mix(in srgb, ${a} ${pct}%, ${b})`;
}

function keywordRefCss(mode: KeywordMode): string {
  switch (mode) {
    case "tooltip":
      return ".keyword-ref { font-weight: 600; border-bottom: 1px dotted var(--rs-accent); cursor: help; }";
    case "inline":
      return ".keyword-ref { font-weight: 600; } .keyword-ref-gloss { font-style: italic; color: var(--rs-soft); }";
    case "glossary":
      return ".keyword-ref { font-variant: small-caps; font-weight: 700; letter-spacing: .03em; }";
    case "plain":
      return ".keyword-ref { font-weight: inherit; }";
  }
}

function dividerCss(style: DividerStyle): string {
  switch (style) {
    case "none":
      return ".rs-divider { display: none; }";
    case "hairline":
      return ".rs-divider-mark { display: none; }";
    case "double":
      return ".rs-divider { display: block; height: 5px; border-top: 2px solid var(--rs-ink); border-bottom: 1px solid var(--rs-accent); } .rs-divider::before, .rs-divider::after, .rs-divider-mark { display: none; }";
    case "diamond":
      return "";
  }
}

/**
 * The full stylesheet for an exported rulebook. Wrap the document body in
 * `<div class="rs-doc">`; the cover `<header>` carries `rs-cover-<coverStyle>`;
 * every article section is `<section id="article-ID">`. Rich-text node classes
 * match what the editor's `renderHTML` emits.
 */
export function themeToCss(theme: ExportTheme): string {
  const heading = FONT_STACKS[theme.headingFont];
  const body = FONT_STACKS[theme.bodyFont];
  const k = theme.scale;
  const { paper, ink, accent } = theme;
  const soft = mix(ink, paper, 62);
  const hair = mix(ink, paper, 26);
  const tint = mix(accent, paper, 8);
  const headingCase = theme.headingCase === "upper" ? "uppercase" : "none";

  return `
:root {
  --rs-paper: ${paper};
  --rs-ink: ${ink};
  --rs-accent: ${accent};
  --rs-soft: ${soft};
  --rs-hair: ${hair};
  --rs-tint: ${tint};
  --rs-heading: ${heading};
  --rs-body: ${body};
}
@page { margin: 22mm 20mm; }
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
  background: ${mix(ink, paper, 6)};
  color: var(--rs-ink);
  font-family: var(--rs-body);
  line-height: 1.55;
}
.rs-doc {
  max-width: 46rem;
  margin: 0 auto;
  padding: ${48 * k}px ${40 * k}px ${64 * k}px;
  background: var(--rs-paper);
  font-size: ${17 * k}px;
  overflow: hidden;
}
.rs-doc a { color: var(--rs-accent); }

/* cover */
.rs-cover-header { margin-bottom: ${96 * k}px; }
.rs-cover-centered { text-align: center; }
.rs-cover-centered .rs-cover-rule { margin-left: auto; margin-right: auto; }
.rs-cover-banded {
  background: var(--rs-accent);
  color: var(--rs-paper);
  padding: ${56 * k}px ${40 * k}px;
  margin: 0 -${40 * k}px ${72 * k}px;
  text-align: center;
}
.rs-cover-banded .rs-cover, .rs-cover-banded .rs-cover-title, .rs-cover-banded .rs-cover-tagline, .rs-cover-banded .rs-cover-meta { color: var(--rs-paper); }
.rs-cover-banded .rs-cover { border-color: var(--rs-paper); }
.rs-cover-banded .rs-cover-rule { background: var(--rs-paper); margin-left: auto; margin-right: auto; }
.rs-cover {
  border-top: 3px solid var(--rs-ink);
  border-bottom: 1px solid var(--rs-ink);
  padding: ${6 * k}px 0;
  font-family: var(--rs-heading);
  font-weight: 800;
  font-size: ${11 * k}px;
  letter-spacing: .3em;
  text-transform: uppercase;
  color: var(--rs-accent);
}
.rs-cover-title {
  font-family: var(--rs-heading);
  font-weight: 800;
  font-size: ${72 * k}px;
  line-height: .95;
  letter-spacing: -.02em;
  text-transform: ${headingCase};
  margin: ${72 * k}px 0 ${24 * k}px;
  color: var(--rs-ink);
}
.rs-cover-rule { width: 120px; height: 8px; background: var(--rs-accent); margin-bottom: ${24 * k}px; }
.rs-cover-tagline { font-size: ${22 * k}px; font-style: italic; color: var(--rs-soft); max-width: 26ch; }
.rs-cover-centered .rs-cover-tagline { margin-left: auto; margin-right: auto; }
.rs-cover-meta {
  margin-top: ${48 * k}px;
  font-family: var(--rs-body);
  font-size: ${13 * k}px;
  color: var(--rs-soft);
  line-height: 1.7;
}

/* headings */
.rs-doc h1, .rs-doc h2, .rs-doc h3, .rs-doc h4, .rs-doc h5, .rs-doc h6 {
  font-family: var(--rs-heading);
  font-weight: 800;
  line-height: 1.1;
  text-transform: ${headingCase};
  margin: ${36 * k}px 0 ${12 * k}px;
}
.rs-doc h1 { font-size: ${40 * k}px; }
.rs-doc h2 { font-size: ${30 * k}px; }
.rs-doc h3 { font-size: ${18 * k}px; letter-spacing: .06em; }
.rs-doc h4, .rs-doc h5, .rs-doc h6 { font-size: ${15 * k}px; letter-spacing: .1em; }
.rs-section-heading { display: flex; align-items: baseline; gap: ${14 * k}px; }
.rs-num { color: var(--rs-accent); font-variant-numeric: tabular-nums; }
.rs-doc p { margin: ${12 * k}px 0; text-wrap: pretty; }
.rs-doc > section { break-inside: avoid-page; clear: both; }

/* rich-text: refs */
${keywordRefCss(theme.keywordMode)}
.keyword-ref--live { border-bottom: none; }
.article-ref {
  color: var(--rs-accent);
  text-decoration: none;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: .03em;
  border-bottom: 1px solid ${mix(accent, paper, 35)};
}

/* rich-text: callout */
.callout {
  border: 1px solid var(--rs-ink);
  border-left: 6px solid var(--rs-accent);
  padding: ${14 * k}px ${18 * k}px;
  margin: ${20 * k}px 0;
  background: var(--rs-tint);
}
.callout-label {
  font-family: var(--rs-heading);
  font-weight: 800;
  font-size: ${10 * k}px;
  letter-spacing: .18em;
  text-transform: uppercase;
  color: var(--rs-accent);
  margin-bottom: ${6 * k}px;
}
.callout-body > :first-child { margin-top: 0; }
.callout-body > :last-child { margin-bottom: 0; }
/* No .todo rules: TODO nodes are stripped from the rulebook (dropTodos in
   renderRichTextHtml); they only appear in the draft export. */

/* rich-text: tables */
.tableWrapper { overflow-x: auto; margin: ${20 * k}px 0; }
.rs-doc table, .rs-doc table.table {
  width: 100%;
  border-collapse: collapse;
  font-size: ${15 * k}px;
}
.rs-doc th {
  text-align: left;
  font-family: var(--rs-heading);
  font-weight: 800;
  font-size: ${10 * k}px;
  letter-spacing: .16em;
  text-transform: uppercase;
  color: var(--rs-accent);
  padding: ${8 * k}px ${theme.table === "boxed" ? `${10 * k}px` : "0"};
  border-bottom: 2px solid var(--rs-ink);
  ${theme.table === "boxed" ? "border: 1px solid var(--rs-hair); background: var(--rs-tint);" : ""}
}
.rs-doc td {
  padding: ${9 * k}px ${theme.table === "boxed" ? `${10 * k}px` : "0"};
  border-bottom: ${theme.table === "minimal" ? "none" : "1px solid var(--rs-hair)"};
  vertical-align: top;
  ${theme.table === "boxed" ? "border: 1px solid var(--rs-hair);" : ""}
}
${theme.table === "zebra" ? `.rs-doc tbody tr:nth-child(even) td { background: ${mix(ink, paper, 5)}; }` : ""}

/* dividers between top-level sections */
.rs-divider { display: flex; align-items: center; gap: 12px; margin: ${32 * k}px 0; border: 0; }
.rs-divider::before, .rs-divider::after { content: ""; flex: 1; height: 1px; background: var(--rs-hair); }
.rs-divider-mark { width: 9px; height: 9px; background: var(--rs-accent); transform: rotate(45deg); }
${dividerCss(theme.divider)}

/* images & diagrams */
.rs-doc figure { margin: ${20 * k}px 0; }
.rs-doc figcaption { font-size: ${13 * k}px; color: var(--rs-soft); margin-top: ${4 * k}px; }
.image-block, .rs-doc img { max-width: 100%; height: auto; display: block; margin: ${20 * k}px 0; }
.diagram-ref { margin: ${20 * k}px 0; }
.diagram-ref svg { display: block; width: 100%; height: auto; }
.image-block--left, .diagram-ref--left { float: left; margin: ${6 * k}px ${18 * k}px ${10 * k}px 0; }
.image-block--right, .diagram-ref--right { float: right; margin: ${6 * k}px 0 ${10 * k}px ${18 * k}px; }
.rs-placeholder {
  border: 1px dashed var(--rs-hair);
  color: var(--rs-soft);
  font-size: ${13 * k}px;
  padding: ${12 * k}px ${16 * k}px;
  margin: ${20 * k}px 0;
}

/* generated matter */
.rs-appendix { break-before: page; margin-top: ${48 * k}px; }
.rs-appendix h2 { border-bottom: 2px solid var(--rs-ink); padding-bottom: ${6 * k}px; }
.rs-appendix h3 { margin-top: ${28 * k}px; }
.rs-toc-list { list-style: none; padding: 0; margin: ${16 * k}px 0 0; }
.rs-toc-item { padding: ${3 * k}px 0; }
.rs-toc-item a { text-decoration: none; color: var(--rs-ink); }
.rs-toc-num { color: var(--rs-accent); font-variant-numeric: tabular-nums; font-weight: 600; }
.rs-credits table { width: auto; }
.rs-credits th { text-align: left; padding-right: ${20 * k}px; white-space: nowrap; border: 0; }
.rs-credits td { border: 0; }
.rs-glossary dl { margin: ${16 * k}px 0 0; }
.rs-glossary dt {
  font-family: var(--rs-heading);
  font-weight: 800;
  font-size: ${16 * k}px;
  margin-top: ${18 * k}px;
  ${theme.keywordMode === "glossary" ? "font-variant: small-caps;" : ""}
}
.rs-glossary dd { margin: ${4 * k}px 0 0; }
.rs-glossary dd > :first-child { margin-top: 0; }
.rs-index ul { list-style: none; padding: 0; margin: ${16 * k}px 0 0; column-width: 16rem; column-gap: ${24 * k}px; }
.rs-index li { padding: ${3 * k}px 0; break-inside: avoid; }
.rs-index-term { font-weight: 600; }
.rs-index a { text-decoration: none; }
.rs-lb table { margin-top: ${8 * k}px; }

@media print {
  body { background: var(--rs-paper); }
  .rs-doc { max-width: none; margin: 0; padding: 0; box-shadow: none; }
  .rs-appendix { break-before: page; }
}

/* author custom CSS — appended last */
${theme.customCss}
`.trim();
}
