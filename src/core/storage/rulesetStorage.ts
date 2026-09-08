import { createStore, del, entries, get, set } from "idb-keyval";
import dayjs, { type Dayjs } from "dayjs";
import { ruleset, type Ruleset } from "../schema/ruleset";
import { migrate } from "./rulesetMigrate";

const store = createStore("rulescribe", "rulesets");

export interface RulesetSummary {
  id: string;
  title: string;
  updatedAt: Dayjs;
}

/** Plain, structured-clone- and JSON-safe form: Dayjs dates become ISO strings. */
export function serializeRuleset(rs: Ruleset): unknown {
  return {
    ...rs,
    metadata: {
      ...rs.metadata,
      createdAt: rs.metadata.createdAt.toISOString(),
      updatedAt: rs.metadata.updatedAt.toISOString(),
    },
  };
}

export async function saveRuleset(rs: Ruleset): Promise<void> {
  await set(rs.metadata.id, serializeRuleset(rs), store);
}

/**
 * `missing` — no such key. `unreadable` — bytes are present but fail schema
 * validation (corruption, or written by a newer build); the data is still on
 * disk, so callers should surface this rather than treat it as "not found".
 */
export type RulesetLoad =
  | { status: "ok"; ruleset: Ruleset }
  | { status: "missing" }
  | { status: "unreadable" };

export async function loadRulesetResult(id: string): Promise<RulesetLoad> {
  const raw = await get(id, store);
  if (raw === undefined) return { status: "missing" };
  const parsed = ruleset.safeParse(migrate(raw));
  if (!parsed.success) {
    console.error("Stored ruleset failed schema validation", id, parsed.error);
    return { status: "unreadable" };
  }
  return { status: "ok", ruleset: parsed.data };
}

export async function loadRuleset(id: string): Promise<Ruleset | null> {
  const result = await loadRulesetResult(id);
  return result.status === "ok" ? result.ruleset : null;
}

export async function deleteRuleset(id: string): Promise<void> {
  await del(id, store);
}

export async function listRulesets(): Promise<RulesetSummary[]> {
  const rows = await entries<
    string,
    { metadata?: { id?: string; title?: string; updatedAt?: string } }
  >(store);
  return rows
    .map(([key, value]) => ({
      id: value?.metadata?.id ?? key,
      title: value?.metadata?.title ?? "",
      updatedAt: dayjs(value?.metadata?.updatedAt),
    }))
    .sort((a, b) => b.updatedAt.valueOf() - a.updatedAt.valueOf());
}
