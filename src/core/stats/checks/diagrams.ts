import type { DiagramEntry } from "../../schema/diagram";
import { buildIssue } from "../catalogue";
import type { StatsContext } from "../context";
import { joinNames, plural, verb } from "../text";
import type { StatsIssue } from "../types";

/** The `mermaidDiagram` schema default — a diagram still showing it is untouched. */
const DEFAULT_MERMAID = "graph TD;\nA-->B;";

/** DIA-01 … DIA-03 — diagrams that will not render, or have nothing to render. */
export function diagramChecks(ctx: StatsContext): StatsIssue[] {
  const diagrams = Object.values(ctx.ruleset.registry.diagrams);
  if (diagrams.length === 0) return [];

  return [...unparseable(ctx, diagrams), ...empty(diagrams), ...unnamed(diagrams)];
}

/**
 * DIA-01 — mermaid source that fails to parse. The parse happens outside
 * `core/` (mermaid is a heavy browser dependency); this reads the result.
 */
function unparseable(ctx: StatsContext, diagrams: DiagramEntry[]): StatsIssue[] {
  const errors = ctx.extras.mermaidErrors;
  if (!errors || errors.size === 0) return [];

  const broken = diagrams.filter((diagram) => errors.has(diagram.id));
  if (broken.length === 0) return [];

  return [
    buildIssue(
      "DIA-01",
      {
        countPhrase: plural(broken.length, "mermaid diagram"),
        doVerb: verb(broken.length, "does", "do"),
        names: joinNames(broken.map(label)),
        failVerb: verb(broken.length, "fails", "fail"),
      },
      { kind: "none" },
    ),
  ];
}

/** DIA-02 — a diagram with no content, or still on the schema's starter source. */
function empty(diagrams: DiagramEntry[]): StatsIssue[] {
  const blank = diagrams.filter((diagram) =>
    diagram.kind === "excalidraw"
      ? diagram.scene.elements.length === 0
      : !diagram.source.trim() || diagram.source.trim() === DEFAULT_MERMAID,
  );
  if (blank.length === 0) return [];

  return [
    buildIssue(
      "DIA-02",
      {
        countPhrase: plural(blank.length, "diagram"),
        verb: verb(blank.length, "is", "are"),
        names: joinNames(blank.map(label)),
      },
      { kind: "none" },
    ),
  ];
}

/** DIA-03 — an unnamed diagram has no caption to export. */
function unnamed(diagrams: DiagramEntry[]): StatsIssue[] {
  const nameless = diagrams.filter((diagram) => !diagram.name.trim());
  if (nameless.length === 0) return [];

  return [
    buildIssue(
      "DIA-03",
      {
        countPhrase: plural(nameless.length, "diagram"),
        verb: verb(nameless.length, "has", "have"),
        pronoun: verb(nameless.length, "It exports", "They export"),
      },
      { kind: "none" },
    ),
  ];
}

function label(diagram: DiagramEntry): string {
  return diagram.name.trim() || "an unnamed diagram";
}
