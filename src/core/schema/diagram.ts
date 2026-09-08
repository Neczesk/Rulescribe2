import * as z from "zod";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { AppState } from "@excalidraw/excalidraw/types";
import { shortId } from "../../util/nanoid";

/**
 * A permissive view of an Excalidraw scene. `core/` imports these types
 * type-only (zero runtime dependency on `@excalidraw/excalidraw`) and never
 * mirrors Excalidraw's real element unions in Zod — the schema below only
 * needs to guarantee "don't lose data across a JSON round-trip," which a
 * shape check satisfies just as well as a faithful re-derivation would.
 */
export interface ExcalidrawScene {
  elements: ExcalidrawElement[];
  appState: Partial<AppState>;
}

export const EMPTY_SCENE: ExcalidrawScene = { elements: [], appState: {} };

const isExcalidrawScene = (val: unknown): val is ExcalidrawScene =>
  typeof val === "object" &&
  val !== null &&
  Array.isArray((val as ExcalidrawScene).elements) &&
  typeof (val as ExcalidrawScene).appState === "object" &&
  (val as ExcalidrawScene).appState !== null;

export const excalidrawScene = z.custom<ExcalidrawScene>(isExcalidrawScene, {
  error: "Expected an Excalidraw scene ({ elements, appState })",
});

const ID = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

const diagramEntryBase = {
  id: ID.default(shortId),
  name: z.string().default(""),
  notes: z.string().default(""),
};

export const excalidrawDiagram = z.object({
  ...diagramEntryBase,
  kind: z.literal("excalidraw"),
  scene: excalidrawScene.default(structuredClone(EMPTY_SCENE)),
});

export const mermaidDiagram = z.object({
  ...diagramEntryBase,
  kind: z.literal("mermaid"),
  source: z.string().default("graph TD;\nA-->B;"),
});

export const diagramEntry = z.discriminatedUnion("kind", [excalidrawDiagram, mermaidDiagram]);

export type DiagramEntry = z.infer<typeof diagramEntry>;
