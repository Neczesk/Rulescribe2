import { buildIssue } from "../catalogue";
import type { StatsContext } from "../context";
import { THRESHOLDS } from "../thresholds";
import { joinNames, plural, verb } from "../text";
import type { IssueEntry, StatsIssue } from "../types";

/** EXP-01 … EXP-03 — things that only bite once the rulebook leaves the app. */
export function exportChecks(ctx: StatsContext): StatsIssue[] {
  return [...externalLinks(ctx), ...oversizedImages(ctx), ...imageMetadata(ctx)];
}

/** EXP-01 — the exported rulebook is meant to stand alone. */
function externalLinks(ctx: StatsContext): StatsIssue[] {
  if (ctx.externalLinks.length === 0) return [];

  const entries: IssueEntry[] = [];
  const seen = new Set<string>();
  for (const link of ctx.externalLinks) {
    const target = ctx.ownerTarget(link.owner);
    const key = `${target.kind}:${target.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push({ label: ctx.name(target), target });
  }

  return [
    buildIssue(
      "EXP-01",
      {
        countPhrase: plural(ctx.externalLinks.length, "external link"),
        names: joinNames(entries.map((entry) => entry.label)),
      },
      { kind: "list", label: "Show list", entries },
    ),
  ];
}

/** EXP-02 — an image far larger than any page needs. */
function oversizedImages(ctx: StatsContext): StatsIssue[] {
  const big = Object.values(ctx.ruleset.registry.images).filter(
    (image) => image.width > THRESHOLDS.imageDimension || image.height > THRESHOLDS.imageDimension,
  );
  if (big.length === 0) return [];

  return [
    buildIssue(
      "EXP-02",
      {
        countPhrase: plural(big.length, "oversized image"),
        list: big
          .slice(0, 3)
          .map(
            (image) => `${image.filename.trim() || "an image"} is ${image.width}×${image.height}`,
          )
          .join(", "),
      },
      { kind: "none" },
    ),
  ];
}

/** EXP-03 — an image whose type or filename never made it into the registry. */
function imageMetadata(ctx: StatsContext): StatsIssue[] {
  const incomplete = Object.values(ctx.ruleset.registry.images).filter(
    (image) => !image.filename.trim() || !image.mimeType.trim(),
  );
  if (incomplete.length === 0) return [];

  return [
    buildIssue(
      "EXP-03",
      {
        countPhrase: plural(incomplete.length, "image"),
        verb: verb(incomplete.length, "is", "are"),
        detail:
          incomplete.length === 1
            ? "One image has no filename or mime type, so the export has to guess an extension."
            : `${incomplete.length} images have no filename or mime type, so the export has to guess an extension.`,
      },
      { kind: "none" },
    ),
  ];
}
