import { createStore, del, entries, get, set } from "idb-keyval";
import { list, type List } from "../schema/list";
import { migrateList } from "./listMigrate";

/** Army lists live in their own IndexedDB store, keyed by `list.id`. */
const store = createStore("rulescribe", "lists");

export interface ListSummary {
  id: string;
  name: string;
  rulesetId: string;
  /** ISO string. */
  updatedAt: string;
}

/**
 * Persist a list, stamping `updatedAt` on every write. Returns the stamped copy
 * so the caller can keep its in-memory reference current. Not unit-tested —
 * this module opens IndexedDB at import (`createStore`), so it can't load in
 * Vitest's node env; the pure `migrateList` in `./listMigrate` is tested instead.
 */
export async function saveList(l: List): Promise<List> {
  const stamped: List = { ...l, updatedAt: new Date().toISOString() };
  await set(stamped.id, stamped, store);
  return stamped;
}

/**
 * `missing` — no such key. `unreadable` — bytes are present but fail schema
 * validation; the data is still on disk, so callers should surface this rather
 * than treat it as "not found".
 */
export type ListLoad =
  | { status: "ok"; list: List }
  | { status: "missing" }
  | { status: "unreadable" };

export async function loadListResult(id: string): Promise<ListLoad> {
  const raw = await get(id, store);
  if (raw === undefined) return { status: "missing" };
  const parsed = list.safeParse(migrateList(raw));
  if (!parsed.success) {
    console.error("Stored list failed schema validation", id, parsed.error);
    return { status: "unreadable" };
  }
  return { status: "ok", list: parsed.data };
}

export async function loadList(id: string): Promise<List | null> {
  const result = await loadListResult(id);
  return result.status === "ok" ? result.list : null;
}

export async function deleteList(id: string): Promise<void> {
  await del(id, store);
}

export async function listLists(): Promise<ListSummary[]> {
  const rows = await entries<
    string,
    { id?: string; name?: string; rulesetId?: string; updatedAt?: string }
  >(store);
  return rows
    .map(([key, value]) => ({
      id: value?.id ?? key,
      name: value?.name ?? "",
      rulesetId: value?.rulesetId ?? "",
      updatedAt: value?.updatedAt ?? "",
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}
