import { contentChecks } from "./checks/content";
import { diagramChecks } from "./checks/diagrams";
import { exportChecks } from "./checks/exportHygiene";
import { readabilityChecks } from "./checks/readability";
import { referenceChecks } from "./checks/references";
import { structureChecks } from "./checks/structure";
import type { StatsContext } from "./context";
import { SEVERITY_ORDER, type StatsIssue } from "./types";

/**
 * Every check, most severe first. Pure and synchronous: the two checks with
 * outside-world inputs (REF-06's image blobs, DIA-01's mermaid parse) read them
 * off `ctx.extras`, which the caller fills in before building the context.
 */
export function runConsistencyChecks(ctx: StatsContext): StatsIssue[] {
  return [
    ...referenceChecks(ctx),
    ...contentChecks(ctx),
    ...structureChecks(ctx),
    ...readabilityChecks(ctx),
    ...diagramChecks(ctx),
    ...exportChecks(ctx),
  ].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.code.localeCompare(b.code),
  );
}
