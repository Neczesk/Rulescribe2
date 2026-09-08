/** Lowercase, hyphenated, ascii-only slug (max 40 chars); never empty. */
export function slugify(value: string): string {
  return (
    value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "ruleset"
  );
}
