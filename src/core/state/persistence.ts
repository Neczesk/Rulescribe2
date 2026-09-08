import { createStore } from "zustand/vanilla";
import { saveRuleset } from "../storage/rulesetStorage";
import { currentRulesetStore } from "./currentRuleset";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export const saveStatusStore = createStore<{ status: SaveStatus }>(() => ({ status: "idle" }));

const DEBOUNCE_MS = 600;
let timer: ReturnType<typeof setTimeout> | undefined;
let started = false;

/**
 * Begin mirroring the active ruleset to IndexedDB. Every mutation flows through
 * `currentRulesetStore`'s `patch()` (which produces a new `ruleset` reference),
 * so a store subscription plus a short debounce is the whole persistence loop.
 */
export function initPersistence(): void {
  if (started) return;
  started = true;

  currentRulesetStore.subscribe((state, prev) => {
    if (!state.ruleset || state.ruleset === prev.ruleset) return;

    saveStatusStore.setState({ status: "saving" });
    if (timer) clearTimeout(timer);
    const snapshot = state.ruleset;
    timer = setTimeout(() => {
      void saveRuleset(snapshot)
        .then(() => saveStatusStore.setState({ status: "saved" }))
        .catch((err) => {
          // Swallowing this is how a full quota / blocked IndexedDB / aborted
          // transaction turns into silent, unbounded loss of the user's work.
          console.error("Failed to save ruleset to IndexedDB", err);
          saveStatusStore.setState({ status: "error" });
        });
    }, DEBOUNCE_MS);
  });
}
