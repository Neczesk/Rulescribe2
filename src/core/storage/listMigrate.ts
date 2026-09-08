import { LIST_SCHEMA_VERSION } from "../schema/list";

/**
 * Pure forward-migration for stored army lists. Free of `idb-keyval` so it can
 * be unit-tested under Vitest's node environment.
 *
 * v1 -> v2: `roots: SelectionEntry[]` collapses to a single optional `root`
 * (Army is a real root NodeDef now). Nested entries gain a `slotId`, backfilled
 * by the schema default on parse; `detachmentTypeId` is dropped by Zod.
 */
export function migrateList(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !("schemaVersion" in raw)) return raw;
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === LIST_SCHEMA_VERSION) return raw;
  if (typeof version !== "number" || version >= LIST_SCHEMA_VERSION) return raw;

  const obj = { ...(raw as Record<string, unknown>) };
  if (version < 2 && Array.isArray(obj.roots)) {
    if (obj.roots.length > 0) obj.root = obj.roots[0];
    delete obj.roots;
  }
  obj.schemaVersion = LIST_SCHEMA_VERSION;
  return obj;
}
