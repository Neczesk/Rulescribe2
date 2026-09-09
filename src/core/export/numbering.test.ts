import { describe, expect, it } from "vitest";
import type { StructureNode } from "../schema/ruleset";
import { blockLabels, buildNumbering } from "./numbering";

const n = (articleId: string, children: StructureNode[] = []): StructureNode => ({
  articleId,
  children,
});

/**
 *  root
 *  ├─ core        → 1
 *  │  ├─ turns    → 1.1
 *  │  └─ combat   → 1.2
 *  │     └─ melee → 1.2.1
 *  └─ units       → 2
 */
const tree = (): StructureNode =>
  n("root", [n("core", [n("turns"), n("combat", [n("melee")])]), n("units")]);

describe("buildNumbering", () => {
  it("numbers by position in the structure tree", () => {
    const numbers = buildNumbering(tree());
    expect(numbers.get("core")).toBe("1");
    expect(numbers.get("turns")).toBe("1.1");
    expect(numbers.get("combat")).toBe("1.2");
    expect(numbers.get("melee")).toBe("1.2.1");
    expect(numbers.get("units")).toBe("2");
  });

  it("gives the root an empty number", () => {
    expect(buildNumbering(tree()).get("root")).toBe("");
  });

  it("skips excluded nodes without leaving a gap in their siblings", () => {
    // `core` is a notes article sitting before `units`.
    const numbers = buildNumbering(tree(), (id) => id === "core");
    expect(numbers.get("core")).toBe("");
    expect(numbers.get("units")).toBe("1");
    // descendants of an excluded node keep counting under the parent prefix
    expect(numbers.get("turns")).toBe("1");
    expect(numbers.get("melee")).toBe("2.1");
  });
});

describe("blockLabels", () => {
  it("returns one ¶ marker per top-level block", () => {
    const doc = {
      type: "doc",
      content: [{ type: "paragraph" }, { type: "callout" }, { type: "paragraph" }],
    };
    expect(blockLabels(doc)).toEqual(["¶1", "¶2", "¶3"]);
  });

  it("is empty for an absent doc", () => {
    expect(blockLabels(undefined)).toEqual([]);
  });
});
