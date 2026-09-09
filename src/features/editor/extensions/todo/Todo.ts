import { InputRule, mergeAttributes, Node } from "@tiptap/core";
import { ReactNodeViewRenderer } from "@tiptap/react";
import { shortId } from "../../../../util/nanoid";
import { TodoView } from "./TodoView";

export interface TodoAttributes {
  /** Stable id so the sidebar can list, key and re-target a specific TODO. */
  todoId: string | null;
  /** The note itself — a plain string (see the design's data model). */
  text: string;
  resolved: boolean;
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    todo: {
      /** Insert a TODO block. A missing `todoId` is minted here. */
      insertTodo: (attributes?: Partial<TodoAttributes>) => ReturnType;
    };
  }
}

/**
 * A block-level, atomic "TODO" node: a tracked, resolvable authoring note left
 * inside article prose. The note text is a plain string attr (not editable
 * child content) so the sidebar's TODOS panel can read it directly and the
 * schema migration can synthesise one from a bare `TODO` sentence.
 *
 * Two render targets, by design:
 *  - in-editor: `TodoView` (checkbox to resolve, textarea to edit, remove).
 *  - HTML export: static open/resolved markup, no editing affordances.
 */
export const Todo = Node.create({
  name: "todo",
  group: "block",
  atom: true,
  selectable: true,
  draggable: true,

  addAttributes() {
    return {
      todoId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-todo-id") || null,
        renderHTML: (attributes) =>
          attributes.todoId ? { "data-todo-id": attributes.todoId } : {},
      },
      text: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-todo-text") || "",
        renderHTML: (attributes) => (attributes.text ? { "data-todo-text": attributes.text } : {}),
      },
      resolved: {
        default: false,
        parseHTML: (element) => element.getAttribute("data-resolved") === "true",
        renderHTML: (attributes) => ({ "data-resolved": attributes.resolved ? "true" : "false" }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "div[data-todo-id]" }];
  },

  renderHTML({ node, HTMLAttributes }) {
    const resolved = Boolean(node.attrs.resolved);
    return [
      "div",
      mergeAttributes(HTMLAttributes, { class: resolved ? "todo todo--resolved" : "todo" }),
      ["span", { class: "todo-label" }, "TODO"],
      ["span", { class: "todo-text" }, (node.attrs.text as string) || ""],
    ];
  },

  renderText({ node }) {
    return `TODO: ${(node.attrs.text as string) || ""}`;
  },

  addCommands() {
    return {
      insertTodo:
        (attributes) =>
        ({ commands }) =>
          commands.insertContent({
            type: this.name,
            attrs: { todoId: shortId(), text: "", resolved: false, ...attributes },
          }),
    };
  },

  addInputRules() {
    return [
      // Typing the literal word `TODO` followed by a space turns into an empty
      // TODO block — mirroring how typing `@` starts a keyword reference. The
      // `TodoView` then focuses its textarea so the author keeps typing the
      // note. A standard input rule, so an immediate backspace undoes it.
      new InputRule({
        find: /(?:^|\s)TODO $/,
        handler: ({ range, match, chain }) => {
          const from = range.from + (match[0].startsWith(" ") ? 1 : 0);
          chain()
            .deleteRange({ from, to: range.to })
            .insertContentAt(from, {
              type: this.name,
              attrs: { todoId: shortId(), text: "", resolved: false },
            })
            .run();
        },
      }),
    ];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TodoView);
  },
});
