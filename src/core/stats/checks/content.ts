import { buildIssue } from "../catalogue";
import type { EntityInfo, StatsContext } from "../context";
import { THRESHOLDS } from "../thresholds";
import { joinNames, normalizeForCompare, normalizeName, plural, verb, wordCount } from "../text";
import {
  articleTarget,
  keywordTarget,
  type IssueAction,
  type IssueEntry,
  type IssueTarget,
  type StatsIssue,
} from "../types";

/** CON-01 … CON-15 — completeness and duplication within articles and keywords. */
export function contentChecks(ctx: StatsContext): StatsIssue[] {
  return [
    ...emptyKeywords(ctx),
    ...emptyArticles(ctx),
    ...missingNames(ctx),
    ...duplicates(ctx),
    ...shortTextShape(ctx),
    ...draftLeftovers(ctx),
    ...metadataGaps(ctx),
  ];
}

/** CON-01 / CON-02 — a keyword with no full text, or no text at all. */
function emptyKeywords(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];

  const empty = ctx.keywords.filter((keyword) => !keyword.text && !keyword.shortText);
  if (empty.length > 0) {
    issues.push(issue("CON-02", empty, { verb: verb(empty.length, "has", "have") }));
  }

  const shortOnly = ctx.keywords.filter((keyword) => !keyword.text && keyword.shortText);
  if (shortOnly.length > 0) {
    issues.push(issue("CON-01", shortOnly, { verb: verb(shortOnly.length, "has", "have") }));
  }

  return issues;
}

/** CON-03 — an article with an empty body that nothing hangs beneath either. */
function emptyArticles(ctx: StatsContext): StatsIssue[] {
  const empty = ctx.articles.filter((article) => {
    const placement = ctx.placements.get(article.id);
    return !article.text && placement !== undefined && placement.childCount === 0;
  });
  if (empty.length === 0) return [];

  return [
    issue("CON-03", empty, {
      shape: empty.length === 1 ? "is an empty leaf" : "are empty leaves",
      verb: verb(empty.length, "has", "have"),
    }),
  ];
}

/** CON-04 / CON-05 — untitled entities. Both render as a placeholder on export. */
function missingNames(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];
  // The root article legitimately falls back to the ruleset title (see
  // `buildOutline`), so a blank title there is not a defect.
  const rootId = ctx.ruleset.structure.articleId;

  const untitled = ctx.articles.filter((article) => !article.named && article.id !== rootId);
  if (untitled.length > 0) {
    issues.push(
      issue("CON-04", untitled, {
        verb: verb(untitled.length, "has", "have"),
        detail:
          untitled.length === 1
            ? "One article will export under a placeholder heading."
            : `${untitled.length} articles will export under a placeholder heading.`,
      }),
    );
  }

  const unnamed = ctx.keywords.filter((keyword) => !keyword.named);
  if (unnamed.length > 0) {
    issues.push(
      issue("CON-05", unnamed, {
        verb: verb(unnamed.length, "has", "have"),
        pronoun: verb(unnamed.length, "it", "them"),
      }),
    );
  }

  return issues;
}

/** CON-06 … CON-09 — text and names that collide. */
function duplicates(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];

  for (const group of groupBy(
    ctx.entities.filter((entity) => entity.shortText),
    (entity) => normalizeForCompare(entity.shortText),
  )) {
    issues.push(issue("CON-06", group, {}, { actionKind: "compare", actionLabel: "Compare" }));
  }

  for (const group of groupBy(
    ctx.articles.filter((article) => article.named),
    (article) => normalizeForCompare(article.name),
  )) {
    issues.push(
      issue(
        "CON-07",
        group,
        { count: group.length, name: group[0]!.name },
        { actionKind: "compare", actionLabel: "Compare" },
      ),
    );
  }

  const exactKeywordGroups = groupBy(
    ctx.keywords.filter((keyword) => keyword.named),
    (keyword) => normalizeForCompare(keyword.name),
  );
  for (const group of exactKeywordGroups) {
    issues.push(
      issue(
        "CON-08",
        group,
        { count: group.length, name: group[0]!.name },
        { actionKind: "compare", actionLabel: "Compare" },
      ),
    );
  }

  // CON-09 is the near-miss version of CON-08: same name once case and a
  // trailing "s" are ignored. Skip any group CON-08 already reported exactly.
  const exact = new Set(exactKeywordGroups.flat().map((keyword) => keyword.id));
  for (const group of groupBy(
    ctx.keywords.filter((keyword) => keyword.named && !exact.has(keyword.id)),
    (keyword) => normalizeName(keyword.name),
  )) {
    issues.push(issue("CON-09", group, {}, { actionKind: "compare", actionLabel: "Compare" }));
  }

  return issues;
}

/** CON-10 / CON-11 — a summary that is not summarising. */
function shortTextShape(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];

  const inverted = ctx.entities.filter(
    (entity) =>
      entity.shortText && entity.text && wordCount(entity.shortText) > wordCount(entity.text),
  );
  if (inverted.length > 0) {
    const first = inverted[0]!;
    issues.push(
      issue("CON-10", inverted, {
        verb: verb(inverted.length, "is", "are"),
        name: first.name,
        shortWords: plural(wordCount(first.shortText), "word"),
        fullWords: plural(wordCount(first.text), "word"),
      }),
    );
  }

  const overlong = ctx.entities.filter(
    (entity) => entity.shortText.length > THRESHOLDS.shortTextChars,
  );
  if (overlong.length > 0) {
    issues.push(
      issue("CON-11", overlong, {
        exceedVerb: verb(overlong.length, "exceeds", "exceed"),
        limit: THRESHOLDS.shortTextChars,
      }),
    );
  }

  return issues;
}

const DRAFT_MARKER = /\b(TODO|TBD|FIXME|XXX)\b|\?\?\?/;
const PLACEHOLDER = /\blorem ipsum\b/i;

/** CON-12 … CON-14 — working text that was never meant to ship. */
function draftLeftovers(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];

  const marked = ctx.entities.filter(
    (entity) => DRAFT_MARKER.test(entity.text) || DRAFT_MARKER.test(entity.shortText),
  );
  if (marked.length > 0) {
    issues.push(issue("CON-12", marked, { countPhrase: plural(marked.length, "draft marker") }));
  }

  const noted = ctx.entities.filter((entity) => entity.notes);
  if (noted.length > 0) {
    issues.push(
      issue("CON-13", noted, {
        countPhrase: plural(noted.length, "article or keyword", "articles and keywords"),
        verb: verb(noted.length, "carries", "carry"),
      }),
    );
  }

  const placeholders = ctx.entities.filter(
    (entity) => PLACEHOLDER.test(entity.text) || PLACEHOLDER.test(entity.shortText),
  );
  if (placeholders.length > 0) {
    issues.push(
      issue("CON-14", placeholders, { countPhrase: plural(placeholders.length, "place") }),
    );
  }

  return issues;
}

/** CON-15 — ruleset metadata the export's title page needs. */
function metadataGaps(ctx: StatsContext): StatsIssue[] {
  const missing: string[] = [];
  if (!ctx.ruleset.metadata.title.trim()) missing.push("title");
  if (!ctx.ruleset.metadata.author.trim()) missing.push("author");
  if (missing.length === 0) return [];

  return [buildIssue("CON-15", { names: joinNames(missing) }, { kind: "none" })];
}

// ---------------------------------------------------------------------------

function targetOf(entity: EntityInfo): IssueTarget {
  return entity.kind === "article" ? articleTarget(entity.id) : keywordTarget(entity.id);
}

function entriesFor(entities: EntityInfo[]): IssueEntry[] {
  return entities.map((entity) => ({ label: entity.name, target: targetOf(entity) }));
}

/** Groups of two or more sharing a key, in first-seen order. */
function groupBy<T>(items: T[], keyOf: (item: T) => string): T[][] {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const key = keyOf(item);
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

/**
 * Build an issue from the affected entities: `countPhrase` (the entity count,
 * pluralized to "keyword"/"article") is filled in automatically unless the
 * template needs something more specific, and the action is a jump when there
 * is one offender and a list — or the given `actionKind` — when there are
 * several.
 */
function issue(
  code: string,
  entities: EntityInfo[],
  vars: Record<string, string | number>,
  opts: { actionKind?: "list" | "compare"; actionLabel?: string } = {},
): StatsIssue {
  const entries = entriesFor(entities);
  const { actionKind = "list", actionLabel = "Show list" } = opts;
  const single = entries.length === 1 && entries[0]!.target && actionKind === "list";
  const action: IssueAction = single
    ? { kind: "navigate", label: `Open ${entries[0]!.label}`, target: entries[0]!.target! }
    : { kind: actionKind, label: actionLabel, entries };

  const defaults: Record<string, string | number> = {
    countPhrase: plural(entities.length, entityNoun(entities)),
    names: joinNames(entries.map((entry) => entry.label)),
  };
  return buildIssue(code, { ...defaults, ...vars }, action);
}

/** "keyword" when every affected entity is a keyword, "article" otherwise. */
function entityNoun(entities: EntityInfo[]): string {
  return entities.every((entity) => entity.kind === "keyword") ? "keyword" : "article";
}
