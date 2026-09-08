import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import type { ImageWrap } from "../../../../core/schema/ruleset";
import { ImageBlockView } from "./ImageBlockView";

export interface ImageBlockAttributes {
  imageId: string | null;
  width: number | null;
  wrap: ImageWrap;
  alt: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    imageBlock: {
      insertImageBlock: (attributes: ImageBlockAttributes) => ReturnType;
    };
  }
}

/**
 * A block-level, atomic image node. Block (not inline) because CSS `float`
 * needs a block-level box to wrap surrounding paragraphs around — the standard
 * approach for floating images in ProseMirror.
 *
 * `width`/`wrap` are node attrs, frozen at whatever they were last set to —
 * never re-derived from the image's natural size — so layout survives even if
 * the referenced blob (in `core/storage/imageStorage`) goes missing.
 */
export const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      imageId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-image-id") || null,
        renderHTML: (attributes) =>
          attributes.imageId ? { "data-image-id": attributes.imageId } : {},
      },
      width: {
        default: null,
        parseHTML: (element) => {
          const value = element.getAttribute("data-width");
          return value ? Number(value) : null;
        },
        renderHTML: (attributes) =>
          attributes.width ? { "data-width": String(attributes.width) } : {},
      },
      wrap: {
        default: "none",
        parseHTML: (element) => element.getAttribute("data-wrap") || "none",
        renderHTML: (attributes) => ({ "data-wrap": attributes.wrap as ImageWrap }),
      },
      alt: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-alt") || "",
        renderHTML: (attributes) => (attributes.alt ? { "data-alt": attributes.alt } : {}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "img[data-image-id]" }];
  },

  // Static markup, matching the KeywordRef/ArticleRef convention, for whenever
  // a standalone-HTML export pipeline is built. `src` is intentionally left
  // empty here — there's no way to resolve a blob URL outside the editor's
  // running IndexedDB session, so a future exporter must inline/copy the blob.
  renderHTML({ node, HTMLAttributes }) {
    return [
      "img",
      mergeAttributes(HTMLAttributes, {
        class: `image-block image-block--${node.attrs.wrap as ImageWrap}`,
        style: node.attrs.width ? `width:${node.attrs.width as number}px` : undefined,
        alt: (node.attrs.alt as string) || "",
      }),
    ];
  },

  addCommands() {
    return {
      insertImageBlock:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: attributes }),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(ImageBlockView);
  },
});
