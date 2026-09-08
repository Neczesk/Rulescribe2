import { slugify } from "../../util/slug";

/** URL segment for a ruleset: `<title-slug>-<10-char id>`. */
export function rulesetSlugId(meta: { id: string; title: string }): string {
  return `${slugify(meta.title)}-${meta.id}`;
}

/** The authoritative id is always the trailing 10 chars of the URL segment. */
export function parseRulesetId(segment: string | undefined): string {
  return (segment ?? "").slice(-10);
}
