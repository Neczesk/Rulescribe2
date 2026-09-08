import { useStore } from "zustand/react";
import { currentRulesetStore } from "../../../core/state/currentRuleset";

export function useRuleset() {
  return useStore(currentRulesetStore, (state) => state.ruleset);
}
