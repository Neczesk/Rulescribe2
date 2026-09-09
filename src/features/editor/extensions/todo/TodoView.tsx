import { Textarea } from "@mantine/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useEffect, useRef } from "react";
import classes from "./Todo.module.css";

export function TodoView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const resolved = Boolean(node.attrs.resolved);
  const text = (node.attrs.text as string) ?? "";
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Freshly-inserted (empty, open) TODOs get focus so the author can type the
  // note straight away — the toolbar button and the `TODO ` input rule both
  // leave the node empty.
  useEffect(() => {
    if (!resolved && text === "") textareaRef.current?.focus();
  }, [resolved, text]);

  return (
    <NodeViewWrapper>
      {/* Everything below is non-editable chrome — ProseMirror must not treat
          clicks/selection inside it as document editing. */}
      <div
        className={resolved ? `${classes.todo} ${classes.resolved}` : classes.todo}
        contentEditable={false}
        data-resolved={resolved ? "true" : undefined}
      >
        <button
          type="button"
          className={classes.check}
          aria-label={resolved ? "Reopen TODO" : "Resolve TODO"}
          onClick={() => updateAttributes({ resolved: !resolved })}
        >
          {resolved && (
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M5 12.5l4 4 10-10" />
            </svg>
          )}
        </button>
        <div className={classes.body}>
          <div className={classes.label}>TODO</div>
          {resolved ? (
            <div className={classes.done}>{text || " "}</div>
          ) : (
            <Textarea
              ref={textareaRef}
              variant="unstyled"
              autosize
              minRows={1}
              placeholder="Describe what still needs doing…"
              classNames={{ input: classes.input }}
              value={text}
              onChange={(event) => updateAttributes({ text: event.currentTarget.value })}
            />
          )}
        </div>
        <button
          type="button"
          className={classes.remove}
          aria-label="Remove TODO"
          onClick={() => deleteNode()}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>
    </NodeViewWrapper>
  );
}
