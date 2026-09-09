/**
 * `text-readability` ships no types. Only the handful of members
 * `./readability.ts` uses are declared — widen this if that file grows.
 */
declare module "text-readability" {
  interface TextReadability {
    /** Words, punctuation stripped. */
    lexiconCount(text: string, removePunctuation?: boolean): number;
    sentenceCount(text: string): number;
    syllableCount(text: string, lang?: string): number;
    averageSentenceLength(text: string): number;
    fleschReadingEase(text: string): number;
    /** US grade level. Can be negative or absurdly high on degenerate input. */
    fleschKincaidGrade(text: string): number;
  }
  const readability: TextReadability;
  export default readability;
}
