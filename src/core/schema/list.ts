import * as z from "zod";
import { shortId } from "../../util/nanoid";
import { selectionEntry } from "./selection";

/**
 * A player's army list — **separate data from the ruleset file**. It points at
 * a ruleset by id and holds the selection tree built against that ruleset's
 * `NodeDef`s.
 *
 * Unlike `ruleset.metadata`, timestamps here are plain ISO strings, not Dayjs:
 * a list has no rich-text or Dayjs fields, so it needs no `serializeList`
 * mirror of `serializeRuleset` — it is already structured-clone/JSON safe.
 */

const ID = z.string().regex(/^[A-Za-z0-9_-]{10}$/);

/** Latest on-disk list schema version this build understands. */
export const LIST_SCHEMA_VERSION = 2;

export const list = z.object({
  schemaVersion: z.int(),
  id: ID.default(shortId),
  /** Which ruleset this list is built against. Required. */
  rulesetId: z.string(),
  name: z.string().default(""),
  createdAt: z.string().default(() => new Date().toISOString()),
  updatedAt: z.string().default(() => new Date().toISOString()),
  /** Chosen `FormatDef` — sets resource caps. */
  formatId: z.string().optional(),
  /** Player-chosen values for resources whose cap is `playerChosen`. */
  resourceCaps: z.record(z.string(), z.number()).default({}),
  /**
   * The single root selection — an Army instance. Absent on a freshly-created
   * list (the player names it and picks a format before choosing an Army);
   * established via `ListEngine.setRoot`.
   */
  root: selectionEntry.optional(),
});

export type List = z.infer<typeof list>;

export function createList(rulesetId: string, name?: string): List {
  return list.parse({
    schemaVersion: LIST_SCHEMA_VERSION,
    rulesetId,
    name: name?.trim() || "",
  });
}
