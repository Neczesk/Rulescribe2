import { EXTRA_LABELS, type ExtraKey } from "./options";

/** How many generated-matter sections are enabled. */
export function countEnabledExtras(extras: Record<ExtraKey, boolean>): number {
  return Object.values(extras).filter(Boolean).length;
}

/** Short human list of the enabled extras ("table of contents, keyword glossary"), or `""`. */
export function describeExtras(extras: Record<ExtraKey, boolean>): string {
  return (Object.keys(extras) as ExtraKey[])
    .filter((key) => extras[key])
    .map((key) => EXTRA_LABELS[key].label.toLowerCase())
    .join(", ");
}
