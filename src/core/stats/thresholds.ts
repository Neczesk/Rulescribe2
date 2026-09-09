/**
 * Every number a consistency check compares against, in one place. These are
 * editorial judgements, not facts about the data — keeping them here makes them
 * easy to argue with (and, later, to expose as settings).
 */
export const THRESHOLDS = {
  /** RDB-01: Flesch–Kincaid grade above this is flagged. */
  gradeLevel: 12,
  /** RDB-02: mean words per sentence. */
  averageSentenceWords: 30,
  /** RDB-03: a single sentence this long is flagged on its own. */
  longestSentenceWords: 60,
  /** RDB-*: articles shorter than this are too small to score meaningfully. */
  minWordsForReadability: 50,
  /** CON-11: characters of flattened short text. */
  shortTextChars: 300,
  /** STR-06: words before an article is expected to carry internal headings. */
  longArticleWords: 1500,
  /** STR-07: words below which a leaf article is probably a fragment. */
  shortArticleWords: 15,
  /** STR-05: structure depth (root = 0) beyond which nesting is flagged. */
  treeDepth: 5,
  /** REF-12: length of a live-embed chain before it is flagged. */
  liveChainLength: 3,
  /** EXP-02: pixels on either side. */
  imageDimension: 2000,
} as const;
