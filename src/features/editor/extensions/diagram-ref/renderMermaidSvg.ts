/**
 * Renders Mermaid DSL source to an SVG string on demand. `mermaid` is
 * dynamic-imported here (not at module top level) so it lands in its own
 * chunk, loaded only when a diagram actually needs to be painted — never as
 * part of the editor's main bundle.
 */
export async function renderMermaidSvg(source: string, renderId: string): Promise<string> {
  const { default: mermaid } = await import("mermaid");
  mermaid.initialize({ startOnLoad: false });
  const { svg } = await mermaid.render(renderId, source);
  return svg;
}
