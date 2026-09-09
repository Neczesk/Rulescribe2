import { Button } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { countEnabledExtras } from "../../../core/export/manifest";
import { buildOutline, defaultIncludedIds } from "../../../core/export/outline";
import {
  type ExportFormat,
  type ExportMode,
  EXTRA_KEYS,
  EXTRA_LABELS,
  formatsForMode,
} from "../../../core/export/options";
import {
  type ExportTheme,
  parseThemeText,
  PRESETS,
  serializeTheme,
  THEME_FILE_EXTENSION,
} from "../../../core/export/theme";
import {
  buildStatsContext,
  blockingIssues,
  runConsistencyChecks,
  type StatsIssue,
} from "../../../core/stats";
import { gatherStatsExtras } from "../stats/gatherStatsExtras";
import { useRuleset } from "../state/useCurrentRuleset";
import { useEditorPaths } from "../state/useEditorPaths";
import { downloadFile } from "./download";
import { useExportCtx } from "./exportContext";
import classes from "./exportPage.module.css";
import { PreviewFrame } from "./PreviewFrame";
import { buildExportDoc, isDocFormat, runExport } from "./runExport";
import { ThemeSwatch } from "./ThemeSwatch";

const MODE_CARDS: { mode: ExportMode; title: string; tag: string; blurb: string }[] = [
  {
    mode: "draft",
    title: "Draft",
    tag: "Fixed layout",
    blurb:
      "For playtesters and collaborators. Neutral type, author notes printed inline, numbered paragraphs so feedback can cite §2.1 ¶4.",
  },
  {
    mode: "rulebook",
    title: "Rulebook",
    tag: "Themeable",
    blurb:
      "The playable book. Notes stripped, every visual choice yours; the defaults are already publishable.",
  },
];

const FORMAT_LABELS: Record<ExportFormat, { label: string; hint: string }> = {
  html: {
    label: "Standalone HTML",
    hint: "One file. Searchable, cross-linked, works offline once fonts are cached.",
  },
  print: {
    label: "Print",
    hint: "Paginated, ready for the browser's print dialog (open, then Ctrl/Cmd-P).",
  },
  zip: {
    label: "Document .zip",
    hint: "The HTML plus every image and diagram, the metadata, and your original JSON.",
  },
};

export function ExportConfigPage() {
  const ruleset = useRuleset();
  const paths = useEditorPaths();
  const { theme, setTheme, options, setOptions, customPresets } = useExportCtx();

  const outline = ruleset ? buildOutline(ruleset) : [];

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<StatsIssue[]>([]);
  const [bypassBlocking, setBypassBlocking] = useState(false);
  const themeFileInput = useRef<HTMLInputElement>(null);

  // Consistency checks that block export — only the most severe ones
  // (`catalogue.json`'s `blockingSeverity`), and even those are a checkbox
  // away from being overridden below, never a hard stop.
  useEffect(() => {
    if (!ruleset) return;
    let cancelled = false;
    void gatherStatsExtras(ruleset).then((extras) => {
      if (cancelled) return;
      const context = buildStatsContext(ruleset, extras);
      setBlockers(blockingIssues(runConsistencyChecks(context)));
      setBypassBlocking(false);
    });
    return () => {
      cancelled = true;
    };
  }, [ruleset]);

  const formatAvailable = !!ruleset && isDocFormat(options);
  const canExport = formatAvailable && (blockers.length === 0 || bypassBlocking);

  // Genuine outside-world sync: the generator dynamic-imports the Excalidraw /
  // Mermaid renderers and reads image blobs from IndexedDB, so it's async and
  // can't be computed in render. Same carve-out as `DiagramRefView`.
  useEffect(() => {
    if (!ruleset || !formatAvailable) return;
    let cancelled = false;
    buildExportDoc(ruleset, options, theme)
      .then((html) => {
        if (!cancelled) setPreviewHtml(html);
      })
      .catch(() => {
        if (!cancelled) setPreviewHtml(null);
      });
    return () => {
      cancelled = true;
    };
  }, [ruleset, options, theme, formatAvailable]);

  if (!ruleset) return null;

  const included = new Set(options.includedIds);
  const includedCount = outline.filter((s) => included.has(s.articleId)).length;
  const extrasCount = countEnabledExtras(options.extras);
  const presetGallery: ExportTheme[] = [...PRESETS, ...customPresets];

  const setMode = (mode: ExportMode) => {
    setOptions((o) => ({
      ...o,
      mode,
      format: formatsForMode(mode)[0],
      includedIds: [...defaultIncludedIds(outline, mode)],
    }));
    setError(null);
  };

  const toggleSection = (articleId: string) => {
    setOptions((o) => {
      const next = new Set(o.includedIds);
      if (next.has(articleId)) next.delete(articleId);
      else next.add(articleId);
      return {
        ...o,
        includedIds: outline.filter((s) => next.has(s.articleId)).map((s) => s.articleId),
      };
    });
  };

  const selectAll = () =>
    setOptions((o) => ({ ...o, includedIds: outline.map((s) => s.articleId) }));

  const onImportTheme = async (file: File) => {
    setError(null);
    try {
      setTheme(parseThemeText(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read that theme file.");
    }
  };

  const onExport = async () => {
    setBusy(true);
    setError(null);
    try {
      await runExport(ruleset, options, theme);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={classes.page}>
      <div className={classes.config}>
        <header className={classes.head}>
          <div>
            <div className={classes.kicker}>Export</div>
            <h1 className={classes.title}>{ruleset.metadata.title || "Untitled ruleset"}</h1>
            <div className={classes.meta}>
              {outline.length} sections · {Object.keys(ruleset.registry.keywords).length} keywords ·{" "}
              {Object.keys(ruleset.registry.diagrams).length} diagrams
            </div>
          </div>
          <Button component={Link} to={paths.root} variant="subtle" color="gray" size="xs">
            Close
          </Button>
        </header>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Mode</div>
          <div className={classes.cards}>
            {MODE_CARDS.map((card) => (
              <button
                key={card.mode}
                type="button"
                className={
                  options.mode === card.mode ? `${classes.card} ${classes.cardOn}` : classes.card
                }
                onClick={() => setMode(card.mode)}
              >
                <div className={classes.cardTop}>
                  <span className={classes.cardTitle}>{card.title}</span>
                  <span className={classes.tag}>{card.tag}</span>
                </div>
                <div className={classes.cardBlurb}>{card.blurb}</div>
              </button>
            ))}
          </div>
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>Format</div>
          <div className={classes.formats}>
            {formatsForMode(options.mode).map((format) => (
              <button
                key={format}
                type="button"
                className={
                  options.format === format
                    ? `${classes.format} ${classes.formatOn}`
                    : classes.format
                }
                onClick={() => {
                  setOptions((o) => ({ ...o, format }));
                  setError(null);
                }}
              >
                <span className={classes.formatTitle}>{FORMAT_LABELS[format].label}</span>
                <span className={classes.formatHint}>{FORMAT_LABELS[format].hint}</span>
              </button>
            ))}
          </div>
        </section>

        {options.mode === "rulebook" && (
          <section className={classes.block}>
            <div className={classes.blockLabel}>
              Theme
              <Link className={classes.linkBtn} to={paths.exportTheme}>
                Customize…
              </Link>
            </div>
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
            <div className={classes.themeFileRow}>
              <button
                type="button"
                className={classes.linkBtn}
                onClick={() => themeFileInput.current?.click()}
              >
                Import theme…
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
                Export this theme
              </button>
              <input
                ref={themeFileInput}
                type="file"
                accept=".json,application/json"
                hidden
                onChange={(e) => {
                  const file = e.currentTarget.files?.[0];
                  e.currentTarget.value = "";
                  if (file) void onImportTheme(file);
                }}
              />
            </div>
            <div className={classes.themeHint}>
              A theme is a small <code>.rulescribe-theme.json</code> — shareable, and it never
              touches your ruleset.
            </div>
          </section>
        )}

        {options.mode === "draft" && (
          <section className={classes.block}>
            <div className={classes.blockLabel}>Draft layout</div>
            <div className={classes.draftKnobs}>
              <label className={classes.knob}>
                <span>Paper</span>
                <select
                  className={classes.select}
                  value={options.draft.paper}
                  onChange={(e) => {
                    const paper = e.currentTarget.value as "letter" | "a4";
                    setOptions((o) => ({ ...o, draft: { ...o.draft, paper } }));
                  }}
                >
                  <option value="letter">Letter</option>
                  <option value="a4">A4</option>
                </select>
              </label>
              <label className={classes.knob}>
                <span>Body size</span>
                <select
                  className={classes.select}
                  value={options.draft.bodyPt}
                  onChange={(e) => {
                    const bodyPt = Number(e.currentTarget.value) as 11 | 12 | 14;
                    setOptions((o) => ({ ...o, draft: { ...o.draft, bodyPt } }));
                  }}
                >
                  <option value={11}>11 pt</option>
                  <option value={12}>12 pt</option>
                  <option value={14}>14 pt</option>
                </select>
              </label>
              <label className={classes.knobCheck}>
                <input
                  type="checkbox"
                  checked={options.draft.paragraphNumbers}
                  onChange={(e) => {
                    const paragraphNumbers = e.currentTarget.checked;
                    setOptions((o) => ({ ...o, draft: { ...o.draft, paragraphNumbers } }));
                  }}
                />
                <span>¶ paragraph numbers</span>
              </label>
            </div>
          </section>
        )}

        <section className={classes.block}>
          <div className={classes.blockLabel}>
            Include{" "}
            <span className={classes.blockNote}>
              — {includedCount} of {outline.length} sections
            </span>
            <button type="button" className={classes.linkBtn} onClick={selectAll}>
              Select all
            </button>
          </div>
          <div className={classes.sectionList}>
            {outline.map((section) => (
              <label
                key={section.articleId}
                className={classes.sectionRow}
                style={{ paddingLeft: `calc(${section.depth} * 16px + 8px)` }}
              >
                <input
                  type="checkbox"
                  checked={included.has(section.articleId)}
                  onChange={() => toggleSection(section.articleId)}
                />
                <span className={classes.sectionNum}>{section.number}</span>
                <span className={classes.sectionTitle}>{section.title}</span>
                {section.isNotes && <span className={classes.tagNeutral}>notes-only</span>}
                <span className={classes.sectionWords}>{section.words} w</span>
              </label>
            ))}
            <div className={classes.sectionFoot}>
              Order follows the structure tree. Reorder there, not here.
            </div>
          </div>
        </section>

        <section className={classes.block}>
          <div className={classes.blockLabel}>
            Generated matter <span className={classes.blockNote}>— off unless you ask for it</span>
          </div>
          <div className={classes.extras}>
            {EXTRA_KEYS.map((key) => (
              <label key={key} className={classes.extraRow}>
                <input
                  type="checkbox"
                  checked={options.extras[key]}
                  onChange={(e) => {
                    const on = e.currentTarget.checked;
                    setOptions((o) => ({ ...o, extras: { ...o.extras, [key]: on } }));
                  }}
                />
                <span>
                  <span className={classes.extraTitle}>{EXTRA_LABELS[key].label}</span>
                  <span className={classes.extraHint}>{EXTRA_LABELS[key].hint}</span>
                </span>
              </label>
            ))}
          </div>
        </section>

        {formatAvailable && blockers.length > 0 && (
          <div className={classes.blockingBox}>
            <div className={classes.blockingTitle}>
              {blockers.length} consistency {blockers.length === 1 ? "problem" : "problems"} will
              affect this export
            </div>
            <ul className={classes.blockingList}>
              {blockers.map((issue) => (
                <li key={issue.code}>
                  {issue.title} — {issue.detail}
                </li>
              ))}
            </ul>
            <label className={classes.blockingCheck}>
              <input
                type="checkbox"
                checked={bypassBlocking}
                onChange={(e) => setBypassBlocking(e.currentTarget.checked)}
              />
              Export anyway despite these problems
            </label>
          </div>
        )}

        <footer className={classes.foot}>
          <span className={classes.estimate}>
            {!formatAvailable
              ? "This format isn't wired up yet — coming in a later phase."
              : options.mode === "draft"
                ? `${includedCount} sections · notes in${options.draft.paragraphNumbers ? " · ¶ numbers" : ""}`
                : `${includedCount} sections · theme “${theme.name}”${
                    extrasCount ? ` · ${extrasCount} generated` : ""
                  } · one .html`}
          </span>
          <div className={classes.footActions}>
            {error && <span className={classes.error}>{error}</span>}
            <Button component={Link} to={paths.root} variant="default" size="sm">
              Cancel
            </Button>
            <Button size="sm" onClick={onExport} disabled={!canExport} loading={busy}>
              {options.mode === "rulebook" ? "Export rulebook" : "Export draft"}
            </Button>
          </div>
        </footer>
      </div>

      <aside className={classes.preview}>
        <div className={classes.previewBar}>Live preview</div>
        <PreviewFrame html={formatAvailable ? previewHtml : null} />
      </aside>
    </div>
  );
}
