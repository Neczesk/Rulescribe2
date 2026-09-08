import { generatedResourceConstraint } from "../engine/resourceConstraints";

/**
 * Pure forward-migration for stored rulesets. Deliberately free of
 * `idb-keyval` so it can be unit-tested under Vitest's node environment
 * (importing `rulesetStorage` opens IndexedDB at module load).
 */

/** Latest on-disk schema version this build understands. */
export const CURRENT_SCHEMA_VERSION = 13;

/**
 * v1->v2 `registry.images`; v2->v3 `registry.diagrams`; v3->v4 `article.isNotes`;
 * v4->v5 `registry.nodeDefs` + `ruleset.listBuilding`; v5->v6
 * `registry.categoryRecords` + `listBuilding.categories`; v6->v7
 * `FieldDef.articleReference` / `editableByPlayer` / `inherited`; v8->v9
 * `CategoryDef.fieldGroups`. Those are pure additions — Zod `.default(...)`
 * backfills on parse.
 *
 * v7->v8 drops `DetachmentTypeDef` / `FormatDef.detachmentTypeIds` /
 * `listBuilding.detachmentTypes` / `ChildSlotDef.mode` (Zod silently drops
 * unknown keys — no code) and reshapes `ConstraintDef.groupBy` into
 * `{ key, expectedValues? }`.
 *
 * v10->v11 adds `CategoryDef.kind` (defaults to `"node"`). Pure addition.
 *
 * v11->v12 adds `CategoryDef.description` and `CategoryDef.constraints`; v12->v13
 * adds `CategoryRecord.name`. Pure additions — Zod `.default(...)` backfills on
 * parse.
 *
 * v9->v10 replaces the closed `countLimit` / `requires` / `excludes` set with
 * the `limit` / `require` Metric-Condition algebra, and materializes each
 * resource cap as a generated `limit` on every format. Both need real
 * transforms, below.
 */
export function migrate(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || !("schemaVersion" in raw)) return raw;
  const version = (raw as { schemaVersion?: unknown }).schemaVersion;
  if (version === CURRENT_SCHEMA_VERSION) return raw;
  if (typeof version !== "number" || version >= CURRENT_SCHEMA_VERSION) return raw;

  let migrated: unknown = raw;
  if (version < 8) migrated = rewriteGroupBy(migrated);
  if (version < 10) {
    migrated = rewriteConstraints(migrated);
    migrated = backfillResourceConstraints(migrated);
  }
  return { ...(migrated as object), schemaVersion: CURRENT_SCHEMA_VERSION };
}

// ---------------------------------------------------------------------------
// v7 -> v8: `groupBy` was a bare `"nodeDefId"` string or `{ type: "field", … }`.
// ---------------------------------------------------------------------------

function isLegacyGroupBy(value: unknown): boolean {
  if (typeof value === "string") return true;
  return typeof value === "object" && value !== null && !("key" in value);
}

/** Deep-clone `node`, wrapping any legacy `groupBy` value as `{ key: value }`. */
function rewriteGroupBy(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteGroupBy);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] = key === "groupBy" && isLegacyGroupBy(value) ? { key: value } : rewriteGroupBy(value);
  }
  return out;
}

// ---------------------------------------------------------------------------
// v9 -> v10: the constraint algebra.
// ---------------------------------------------------------------------------

/** Deep-clone `node`, rewriting every `constraints` array it finds. */
function rewriteConstraints(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(rewriteConstraints);
  if (!node || typeof node !== "object") return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
    out[key] =
      key === "constraints" && Array.isArray(value)
        ? value.map(rewriteConstraint)
        : rewriteConstraints(value);
  }
  return out;
}

const countOf = (selector: unknown) => ({ op: "count", selector });
const compare = (left: unknown, cmp: string, value: number) => ({
  op: "compare",
  left,
  cmp,
  right: { op: "constant", value },
});

function rewriteConstraint(raw: unknown): unknown {
  if (!raw || typeof raw !== "object") return raw;
  const c = raw as Record<string, unknown>;

  const base: Record<string, unknown> = { values: {} };
  if (c.id !== undefined) base.id = c.id;
  if (c.severity !== undefined) base.severity = c.severity;
  if (c.overrides !== undefined) base.overrides = c.overrides;
  if (c.message !== undefined) base.message = c.message;

  const scope = c.scope ?? { type: "all" };

  switch (c.kind) {
    case "countLimit": {
      const out: Record<string, unknown> = { ...base, kind: "limit", metric: countOf(scope) };
      if (typeof c.min === "number") out.min = { op: "constant", value: c.min };
      if (typeof c.max === "number") out.max = { op: "constant", value: c.max };
      const groupBy = c.groupBy as { key?: unknown; expectedValues?: unknown } | undefined;
      if (groupBy?.key !== undefined) {
        out.perPartition = {
          key: groupBy.key === "nodeDefId" ? { type: "nodeDefId" } : groupBy.key,
          ...(Array.isArray(groupBy.expectedValues)
            ? { expectedKeys: groupBy.expectedValues }
            : {}),
        };
      }
      return out;
    }
    // Both become a gated `require`: the trigger is the gate, the target the
    // requirement — present for `requires`, absent for `excludes`.
    case "requires":
      return {
        ...base,
        kind: "require",
        when: compare(countOf(c.trigger), "gte", 1),
        condition: compare(countOf(c.target), "gte", 1),
      };
    case "excludes":
      return {
        ...base,
        kind: "require",
        when: compare(countOf(c.trigger), "gte", 1),
        condition: compare(countOf(c.target), "eq", 0),
      };
    default:
      return raw;
  }
}

/** Materialize one generated `limit` per declared resource onto every format. */
function backfillResourceConstraints(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const root = node as Record<string, unknown>;
  const lb = root.listBuilding as Record<string, unknown> | undefined;
  if (!lb || !Array.isArray(lb.formats) || !Array.isArray(lb.resources)) return node;

  const resourceIds = lb.resources.flatMap((r) =>
    r && typeof r === "object" && typeof (r as { id?: unknown }).id === "string"
      ? [(r as { id: string }).id]
      : [],
  );
  if (resourceIds.length === 0) return node;

  const formats = lb.formats.map((format) => {
    if (!format || typeof format !== "object") return format;
    const f = format as Record<string, unknown>;
    const existing = Array.isArray(f.constraints) ? f.constraints : [];
    return {
      ...f,
      constraints: [...existing, ...resourceIds.map((id) => generatedResourceConstraint(id))],
    };
  });

  return { ...root, listBuilding: { ...lb, formats } };
}
