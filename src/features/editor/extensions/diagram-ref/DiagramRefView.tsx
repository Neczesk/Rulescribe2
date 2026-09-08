import { Button, Popover, SegmentedControl, Stack, TextInput } from "@mantine/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { DiagramEntry } from "../../../../core/schema/diagram";
import { useRuleset } from "../../state/useCurrentRuleset";
import classes from "./DiagramRefView.module.css";
import { renderExcalidrawSvg } from "./renderExcalidrawSvg";
import { renderMermaidSvg } from "./renderMermaidSvg";

const MIN_SCALE = 0.25;
const MAX_SCALE = 3;
const BASE_PX = 480;

const ExcalidrawEditModal = lazy(() =>
  import("./diagramModals/ExcalidrawEditModal").then((m) => ({ default: m.ExcalidrawEditModal })),
);
const MermaidEditModal = lazy(() =>
  import("./diagramModals/MermaidEditModal").then((m) => ({ default: m.MermaidEditModal })),
);

/**
 * Renders `entry` to SVG on demand (never persisted — regenerated whenever
 * the entry's own content changes) via a dynamic import of whichever backend
 * the entry needs. This is a genuine outside-world sync (invoking an
 * external rendering library), the case CLAUDE.md's `useEffect` carve-out
 * is meant for.
 */
function DiagramPreview({ entry }: { entry: DiagramEntry }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const render = async () => {
      if (entry.kind === "excalidraw") {
        const svg = await renderExcalidrawSvg(entry.scene);
        if (cancelled || !containerRef.current) return;
        containerRef.current.replaceChildren(svg);
      } else {
        const svg = await renderMermaidSvg(entry.source, `diagram-${entry.id}`);
        if (cancelled || !containerRef.current) return;
        containerRef.current.innerHTML = svg;
      }
      if (!cancelled) setFailed(false);
    };
    render().catch(() => {
      if (!cancelled) setFailed(true);
    });
    return () => {
      cancelled = true;
    };
  }, [entry]);

  if (failed) {
    return (
      <div className={classes.placeholder} contentEditable={false}>
        Diagram failed to render
      </div>
    );
  }

  return <div ref={containerRef} className={classes.diagram} contentEditable={false} />;
}

export function DiagramRefView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [opened, setOpened] = useState(false);
  const [editing, setEditing] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startScale: number } | null>(null);
  const [dragScale, setDragScale] = useState<number | null>(null);
  const ruleset = useRuleset();

  const diagramId = node.attrs.diagramId as string | null;
  const entry = diagramId ? ruleset?.registry.diagrams[diagramId] : undefined;
  const scale = dragScale ?? (node.attrs.displayScale as number);
  const wrap = node.attrs.wrap as "none" | "left" | "right";
  const caption = node.attrs.caption as string;

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragState.current = { startX: event.clientX, startScale: scale };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta =
      wrap === "left"
        ? dragState.current.startX - event.clientX
        : event.clientX - dragState.current.startX;
    const next = Math.min(
      MAX_SCALE,
      Math.max(MIN_SCALE, dragState.current.startScale + delta / BASE_PX),
    );
    setDragScale(next);
  };

  const onResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = null;
    if (dragScale !== null) {
      updateAttributes({ displayScale: dragScale });
      setDragScale(null);
    }
  };

  const EditModal = entry?.kind === "excalidraw" ? ExcalidrawEditModal : MermaidEditModal;

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef}
      className="diagram-ref-wrapper"
      data-wrap={wrap}
      style={{ width: `${BASE_PX * scale}px` }}
    >
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        withArrow
        shadow="md"
        trapFocus
      >
        <Popover.Target>
          <button
            type="button"
            className={classes.trigger}
            contentEditable={false}
            onClick={() => setOpened((value) => !value)}
            aria-label="Diagram options"
          >
            ⋯
          </button>
        </Popover.Target>
        <Popover.Dropdown>
          <Stack gap="sm">
            <SegmentedControl
              size="xs"
              value={wrap}
              onChange={(value) => updateAttributes({ wrap: value })}
              data={[
                { label: "No wrap", value: "none" },
                { label: "Wrap left", value: "left" },
                { label: "Wrap right", value: "right" },
              ]}
            />
            <TextInput
              size="xs"
              label="Caption"
              value={caption}
              onChange={(event) => updateAttributes({ caption: event.currentTarget.value })}
            />
            <Button size="xs" variant="subtle" color="red" onClick={() => deleteNode()}>
              Remove reference
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {entry ? (
        <div onClick={() => setEditing(true)} role="presentation">
          <DiagramPreview key={entry.id} entry={entry} />
        </div>
      ) : (
        <div className={classes.placeholder} contentEditable={false}>
          Diagram unavailable
        </div>
      )}

      {caption && <div className={classes.caption}>{caption}</div>}

      <div
        className={classes.resizeHandle}
        contentEditable={false}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      />

      {editing && entry && diagramId && (
        <Suspense fallback={null}>
          <EditModal diagramId={diagramId} onClose={() => setEditing(false)} />
        </Suspense>
      )}
    </NodeViewWrapper>
  );
}
