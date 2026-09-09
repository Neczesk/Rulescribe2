import { keywordReferences } from "../schema/references";
import { isLiveText, REF_DISPLAYS, type RefDisplayMode, type StatsContext } from "./context";
import { weightedGrade } from "./readability";
import { THRESHOLDS } from "./thresholds";
import { plural } from "./text";

/** Rough print density, used only for the "≈ N printed pages" hint. */
const WORDS_PER_PAGE = 270;

/** One cell of the Size grid. */
export interface Figure {
  value: string;
  label: string;
  /** The smaller line under the number; may be empty. */
  sub: string;
}

export interface BarRow {
  name: string;
  value: number;
}

export interface RulesetStats {
  figures: Figure[];
  /** Keywords by number of referencing articles, descending. */
  keywordUsage: BarRow[];
  /** How many references use each display mode. */
  referenceModes: BarRow[];
  reading: {
    grade: number;
    averageSentenceWords: number;
    aboveThreshold: number;
    threshold: number;
  };
  coverage: {
    articlesWithText: number;
    articles: number;
    keywordsWithFullText: number;
    keywords: number;
    notesArticles: number;
  };
}

const MODE_LABELS: Record<RefDisplayMode, string> = {
  link: "Link",
  name: "Live name",
  shortText: "Live summary",
  text: "Live full text",
};

/** The Overview tab's numbers. Derived on the fly; nothing here is stored. */
export function buildRulesetStats(ctx: StatsContext): RulesetStats {
  const articles = ctx.articles;
  const words = articles.reduce((sum, article) => sum + article.words, 0);
  const sections = ctx.outline.filter((section) => section.depth === 1).length;

  const textRefs = ctx.refs.filter((ref) => ref.type === "keywordRef" || ref.type === "articleRef");
  const live = textRefs.filter((ref) => isLiveText(ref.display)).length;

  const keywordsWithFullText = ctx.keywords.filter((keyword) => keyword.text).length;
  const nodeDefs = Object.keys(ctx.ruleset.registry.nodeDefs).length;

  const uses = keywordReferences(ctx.ruleset);
  const keywordUsage = ctx.keywords
    .map((keyword) => ({ name: keyword.name, value: uses[keyword.id]?.length ?? 0 }))
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name));

  const referenceModes = REF_DISPLAYS.map((mode) => ({
    name: MODE_LABELS[mode],
    value: textRefs.filter((ref) => ref.display === mode).length,
  }));

  const scored = articles.filter((article) => article.words >= THRESHOLDS.minWordsForReadability);
  const scores = scored.map((article) => article.score);
  const sentences = scores.reduce((sum, score) => sum + score.sentences, 0);
  const scoredWords = scores.reduce((sum, score) => sum + score.words, 0);

  return {
    figures: [
      {
        value: String(articles.length),
        label: "Articles",
        sub: sections > 0 ? `across ${plural(sections, "section")}` : "",
      },
      {
        value: words.toLocaleString(),
        label: "Words",
        sub: `≈ ${Math.max(1, Math.round(words / WORDS_PER_PAGE))} printed pages`,
      },
      {
        value: String(ctx.keywords.length),
        label: "Keywords",
        sub: `${keywordsWithFullText} with full text`,
      },
      {
        value: String(textRefs.length),
        label: "References",
        sub: `${live} live, ${textRefs.length - live} links`,
      },
      {
        value: String(nodeDefs),
        label: "List nodes",
        sub: nodeDefs > 0 ? "other half of the ruleset" : "list building not started",
      },
    ],
    keywordUsage,
    referenceModes,
    reading: {
      grade: weightedGrade(scores),
      averageSentenceWords: sentences > 0 ? Math.round(scoredWords / sentences) : 0,
      aboveThreshold: scores.filter((score) => score.grade > THRESHOLDS.gradeLevel).length,
      threshold: THRESHOLDS.gradeLevel,
    },
    coverage: {
      articlesWithText: articles.filter((article) => article.text).length,
      articles: articles.length,
      keywordsWithFullText,
      keywords: ctx.keywords.length,
      notesArticles: articles.filter((article) => article.isNotes).length,
    },
  };
}
