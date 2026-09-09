import { describe, expect, it } from "vitest";
import {
  contrastRatio,
  DEFAULT_THEME,
  MAX_SCALE,
  normalizeTheme,
  parseThemeText,
  PRESETS,
  PRESS_THEME,
  serializeTheme,
  themeContrast,
  themeToCss,
} from "./theme";

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#8c2f1f", "#8c2f1f")).toBeCloseTo(1, 5);
  });

  it("rates the Press ink/paper pair as high contrast", () => {
    expect(contrastRatio(PRESS_THEME.ink, PRESS_THEME.paper)).toBeGreaterThan(7);
  });
});

describe("themeToCss", () => {
  it("emits the theme's colours as custom properties", () => {
    const css = themeToCss(DEFAULT_THEME);
    expect(css).toContain(`--rs-paper: ${DEFAULT_THEME.paper}`);
    expect(css).toContain(`--rs-accent: ${DEFAULT_THEME.accent}`);
  });

  it("targets the rich-text node classes the editor emits", () => {
    const css = themeToCss(DEFAULT_THEME);
    for (const selector of [".keyword-ref", ".article-ref", ".callout", ".callout-label"]) {
      expect(css).toContain(selector);
    }
  });

  it("appends author custom CSS last", () => {
    const css = themeToCss({ ...DEFAULT_THEME, customCss: ".callout{border-left-width:9px}" });
    expect(css.trimEnd().endsWith(".callout{border-left-width:9px}")).toBe(true);
  });

  it("varies the keyword treatment by mode", () => {
    expect(themeToCss({ ...DEFAULT_THEME, keywordMode: "tooltip" })).toContain("cursor: help");
    expect(themeToCss({ ...DEFAULT_THEME, keywordMode: "glossary" })).toContain(
      "font-variant: small-caps",
    );
    expect(themeToCss({ ...DEFAULT_THEME, keywordMode: "plain" })).toContain(
      ".keyword-ref { font-weight: inherit; }",
    );
  });

  it("emits the banded-cover rule only for that cover style", () => {
    expect(themeToCss({ ...DEFAULT_THEME, cover: "banded" })).toContain(".rs-cover-banded {");
  });
});

describe("normalizeTheme", () => {
  it("fills every field from the default when given junk", () => {
    expect(normalizeTheme(null)).toEqual({ ...DEFAULT_THEME, name: "Custom" });
    expect(normalizeTheme({ paper: "not-a-colour", scale: "huge" })).toMatchObject({
      paper: DEFAULT_THEME.paper,
      scale: DEFAULT_THEME.scale,
    });
  });

  it("keeps valid fields and clamps the scale", () => {
    const t = normalizeTheme({ ...PRESETS[1], scale: 9 });
    expect(t.accent).toBe(PRESETS[1].accent);
    expect(t.keywordMode).toBe(PRESETS[1].keywordMode);
    expect(t.scale).toBe(MAX_SCALE);
  });

  it("round-trips through serialize / parse", () => {
    expect(parseThemeText(serializeTheme(PRESETS[2]))).toEqual(PRESETS[2]);
  });

  it("rejects non-JSON text", () => {
    expect(() => parseThemeText("<not json>")).toThrow();
  });
});

describe("themeContrast", () => {
  it("passes the Press preset and fails a pale accent", () => {
    expect(themeContrast(PRESS_THEME).ok).toBe(true);
    expect(themeContrast({ ...PRESS_THEME, accent: "#e8d9c8" }).ok).toBe(false);
  });
});
