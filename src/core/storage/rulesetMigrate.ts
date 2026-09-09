import { shortId } from "../../util/nanoid";
import { generatedResourceConstraint } from "../engine/resourceConstraints";

/**
 * Pure forward-migration for stored rulesets. Deliberately free of
 * `idb-keyval` so it can be unit-tested under Vitest's node environment
 * (importing `rulesetStorage` opens IndexedDB at module load).
 */

/** Latest on-disk schema version this build understands. */
export const CURRENT_SCHEMA_VERSION = 14;

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
 *
 * v13->v14 introduces the `todo` rich-text node. `rewriteTodos` finds the exact
 * string "TODO" in any article body/short-text block and turns that word plus
 * the rest of its sentence into a `todo` node (the leading "TODO" stripped from
 * the stored text). Needs a real transform, below.
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
  if (version < 14) migrated = rewriteTodos(migrated);
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

// ---------------------------------------------------------------------------
// v13 -> v14: the `todo` rich-text node.
// ---------------------------------------------------------------------------

type DocNode = {
  type?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
  text?: string;
};

const SENTENCE_TERMINATOR = /[.!?]/;

/** Concatenate the plain text of a block's immediate inline children. */
function inlineText(block: DocNode): string {
  return (block.content ?? [])
    .map((child) => (child.type === "text" ? (child.text ?? "") : ""))
    .join("");
}

const textBlock = (
  type: string,
  attrs: Record<string, unknown> | undefined,
  value: string,
): DocNode => ({
  type,
  ...(attrs ? { attrs } : {}),
  content: [{ type: "text", text: value }],
});

/**
 * If `block` is a paragraph/heading whose text contains the exact string
 * "TODO", return the blocks that replace it: the text before the TODO
 * sentence (same block type, if any), the new `todo` node, then the text
 * after (if any). Returns `null` when there's nothing to convert.
 * Only the first "TODO" in the block is converted.
 */
function splitBlockOnTodo(block: DocNode): DocNode[] | null {
  if (block.type !== "paragraph" && block.type !== "heading") return null;
  const flat = inlineText(block);
  const at = flat.indexOf("TODO");
  if (at === -1) return null;

  // Sentence start: just after the previous terminator that is followed by
  // whitespace, else the block start. Then skip the gap whitespace.
  let start = 0;
  for (let i = at - 1; i >= 0; i--) {
    if (SENTENCE_TERMINATOR.test(flat[i]) && (i + 1 >= flat.length || /\s/.test(flat[i + 1]))) {
      start = i + 1;
      break;
    }
  }
  while (start < at && /\s/.test(flat[start])) start++;

  // Sentence end: the next terminator at or after "TODO", inclusive; else end.
  let end = flat.length;
  for (let i = at; i < flat.length; i++) {
    if (SENTENCE_TERMINATOR.test(flat[i])) {
      end = i + 1;
      break;
    }
  }

  const before = flat.slice(0, start).replace(/\s+$/, "");
  const sentence = flat.slice(start, end);
  const after = flat.slice(end).replace(/^\s+/, "");
  const todoText = sentence.replace(/^TODO[\s:–—-]*/, "").trim();

  const out: DocNode[] = [];
  if (before) out.push(textBlock(block.type, block.attrs, before));
  out.push({ type: "todo", attrs: { todoId: shortId(), text: todoText, resolved: false } });
  if (after) out.push(textBlock(block.type, block.attrs, after));
  return out;
}

/** Rewrite one rich-text doc, expanding any "TODO" sentence into a `todo` node. */
function rewriteTodosInDoc(doc: unknown): unknown {
  if (!doc || typeof doc !== "object") return doc;
  const d = doc as DocNode;
  if (!Array.isArray(d.content)) return doc;

  let changed = false;
  const content: DocNode[] = [];
  for (const block of d.content) {
    const split = splitBlockOnTodo(block);
    if (split) {
      content.push(...split);
      changed = true;
    } else {
      content.push(block);
    }
  }
  return changed ? { ...d, content } : doc;
}

/** Deep-clone `node`, rewriting every article's `text` / `shortText` doc. */
function rewriteTodos(node: unknown): unknown {
  if (!node || typeof node !== "object") return node;
  const root = node as Record<string, unknown>;
  const registry = root.registry as Record<string, unknown> | undefined;
  const articles = registry?.articles as Record<string, unknown> | undefined;
  if (!articles) return node;

  let changed = false;
  const nextArticles: Record<string, unknown> = {};
  for (const [id, article] of Object.entries(articles)) {
    if (!article || typeof article !== "object") {
      nextArticles[id] = article;
      continue;
    }
    const a = article as Record<string, unknown>;
    const text = rewriteTodosInDoc(a.text);
    const shortText = rewriteTodosInDoc(a.shortText);
    if (text !== a.text || shortText !== a.shortText) {
      nextArticles[id] = { ...a, text, shortText };
      changed = true;
    } else {
      nextArticles[id] = article;
    }
  }
  if (!changed) return node;
  return { ...root, registry: { ...registry, articles: nextArticles } };
}
