import type { ExcalidrawScene } from "../../../../core/schema/diagram";

/**
 * Renders an Excalidraw scene to an SVG element on demand. `@excalidraw/excalidraw`
 * is dynamic-imported here (not at module top level) so it lands in its own
 * chunk, loaded only when a diagram actually needs to be painted — never as
 * part of the editor's main bundle.
 */
export async function renderExcalidrawSvg(scene: ExcalidrawScene): Promise<SVGSVGElement> {
  const { exportToSvg } = await import("@excalidraw/excalidraw");
  return exportToSvg({
    elements: scene.elements,
    appState: { ...scene.appState, exportBackground: false },
    files: null,
  });
}
