import { useStore } from "zustand/react";
import { currentRulesetStore } from "../../../core/state/currentRuleset";

/** The ruleset currently loaded by the `editor/:rulesetId` route's loader. */
export function useRuleset() {
  return useStore(currentRulesetStore, (state) => state.ruleset);
}
