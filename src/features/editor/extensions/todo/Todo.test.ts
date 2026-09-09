import { generateHTML } from "@tiptap/html";
import type { JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { Todo } from "./Todo";

const doc = (todo: JSONContent): JSONContent => ({ type: "doc", content: [todo] });

describe("Todo node — renderHTML", () => {
  it("emits static open markup with a label and the text attr", () => {
    const html = generateHTML(
      doc({ type: "todo", attrs: { todoId: "t1", text: "confirm this", resolved: false } }),
      [StarterKit, Todo],
    );
    expect(html).toContain('class="todo"');
    expect(html).toContain('data-todo-id="t1"');
    expect(html).toContain(">TODO<");
    expect(html).toContain("confirm this");
    expect(html).not.toContain("todo--resolved");
  });

  it("emits the resolved variant class when resolved", () => {
    const html = generateHTML(
      doc({ type: "todo", attrs: { todoId: "t2", text: "done", resolved: true } }),
      [StarterKit, Todo],
    );
    expect(html).toContain("todo--resolved");
  });
});
