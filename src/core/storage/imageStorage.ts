import { createStore, del, get, keys, set } from "idb-keyval";

/**
 * Raw image bytes, kept out of the ruleset JSON so the (frequently
 * debounce-saved) ruleset blob stays small. `registry.images` in the ruleset
 * only holds metadata; this store is the other half of that split, keyed by
 * the same image id. A missing entry here is tolerated everywhere it's read.
 *
 * This is a separate IndexedDB database from `rulesetStorage.ts`'s
 * `"rulescribe"` DB, not a second object store within it — idb-keyval's
 * `createStore` only creates a store during the database's initial creation
 * (`onupgradeneeded`), so adding a store to an already-existing "rulescribe"
 * database (as installed by earlier versions of this app) would silently
 * never create it, causing every read/write here to throw `NotFoundError`.
 */
const store = createStore("rulescribe-images", "images");

export async function saveImageBlob(id: string, blob: Blob): Promise<void> {
  await set(id, blob, store);
}

export async function loadImageBlob(id: string): Promise<Blob | null> {
  const blob = await get<Blob>(id, store);
  return blob ?? null;
}

export async function deleteImageBlob(id: string): Promise<void> {
  await del(id, store);
}

export async function listImageBlobIds(): Promise<string[]> {
  return (await keys(store)) as string[];
}
