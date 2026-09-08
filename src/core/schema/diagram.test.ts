import { describe, expect, it } from "vitest";
import { diagramEntry, EMPTY_SCENE } from "./diagram";

describe("diagramEntry", () => {
  it("parses a minimal excalidraw entry", () => {
    const parsed = diagramEntry.parse({ kind: "excalidraw", scene: EMPTY_SCENE });
    expect(parsed.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(parsed.kind).toBe("excalidraw");
    if (parsed.kind === "excalidraw") {
      expect(parsed.scene).toEqual(EMPTY_SCENE);
    }
  });

  it("parses a minimal mermaid entry", () => {
    const parsed = diagramEntry.parse({ kind: "mermaid", source: "graph TD;\nA-->B;" });
    expect(parsed.kind).toBe("mermaid");
    if (parsed.kind === "mermaid") {
      expect(parsed.source).toBe("graph TD;\nA-->B;");
    }
  });

  it("rejects an unknown kind", () => {
    expect(diagramEntry.safeParse({ kind: "flowchart" }).success).toBe(false);
  });

  it("rejects a malformed excalidraw scene", () => {
    expect(
      diagramEntry.safeParse({ kind: "excalidraw", scene: { elements: "nope", appState: {} } })
        .success,
    ).toBe(false);
    expect(diagramEntry.safeParse({ kind: "excalidraw", scene: { elements: [] } }).success).toBe(
      false,
    );
  });

  it("round-trips through JSON", () => {
    const original = diagramEntry.parse({
      kind: "excalidraw",
      name: "Deployment zones",
      scene: { elements: [{ id: "el1", type: "rectangle" }], appState: { zoom: { value: 1 } } },
    });
    const revived = diagramEntry.parse(JSON.parse(JSON.stringify(original)));
    expect(revived).toEqual(original);
  });
});
