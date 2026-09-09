import type { ExportTheme } from "../../../core/export/theme";

/** A tiny page-shaped preview of a theme's paper / ink / accent colours. */
export function ThemeSwatch({ theme, size = 52 }: { theme: ExportTheme; size?: number }) {
  return (
    <span
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 3,
        width: Math.round(size * 1.4),
        height: size,
        padding: 7,
        background: theme.paper,
        border: "1px solid rgba(0,0,0,0.18)",
      }}
    >
      <span style={{ height: 6, width: "70%", background: theme.accent }} />
      <span style={{ height: 3, background: theme.ink }} />
      <span style={{ height: 3, width: "92%", background: theme.ink }} />
      <span style={{ height: 2, width: "40%", marginTop: "auto", background: theme.accent }} />
    </span>
  );
}
