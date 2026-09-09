import type { Ruleset } from "../../../core/schema/ruleset";
import type { StatsExtras } from "../../../core/stats";
import { listImageBlobIds } from "../../../core/storage/imageStorage";

/**
 * The two check inputs `core/` cannot produce itself: what is actually in the
 * image store, and whether each Mermaid source parses. Both are gathered here,
 * in the feature layer, and handed to `buildStatsContext` as extras — which is
 * what keeps every check pure and synchronous.
 *
 * Either half failing degrades to "that check does not run" rather than taking
 * the whole panel down: an absent key means the check stays silent.
 */
export async function gatherStatsExtras(ruleset: Ruleset): Promise<StatsExtras> {
  const [imageBlobIds, mermaidErrors] = await Promise.all([
    loadImageBlobIds(),
    parseMermaidSources(ruleset),
  ]);
  return { imageBlobIds, mermaidErrors };
}

async function loadImageBlobIds(): Promise<Set<string> | undefined> {
  try {
    return new Set(await listImageBlobIds());
  } catch {
    return undefined;
  }
}

async function parseMermaidSources(ruleset: Ruleset): Promise<Map<string, string> | undefined> {
  const diagrams = Object.values(ruleset.registry.diagrams).filter(
    (diagram) => diagram.kind === "mermaid",
  );
  if (diagrams.length === 0) return new Map();

  // Dynamic import for the same reason as `renderMermaidSvg`: Mermaid is heavy
  // and must stay out of the editor bundle.
  let mermaid: typeof import("mermaid").default;
  try {
    mermaid = (await import("mermaid")).default;
    mermaid.initialize({ startOnLoad: false, suppressErrorRendering: true });
  } catch {
    return undefined;
  }

  const errors = new Map<string, string>();
  for (const diagram of diagrams) {
    try {
      await mermaid.parse(diagram.source);
    } catch (error) {
      errors.set(diagram.id, error instanceof Error ? error.message : "Parse error");
    }
  }
  return errors;
}
