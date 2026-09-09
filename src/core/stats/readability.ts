import rs from "text-readability";
import { splitSentences, wordCount } from "./text";

/**
 * The single import site for `text-readability` — everything else asks for
 * `ReadabilityScore`. Swapping the library (or hand-rolling the formula) is a
 * change to this file alone.
 */
export interface ReadabilityScore {
  /** Flesch–Kincaid US grade level. */
  grade: number;
  words: number;
  sentences: number;
  averageSentenceWords: number;
  /** Words in the longest single sentence. */
  longestSentenceWords: number;
}

const EMPTY: ReadabilityScore = {
  grade: 0,
  words: 0,
  sentences: 0,
  averageSentenceWords: 0,
  longestSentenceWords: 0,
};

/**
 * Score one flattened article body. Text with no sentence-final punctuation at
 * all (a bare heading, a table cell) scores as empty rather than as one
 * enormous sentence.
 */
export function scoreText(text: string): ReadabilityScore {
  const words = wordCount(text);
  if (words === 0) return EMPTY;

  const sentences = splitSentences(text);
  const sentenceCount = sentences.length || 1;
  const longest = sentences.reduce((max, sentence) => Math.max(max, wordCount(sentence)), 0);

  return {
    grade: round1(rs.fleschKincaidGrade(text)),
    words,
    sentences: sentenceCount,
    averageSentenceWords: round1(words / sentenceCount),
    longestSentenceWords: longest,
  };
}

/**
 * Weight per-article grades by word count. A one-line article should not drag
 * a rulebook's headline number around as much as a chapter does.
 */
export function weightedGrade(scores: ReadabilityScore[]): number {
  const words = scores.reduce((sum, score) => sum + score.words, 0);
  if (words === 0) return 0;
  const total = scores.reduce((sum, score) => sum + score.grade * score.words, 0);
  return round1(total / words);
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
