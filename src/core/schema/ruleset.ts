import * as z from "zod";
import { shortId } from "../../util/nanoid";
import dayjs, { type Dayjs } from "dayjs";
import { diagramEntry } from "./diagram";
import { categoryRecord, listBuilding, nodeDef } from "./listBuilding";

import { EMPTY_DOC, richText } from "./richText";

export { EMPTY_DOC, richText } from "./richText";
export type { RichText } from "./richText";

const ID = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

export const article = z.object({
  id: ID.default(shortId),
  title: z.string().default(""),
  shortText: richText.default(structuredClone(EMPTY_DOC)),
  text: richText.default(structuredClone(EMPTY_DOC)),
  notes: z.string().default(""),
  /**
   * A "notes" article — scratch/working content that is excluded from the
   * exported ruleset. It still lives in the structure tree and is fully
   * editable; export just skips it.
   */
  isNotes: z.boolean().default(false),
});

export type Article = z.infer<typeof article>;

export const keyword = z.object({
  id: ID.default(shortId),
  displayName: z.string().default(""),
  shortText: richText.default(structuredClone(EMPTY_DOC)),
  text: richText.default(structuredClone(EMPTY_DOC)),
  notes: z.string().default(""),
});

export type Keyword = z.infer<typeof keyword>;

/**
 * A node in the article hierarchy. Holds only an `articleId` (the content lives
 * in `registry.articles`) and its ordered child nodes, nested to any depth.
 * `ruleset.structure` is the single fixed **root** node: its article is the
 * ruleset's root article, and the root is never deleted, moved, or dragged.
 */
export const structureNode = z.object({
  articleId: z.string(),
  get children() {
    return z.array(structureNode);
  },
});

export type StructureNode = z.infer<typeof structureNode>;

/**
 * Accepts a `Dayjs`, or an ISO string / epoch number / `Date` (as produced by
 * `JSON.stringify` or `structuredClone`), coercing to `Dayjs` so a ruleset
 * survives a serialize → parse round-trip through IndexedDB or a file.
 */
const zodDay = z.preprocess(
  (val) =>
    val instanceof Date || typeof val === "string" || typeof val === "number" ? dayjs(val) : val,
  z.custom<Dayjs>((val) => dayjs.isDayjs(val) && (val as Dayjs).isValid(), "Invalid date"),
);

export const metadata = z.object({
  id: ID.default(shortId),
  title: z.string().default(""),
  author: z.string().default(""),
  createdAt: zodDay.default(dayjs),
  updatedAt: zodDay.default(dayjs),
});

export type Metadata = z.infer<typeof metadata>;

export const imageWrap = z.enum(["none", "left", "right"]);

export type ImageWrap = z.infer<typeof imageWrap>;

/**
 * Metadata for an inserted image — never the image bytes themselves. The blob
 * lives in a separate IndexedDB store (`core/storage/imageStorage.ts`) keyed by
 * this `id`; it's fine for the blob to go missing (corrupted import, cleared
 * store) as long as this entry and the referencing node's layout survive.
 */
export const imageAsset = z.object({
  id: ID.default(shortId),
  mimeType: z.string().default(""),
  width: z.number().int().positive().default(1),
  height: z.number().int().positive().default(1),
  filename: z.string().default(""),
});

export type ImageAsset = z.infer<typeof imageAsset>;

export const registry = z.object({
  articles: z.record(ID, article),
  keywords: z.record(ID, keyword),
  images: z.record(ID, imageAsset).default({}),
  diagrams: z.record(ID, diagramEntry).default({}),
  /** List-builder node templates (units, detachments, models, upgrades — all `NodeDef`). */
  nodeDefs: z.record(ID, nodeDef).default({}),
  /** Concrete data instances (factions, subfactions, …) conforming to a `CategoryDef`. */
  categoryRecords: z.record(ID, categoryRecord).default({}),
});

export type Registry = z.infer<typeof registry>;

export const ruleset = z.object({
  schemaVersion: z.int(),
  metadata,
  registry,
  structure: structureNode,
  /** List-builder resources, fields, formats and detachment structures. Absent on pre-v5 rulesets. */
  listBuilding: listBuilding.optional(),
});

export type Ruleset = z.infer<typeof ruleset>;
