import type { NodeViewProps } from "@tiptap/react";
import { NodeViewContent, NodeViewWrapper } from "@tiptap/react";

export function CalloutView({ node, updateAttributes }: NodeViewProps) {
  return (
    <NodeViewWrapper className="callout">
      <input
        className="callout-label"
        contentEditable={false}
        value={node.attrs.label ?? ""}
        aria-label="Callout label"
        onChange={(event) => updateAttributes({ label: event.target.value })}
      />
      <NodeViewContent className="callout-body" />
    </NodeViewWrapper>
  );
}
