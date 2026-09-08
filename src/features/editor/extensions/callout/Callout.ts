import { mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { CalloutView } from "./CalloutView";

export interface CalloutAttributes {
  label: string;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    callout: {
      setCallout: (attributes?: Partial<CalloutAttributes>) => ReturnType;
      toggleCallout: (attributes?: Partial<CalloutAttributes>) => ReturnType;
      unsetCallout: () => ReturnType;
    };
  }
}

const DEFAULT_LABEL = "Note";

export const Callout = Node.create({
  name: "callout",
  group: "block",
  content: "block+",
  defining: true,

  addAttributes() {
    return {
      label: {
        default: DEFAULT_LABEL,
        parseHTML: (element) =>
          element.querySelector(".callout-label")?.textContent?.trim() || DEFAULT_LABEL,
        renderHTML: () => ({}),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div.callout", contentElement: ".callout-body" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: "callout" }),
      ["div", { class: "callout-label" }, node.attrs.label ?? DEFAULT_LABEL],
      ["div", { class: "callout-body" }, 0],
    ];
  },

  addCommands() {
    return {
      setCallout:
        (attributes) =>
        ({ commands }) =>
          commands.wrapIn(this.name, attributes),
      toggleCallout:
        (attributes) =>
        ({ commands }) =>
          commands.toggleWrap(this.name, attributes),
      unsetCallout:
        () =>
        ({ commands }) =>
          commands.lift(this.name),
    };
  },

  addNodeView() {
    return ReactNodeViewRenderer(CalloutView);
  },
});
