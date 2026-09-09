import { Button } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import {
  ACCENT_CONTRAST_MIN,
  BODY_CONTRAST_MIN,
  COVER_STYLES,
  DIVIDER_STYLES,
  type ExportTheme,
  FONT_KEYS,
  FONT_LABELS,
  HEADING_CASES,
  KEYWORD_MODES,
  MAX_SCALE,
  MIN_SCALE,
  parseThemeText,
  PRESETS,
  serializeTheme,
  TABLE_STYLES,
  themeContrast,
  THEME_FILE_EXTENSION,
} from "../../../core/export/theme";
import { useRuleset } from "../state/useCurrentRuleset";
import { useEditorPaths } from "../state/useEditorPaths";
import { buildRulebookHtml } from "./buildRulebookHtml";
import { downloadFile } from "./download";
import { useExportCtx } from "./exportContext";
import classes from "./exportPage.module.css";
import { PreviewFrame } from "./PreviewFrame";
import { ThemeSwatch } from "./ThemeSwatch";

const PAPER_SWATCHES = ["#f5efe2", "#ffffff", "#e9e4d6", "#14161a"];
const INK_SWATCHES = ["#241f19", "#2b2f33", "#0f0f0f", "#e8e6e1"];
const ACCENT_SWATCHES = ["#8c2f1f", "#1f4f6b", "#d9a13b", "#4a6b3f"];

const KEYWORD_LABELS: Record<(typeof KEYWORD_MODES)[number], string> = {
  tooltip: "Tooltip",
  inline: "Inline def",
  glossary: "Small caps",
  plain: "Plain",
};

export function ThemeWorkspacePage() {
  const ruleset = useRuleset();
  const paths = useEditorPaths();
  const { theme, setTheme, options, customPresets, saveCustomPreset } = useExportCtx();

  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const patch = (p: Partial<ExportTheme>) =>
    setTheme((t) => ({ ...t, ...p, name: "name" in p ? (p.name ?? t.name) : "Custom" }));

  useEffect(() => {
    if (!ruleset) return;
    let cancelled = false;
    buildRulebookHtml(ruleset, { ...options, mode: "rulebook", format: "html" }, theme)
      .then((html) => {
        if (!cancelled) setPreviewHtml(html);
      })
      .catch(() => {
        if (!cancelled) setPreviewHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ruleset, options, theme]);

  if (!ruleset) return null;

  const contrast = themeContrast(theme);
  const presetGallery: ExportTheme[] = [...PRESETS, ...customPresets];

  const onImport = async (file: File) => {
    setError(null);
    try {
      setTheme(parseThemeText(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that theme file.");
    }
  };

  return (
    <div className={classes.page}>
      <div className={classes.config}>
        <header className={classes.head}>
          <div>
            <div className={classes.kicker}>Theme workspace</div>
            <input
              className={classes.themeName}
              value={theme.name}
              onChange={(e) => patch({ name: e.currentTarget.value })}
              aria-label="Theme name"
            />
          </div>
          <Button component={Link} to={paths.export} variant="subtle" color="gray" size="xs">
            Back to export
          </Button>
        </header>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Start from</div>
          <div className={classes.presets}>
            {presetGallery.map((preset, i) => (
              <button
                key={`${preset.name}-${i}`}
                type="button"
                className={
                  theme.name === preset.name
                    ? `${classes.preset} ${classes.presetOn}`
                    : classes.preset
                }
                onClick={() => setTheme({ ...preset })}
              >
                <ThemeSwatch theme={preset} />
                <span className={classes.presetName}>{preset.name}</span>
              </button>
            ))}
          </div>
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Ink &amp; paper</div>
          <SwatchRow
            label="Paper"
            colors={PAPER_SWATCHES}
            value={theme.paper}
            onPick={(paper) => patch({ paper })}
          />
          <SwatchRow
            label="Ink"
            colors={INK_SWATCHES}
            value={theme.ink}
            onPick={(ink) => patch({ ink })}
          />
          <SwatchRow
            label="Accent"
            colors={ACCENT_SWATCHES}
            value={theme.accent}
            onPick={(accent) => patch({ accent })}
          />
          <div className={contrast.ok ? classes.contrastOk : classes.contrastWarn}>
            Contrast {contrast.body.toFixed(1)}:1 body, {contrast.accent.toFixed(1)}:1 accent
            {contrast.ok
              ? " — prints and reads cleanly."
              : ` — aim for ≥ ${BODY_CONTRAST_MIN}:1 body and ≥ ${ACCENT_CONTRAST_MIN}:1 accent. Darken the ink or accent.`}
          </div>
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Type</div>
          <Segmented
            label="Headings"
            options={FONT_KEYS.map((k) => ({ value: k, label: FONT_LABELS[k] }))}
            value={theme.headingFont}
            onChange={(headingFont) => patch({ headingFont })}
          />
          <Segmented
            label="Body"
            options={FONT_KEYS.map((k) => ({ value: k, label: FONT_LABELS[k] }))}
            value={theme.bodyFont}
            onChange={(bodyFont) => patch({ bodyFont })}
          />
          <label className={classes.knob}>
            <span>Scale — {Math.round(17 * theme.scale)}px body</span>
            <input
              type="range"
              min={MIN_SCALE}
              max={MAX_SCALE}
              step={0.05}
              value={theme.scale}
              onChange={(e) => patch({ scale: Number(e.currentTarget.value) })}
            />
          </label>
          <Segmented
            label="Heading case"
            options={HEADING_CASES.map((c) => ({
              value: c,
              label: c === "upper" ? "Uppercase" : "Sentence",
            }))}
            value={theme.headingCase}
            onChange={(headingCase) => patch({ headingCase })}
          />
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Cover</div>
          <Segmented
            options={COVER_STYLES.map((c) => ({
              value: c,
              label: c[0].toUpperCase() + c.slice(1),
            }))}
            value={theme.cover}
            onChange={(cover) => patch({ cover })}
          />
          <label className={classes.knobCheck}>
            <input
              type="checkbox"
              checked={theme.showSubtitle}
              onChange={(e) => patch({ showSubtitle: e.currentTarget.checked })}
            />
            <span>Show the author line on the cover</span>
          </label>
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Keywords</div>
          <Segmented
            options={KEYWORD_MODES.map((m) => ({ value: m, label: KEYWORD_LABELS[m] }))}
            value={theme.keywordMode}
            onChange={(keywordMode) => patch({ keywordMode })}
          />
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Dividers</div>
          <Segmented
            options={DIVIDER_STYLES.map((d) => ({
              value: d,
              label: d[0].toUpperCase() + d.slice(1),
            }))}
            value={theme.divider}
            onChange={(divider) => patch({ divider })}
          />
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Tables</div>
          <Segmented
            options={TABLE_STYLES.map((t) => ({
              value: t,
              label: t[0].toUpperCase() + t.slice(1),
            }))}
            value={theme.table}
            onChange={(table) => patch({ table })}
          />
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Custom CSS</div>
          <textarea
            className={classes.cssArea}
            rows={5}
            value={theme.customCss}
            spellCheck={false}
            onChange={(e) => patch({ customCss: e.currentTarget.value })}
          />
          <div className={classes.themeHint}>
            Appended last, so it wins over every control above. Selectors match the exported markup
            — <code>.keyword-ref</code>, <code>.callout</code>, <code>.article-ref</code>.
          </div>
        </section>

        <footer className={classes.foot}>
          <span className={classes.estimate}>
            <button
              type="button"
              className={classes.linkBtn}
              onClick={() => fileInput.current?.click()}
            >
              Import…
            </button>
            <span className={classes.dot}>·</span>
            <button
              type="button"
              className={classes.linkBtn}
              onClick={() =>
                downloadFile(
                  `${theme.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "theme"}${THEME_FILE_EXTENSION}`,
                  serializeTheme(theme),
                  "application/json",
                )
              }
            >
              Export .json
            </button>
            <input
              ref={fileInput}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.currentTarget.files?.[0];
                e.currentTarget.value = "";
                if (file) void onImport(file);
              }}
            />
            {error && <span className={classes.error}> {error}</span>}
          </span>
          <div className={classes.footActions}>
            <Button
              size="sm"
              variant="default"
              onClick={() => saveCustomPreset({ ...theme, name: theme.name.trim() || "Custom" })}
            >
              Save as preset
            </Button>
            <Button component={Link} to={paths.export} size="sm">
              Use this theme
            </Button>
          </div>
        </footer>
      </div>

      <aside className={classes.preview}>
        <div className={classes.previewBar}>Live preview</div>
        <PreviewFrame html={previewHtml} />
      </aside>
    </div>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className={classes.segWrap}>
      {label && <span className={classes.segLabel}>{label}</span>}
      <div className={classes.seg}>
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={
              opt.value === value ? `${classes.segOpt} ${classes.segOptOn}` : classes.segOpt
            }
            onClick={() => onChange(opt.value)}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function SwatchRow({
  label,
  colors,
  value,
  onPick,
}: {
  label: string;
  colors: string[];
  value: string;
  onPick: (color: string) => void;
}) {
  return (
    <div className={classes.swatchRow}>
      <span className={classes.swatchLabel}>{label}</span>
      {colors.map((color) => (
        <button
          key={color}
          type="button"
          aria-label={`${label} ${color}`}
          className={
            color.toLowerCase() === value.toLowerCase()
              ? `${classes.swatch} ${classes.swatchOn}`
              : classes.swatch
          }
          style={{ background: color }}
          onClick={() => onPick(color)}
        />
      ))}
      <input
        type="color"
        className={classes.colorInput}
        value={value}
        onChange={(e) => onPick(e.currentTarget.value)}
        aria-label={`${label} custom colour`}
      />
      <span className={classes.swatchValue}>{value}</span>
    </div>
  );
}
