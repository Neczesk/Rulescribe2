import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { ImageWrap } from "../../../../core/schema/ruleset";
import { currentRulesetStore } from "../../../../core/state/currentRuleset";
import { DiagramRefView } from "./DiagramRefView";

export interface DiagramRefAttributes {
  diagramId: string | null;
  displayScale: number;
  caption: string;
  wrap: ImageWrap;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    diagramRef: {
      insertDiagramRef: (attributes: DiagramRefAttributes) => ReturnType;
    };
  }
}

/**
 * A block-level, atomic diagram reference — same "block, not inline" reasoning
 * as `ImageBlock` (CSS `float`/wrap needs a block-level box). Content lives
 * once in `registry.diagrams[diagramId]`; this node only stores an id plus
 * presentation (`displayScale`, `caption`, `wrap`), so editing the diagram
 * anywhere it's referenced is reflected everywhere else.
 */
export const DiagramRef = Node.create({
  name: "diagramRef",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      diagramId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-diagram-id") || null,
        renderHTML: (attributes) =>
          attributes.diagramId ? { "data-diagram-id": attributes.diagramId } : {},
      },
      displayScale: {
        default: 1,
        parseHTML: (element) => Number(element.getAttribute("data-display-scale")) || 1,
        renderHTML: (attributes) => ({ "data-display-scale": String(attributes.displayScale) }),
      },
      caption: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-caption") || "",
        renderHTML: (attributes) =>
          attributes.caption ? { "data-caption": attributes.caption } : {},
      },
      wrap: {
        default: "none",
        parseHTML: (element) => element.getAttribute("data-wrap") || "none",
        renderHTML: (attributes) => ({ "data-wrap": attributes.wrap as ImageWrap }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "figure[data-diagram-id]" }];
  },

  // Static placeholder markup, matching ImageBlock/KeywordRef/ArticleRef's
  // convention for whenever a standalone-HTML export pipeline is built. The
  // diagram's SVG isn't inlined here — there's no export pipeline for
  // anything else yet either, so a future exporter must resolve it (it can,
  // unlike images, since scene/source is fully available in the registry).
  renderHTML({ node, HTMLAttributes }) {
    const diagramId = node.attrs.diagramId as string | null;
    const kind = diagramId
      ? currentRulesetStore.getState().ruleset?.registry.diagrams[diagramId]?.kind
      : undefined;
    const caption = node.attrs.caption as string;
    const figureAttrs = mergeAttributes(HTMLAttributes, {
      class: `diagram-ref diagram-ref--${node.attrs.wrap as ImageWrap}`,
      "data-kind": kind,
    });
    return caption ? ["figure", figureAttrs, ["figcaption", {}, caption]] : ["figure", figureAttrs];
  },

  addCommands() {
    return {
      insertDiagramRef:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(DiagramRefView);
  },
});
