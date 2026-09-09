import { buildIssue } from "../catalogue";
import type { EntityInfo, StatsContext } from "../context";
import { THRESHOLDS } from "../thresholds";
import { plural, verb } from "../text";
import { articleTarget, type IssueEntry, type StatsIssue } from "../types";

/**
 * RDB-01 … RDB-03 — Flesch–Kincaid and sentence length over article bodies.
 * Articles below `minWordsForReadability` are skipped: the formula is unstable
 * on a couple of sentences and would flag a one-line article as postgraduate.
 */
export function readabilityChecks(ctx: StatsContext): StatsIssue[] {
  const scored = ctx.articles.filter(
    (article) => article.words >= THRESHOLDS.minWordsForReadability,
  );
  if (scored.length === 0) return [];

  return [...gradeLevel(scored), ...sentenceLength(scored)];
}

/** RDB-01 — articles above the target grade level. */
function gradeLevel(articles: EntityInfo[]): StatsIssue[] {
  const hard = articles
    .filter((article) => article.score.grade > THRESHOLDS.gradeLevel)
    .sort((a, b) => b.score.grade - a.score.grade);
  if (hard.length === 0) return [];

  const entries = entriesFor(hard);
  return [
    buildIssue(
      "RDB-01",
      {
        countPhrase: plural(hard.length, "article"),
        scoreVerb: verb(hard.length, "scores", "score"),
        threshold: THRESHOLDS.gradeLevel,
        list: hard
          .slice(0, 4)
          .map((article) => `${article.name} ${article.score.grade.toFixed(1)}`)
          .join(", "),
      },
      { kind: "list", label: "Show list", entries },
    ),
  ];
}

/** RDB-02 / RDB-03 — sentences that run long on average, or individually. */
function sentenceLength(articles: EntityInfo[]): StatsIssue[] {
  const issues: StatsIssue[] = [];

  const rambling = articles
    .filter((article) => article.score.averageSentenceWords > THRESHOLDS.averageSentenceWords)
    .sort((a, b) => b.score.averageSentenceWords - a.score.averageSentenceWords);
  if (rambling.length > 0) {
    issues.push(
      buildIssue(
        "RDB-02",
        {
          countPhrase: plural(rambling.length, "article"),
          averageVerb: verb(rambling.length, "averages", "average"),
          threshold: THRESHOLDS.averageSentenceWords,
          list: rambling
            .slice(0, 4)
            .map(
              (article) =>
                `${article.name} averages ${article.score.averageSentenceWords.toFixed(0)} words`,
            )
            .join(", "),
        },
        { kind: "list", label: "Show list", entries: entriesFor(rambling) },
      ),
    );
  }

  const longest = articles
    .filter((article) => article.score.longestSentenceWords > THRESHOLDS.longestSentenceWords)
    .sort((a, b) => b.score.longestSentenceWords - a.score.longestSentenceWords);
  if (longest.length > 0) {
    issues.push(
      buildIssue(
        "RDB-03",
        {
          countPhrase: plural(longest.length, "very long sentence"),
          list: longest
            .slice(0, 3)
            .map(
              (article) =>
                `a ${article.score.longestSentenceWords}-word sentence in ${article.name}`,
            )
            .join(", "),
        },
        { kind: "list", label: "Show list", entries: entriesFor(longest) },
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
