import type { StructureNode } from "../../schema/ruleset";
import { buildIssue } from "../catalogue";
import type { EntityInfo, StatsContext } from "../context";
import { THRESHOLDS } from "../thresholds";
import { joinNames, plural, verb } from "../text";
import { articleTarget, type IssueEntry, type StatsIssue } from "../types";

/** STR-01 … STR-08 — how articles sit in the structure tree. */
export function structureChecks(ctx: StatsContext): StatsIssue[] {
  const byId = new Map(ctx.articles.map((article) => [article.id, article]));
  return [
    ...treeRegistryMismatch(ctx, byId),
    ...duplicatePlacements(ctx, byId),
    ...shapeChecks(ctx, byId),
    ...articleSize(ctx),
  ];
}

/** STR-01 / STR-02 — the registry and the tree disagreeing about what exists. */
function treeRegistryMismatch(ctx: StatsContext, byId: Map<string, EntityInfo>): StatsIssue[] {
  const issues: StatsIssue[] = [];

  const stranded = ctx.articles.filter((article) => !ctx.placements.has(article.id));
  if (stranded.length > 0) {
    const entries = entriesFor(stranded);
    const be = verb(stranded.length, "is", "are");
    issues.push(
      buildIssue(
        "STR-01",
        {
          countPhrase: plural(stranded.length, "article"),
          verb: be,
          names: joinNames(entries.map((entry) => entry.label)),
          pronoun: verb(stranded.length, "it", "they"),
        },
        { kind: "list", label: "Show list", entries },
      ),
    );
  }

  const ghosts = [...ctx.placements.keys()].filter((id) => !byId.has(id));
  if (ghosts.length > 0) {
    issues.push(
      buildIssue(
        "STR-02",
        {
          countPhrase: plural(ghosts.length, "tree node"),
          pointVerb: verb(ghosts.length, "points", "point"),
          subject: ghosts.length === 1 ? "A node references" : `${ghosts.length} nodes reference`,
        },
        { kind: "none" },
      ),
    );
  }

  return issues;
}

/** STR-03 — one article placed at two points in the tree. */
function duplicatePlacements(ctx: StatsContext, byId: Map<string, EntityInfo>): StatsIssue[] {
  const repeated = [...ctx.placements.values()].filter((placement) => placement.occurrences > 1);
  if (repeated.length === 0) return [];

  const entries: IssueEntry[] = repeated.map((placement) => ({
    label: byId.get(placement.articleId)?.name ?? "Unknown article",
    target: articleTarget(placement.articleId),
  }));
  return [
    buildIssue(
      "STR-03",
      {
        countPhrase: plural(repeated.length, "article"),
        appearVerb: verb(repeated.length, "appears", "appear"),
        names: joinNames(entries.map((entry) => entry.label)),
        occupyVerb: verb(repeated.length, "occupies", "occupy"),
      },
      { kind: "list", label: "Show list", entries },
    ),
  ];
}

/** STR-04 / STR-05 / STR-08 — the shape of the tree itself. */
function shapeChecks(ctx: StatsContext, byId: Map<string, EntityInfo>): StatsIssue[] {
  const issues: StatsIssue[] = [];
  const onlyChildParents: IssueEntry[] = [];
  const deep: IssueEntry[] = [];
  const sandwichedNotes: IssueEntry[] = [];
  let deepestPath: string[] = [];

  const name = (id: string) => byId.get(id)?.name ?? "Unknown article";

  const walk = (node: StructureNode, depth: number, path: string[]) => {
    if (node.children.length === 1) {
      onlyChildParents.push({ label: name(node.articleId), target: articleTarget(node.articleId) });
    }
    if (depth > THRESHOLDS.treeDepth && path.length > deepestPath.length) {
      deepestPath = [...path, node.articleId];
      deep.push({ label: name(node.articleId), target: articleTarget(node.articleId) });
    }

    node.children.forEach((child, index) => {
      const article = byId.get(child.articleId);
      const before = node.children[index - 1];
      const after = node.children[index + 1];
      if (
        article?.isNotes &&
        before &&
        after &&
        byId.get(before.articleId)?.isNotes === false &&
        byId.get(after.articleId)?.isNotes === false
      ) {
        sandwichedNotes.push({
          label: article.name,
          target: articleTarget(article.id),
        });
      }
      walk(child, depth + 1, [...path, node.articleId]);
    });
  };

  walk(ctx.ruleset.structure, 0, []);

  if (onlyChildParents.length > 0) {
    issues.push(
      buildIssue(
        "STR-04",
        {
          countPhrase: plural(onlyChildParents.length, "section"),
          verb: verb(onlyChildParents.length, "has", "have"),
          names: joinNames(onlyChildParents.map((entry) => entry.label)),
          containVerb: verb(onlyChildParents.length, "contains", "contain"),
        },
        { kind: "list", label: "Show list", entries: onlyChildParents },
      ),
    );
  }

  if (deep.length > 0) {
    issues.push(
      buildIssue(
        "STR-05",
        {
          threshold: THRESHOLDS.treeDepth,
          path: deepestPath.map(name).join(" > "),
          depth: deepestPath.length,
        },
        {
          kind: "chain",
          label: "Show branch",
          entries: deepestPath.map((id) => ({ label: name(id), target: articleTarget(id) })),
        },
      ),
    );
  }

  if (sandwichedNotes.length > 0) {
    issues.push(
      buildIssue(
        "STR-08",
        {
          countPhrase: plural(sandwichedNotes.length, "notes article"),
          verb: verb(sandwichedNotes.length, "sits", "sit"),
          names: joinNames(sandwichedNotes.map((entry) => entry.label)),
          fallVerb: verb(sandwichedNotes.length, "falls", "fall"),
        },
        { kind: "list", label: "Show list", entries: sandwichedNotes },
      ),
    );
  }

  return issues;
}

/** STR-06 / STR-07 — articles that are too long to navigate or too short to stand alone. */
function articleSize(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];

  const sprawling = ctx.articles.filter(
    (article) => article.words > THRESHOLDS.longArticleWords && !article.hasHeadings,
  );
  if (sprawling.length > 0) {
    const entries = entriesFor(sprawling);
    issues.push(
      buildIssue(
        "STR-06",
        {
          countPhrase: plural(sprawling.length, "long article"),
          verb: verb(sprawling.length, "has", "have"),
          list: sprawling
            .map((article) => `${article.name} runs ${article.words} words`)
            .slice(0, 3)
            .join(", "),
        },
        { kind: "list", label: "Show list", entries },
      ),
    );
  }

  const slight = ctx.articles.filter((article) => {
    const placement = ctx.placements.get(article.id);
    return (
      article.words > 0 &&
      article.words < THRESHOLDS.shortArticleWords &&
      placement !== undefined &&
      placement.childCount === 0
    );
  });
  if (slight.length > 0) {
    const entries = entriesFor(slight);
    issues.push(
      buildIssue(
        "STR-07",
        {
          countPhrase: plural(slight.length, "article"),
          verb: verb(slight.length, "is", "are"),
          list: slight
            .map((article) => `${article.name} is ${plural(article.words, "word")}`)
            .slice(0, 3)
            .join(", "),
          pronoun: verb(slight.length, "it", "them"),
        },
        { kind: "list", label: "Show list", entries },
      ),
    );
  }

  return issues;
}

function entriesFor(articles: EntityInfo[]): IssueEntry[] {
  return articles.map((article) => ({
    label: article.name,
    target: articleTarget(article.id),
  }));
}
