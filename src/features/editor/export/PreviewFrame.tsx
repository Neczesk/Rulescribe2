import { useEffect, useRef } from "react";
import classes from "./exportPage.module.css";

interface PreviewFrameProps {
  /** A complete HTML document, or `null` when this selection has no preview yet. */
  html: string | null;
}

/**
 * Renders the *real* generator output in an isolated `<iframe>`. The document
 * is handed over as a Blob URL (revoked when it changes) rather than `srcdoc`,
 * so its `<link>` webfonts and same-origin anchors behave exactly as they will
 * in the downloaded file. The URL is assigned to the iframe imperatively — no
 * component state — so a new preview doesn't cascade a re-render.
 */
export function PreviewFrame({ html }: PreviewFrameProps) {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame || html === null) return;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    frame.src = url;
    return () => URL.revokeObjectURL(url);
  }, [html]);

  return (
    <div className={classes.previewBody}>
      <iframe
        ref={frameRef}
        className={classes.previewFrame}
        title="Export preview"
        hidden={html === null}
      />
      {html === null && (
        <div className={classes.previewEmpty}>
          Preview appears here once a previewable format is selected.
        </div>
      )}
    </div>
  );
}
