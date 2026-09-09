/** Plain-text helpers shared by the content, structure and readability checks. */

/** Words in a flattened doc. Empty string counts as zero, not one. */
export function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

/**
 * Split on sentence-final punctuation followed by whitespace. Deliberately
 * naive — abbreviations ("6 in. move") over-split, which nudges a grade level
 * down rather than inventing a violation, so the failure mode is quiet.
 */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/** Case- and whitespace-insensitive key for grouping duplicate strings. */
export function normalizeForCompare(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Case-folded, de-pluralized key — "Cover" and "covers" collide. */
export function normalizeName(name: string): string {
  return normalizeForCompare(name).replace(/s$/, "");
}

/**
 * Join a list of names for a message: "A", "A and B", "A, B and C". Beyond
 * `max` it trails off ("A, B, C and 4 others") so a detail line stays one
 * sentence however many entities are involved.
 */
export function joinNames(names: string[], max = 4): string {
  if (names.length === 0) return "";
  if (names.length === 1) return names[0]!;
  const shown = names.slice(0, max);
  const rest = names.length - shown.length;
  const tail = rest > 0 ? `${rest} other${rest === 1 ? "" : "s"}` : shown.pop()!;
  return `${shown.join(", ")} and ${tail}`;
}

/** "1 keyword" / "2 keywords". */
export function plural(count: number, noun: string, pluralNoun = `${noun}s`): string {
  return `${count} ${count === 1 ? noun : pluralNoun}`;
}

/** The word matching `count` — `verb(1, "is", "are")` → `"is"`. */
export function verb(count: number, singular: string, pluralForm: string): string {
  return count === 1 ? singular : pluralForm;
}
