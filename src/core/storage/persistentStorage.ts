/**
 * Ask the browser to place this origin's storage in the **persistent** bucket.
 *
 * Without this, IndexedDB is "best-effort": it can be evicted under disk
 * pressure, and WebKit deletes script-writable storage 7 days after the last
 * visit for sites that aren't installed. Since this app is the only copy of the
 * user's rulesets, we want the durable bucket.
 *
 * Best-effort and side-effect-only: never throws, safe to call unawaited on
 * startup. Returns whether storage is persisted afterwards (for logging/tests).
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;
  try {
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
