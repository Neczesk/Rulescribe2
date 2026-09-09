import raw from "./catalogue.json";
import type { IssueAction, Severity, StatsArea, StatsIssue } from "./types";

/**
 * The editable half of the consistency checks: every code's area, severity and
 * wording lives in `catalogue.json`, not in the check functions. A check
 * decides *whether* something is wrong and gathers the entities involved; this
 * file decides how severe that is and what the author reads. Reclassifying a
 * check (or rewording it) is a JSON edit — no TypeScript, no rebuild logic.
 *
 * Titles and details are templates with `{placeholder}` tokens; each check
 * supplies the matching `vars`. Most vars are small computed fragments (a
 * pluralized count, a verb chosen for the count, a joined name list) so the
 * JSON keeps ownership of full sentences; a few checks whose sentence *shape*
 * (not just wording) changes with the count pass a single pre-composed
 * `detail`/`title` var instead — see the check's comment where that happens.
 */

interface CatalogueEntry {
  area: StatsArea;
  severity: Severity;
  title: string;
  detail: string;
}

interface Catalogue {
  /** The minimum severity that blocks export — see `./blocking.ts`. */
  blockingSeverity: Severity;
  codes: Record<string, CatalogueEntry>;
}

const CATALOGUE = raw as Catalogue;

export const BLOCKING_SEVERITY: Severity = CATALOGUE.blockingSeverity;

function entry(code: string): CatalogueEntry {
  const found = CATALOGUE.codes[code];
  if (!found) {
    throw new Error(
      `No catalogue entry for consistency-check code "${code}" — add one to core/stats/catalogue.json.`,
    );
  }
  return found;
}

type Vars = Record<string, string | number>;

/** Replace every `{key}` in `template` with `vars[key]`. Unknown keys are left as-is. */
function fill(template: string, vars: Vars): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in vars ? String(vars[key]) : match,
  );
}

/**
 * Assemble a `StatsIssue` from a catalogue code, the variables its templates
 * need, and the action a check has already worked out (which entities, which
 * navigation). `code` doubles as the lookup key, so a typo here throws at test
 * time rather than silently shipping an issue with no wording.
 */
export function buildIssue(code: string, vars: Vars, action: IssueAction): StatsIssue {
  const { area, severity, title, detail } = entry(code);
  return { code, area, severity, title: fill(title, vars), detail: fill(detail, vars), action };
}
