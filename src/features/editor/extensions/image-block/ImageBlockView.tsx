import { Button, Popover, SegmentedControl, Stack, TextInput } from "@mantine/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef, useState } from "react";
import { loadImageBlob } from "../../../../core/storage/imageStorage";
import classes from "./ImageBlockView.module.css";

const MIN_WIDTH = 60;
const MAX_WIDTH = 1200;

/**
 * Resolves `imageId` to an object URL (or reports it missing). Keyed by
 * `imageId` from the parent so switching images remounts this component
 * instead of needing manual state resets inside the effect.
 */
function ImagePreview({ imageId, alt }: { imageId: string; alt: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    void loadImageBlob(imageId).then((blob) => {
      if (cancelled) return;
      if (!blob) {
        setMissing(true);
        return;
      }
      url = URL.createObjectURL(blob);
      setObjectUrl(url);
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [imageId]);

  if (missing || !objectUrl) {
    return (
      <div className={classes.placeholder} contentEditable={false}>
        {missing ? "Image unavailable" : ""}
      </div>
    );
  }

  return (
    <img
      src={objectUrl}
      alt={alt}
      className={classes.image}
      draggable={false}
      onError={() => setMissing(true)}
    />
  );
}

export function ImageBlockView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [opened, setOpened] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const dragState = useRef<{ startX: number; startWidth: number } | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);

  const imageId = node.attrs.imageId as string | null;
  const width = (dragWidth ?? (node.attrs.width as number | null)) || undefined;
  const wrap = node.attrs.wrap as "none" | "left" | "right";
  const alt = node.attrs.alt as string;

  const onResizeStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startWidth = wrapperRef.current?.getBoundingClientRect().width ?? MIN_WIDTH;
    dragState.current = { startX: event.clientX, startWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onResizeMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    const delta =
      wrap === "left"
        ? dragState.current.startX - event.clientX
        : event.clientX - dragState.current.startX;
    const next = Math.min(
      MAX_WIDTH,
      Math.max(MIN_WIDTH, Math.round(dragState.current.startWidth + delta)),
    );
    setDragWidth(next);
  };

  const onResizeEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragState.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragState.current = null;
    if (dragWidth !== null) {
      updateAttributes({ width: dragWidth });
      setDragWidth(null);
    }
  };

  return (
    <NodeViewWrapper
      as="div"
      ref={wrapperRef}
      className="image-block-wrapper"
      data-wrap={wrap}
      style={width ? { width } : undefined}
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
            aria-label="Image options"
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
              label="Alt text"
              value={alt}
              onChange={(event) => updateAttributes({ alt: event.currentTarget.value })}
            />
            <Button size="xs" variant="subtle" color="red" onClick={() => deleteNode()}>
              Remove image
            </Button>
          </Stack>
        </Popover.Dropdown>
      </Popover>

      {imageId ? (
        <ImagePreview key={imageId} imageId={imageId} alt={alt} />
      ) : (
        <div className={classes.placeholder} contentEditable={false}>
          Image unavailable
        </div>
      )}

      <div
        className={classes.resizeHandle}
        contentEditable={false}
        onPointerDown={onResizeStart}
        onPointerMove={onResizeMove}
        onPointerUp={onResizeEnd}
      />
    </NodeViewWrapper>
  );
}
