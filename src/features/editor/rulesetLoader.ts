import { redirect, type LoaderFunctionArgs } from "react-router";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { loadRulesetResult } from "../../core/storage/rulesetStorage";
import { parseRulesetId } from "./paths";

/**
 * Ensures the ruleset named in the URL is the one in the store. Runs only when
 * `:rulesetId` changes, so navigating between articles/keywords of the same
 * ruleset never reloads (and never clobbers unsaved in-memory edits).
 */
export async function rulesetLoader({ params }: LoaderFunctionArgs) {
  const id = parseRulesetId(params.rulesetId);
  const current = currentRulesetStore.getState().ruleset;
  if (current?.metadata.id === id) return null;

  const result = await loadRulesetResult(id);
  if (result.status === "unreadable") throw redirect("/?unreadable=1");
  if (result.status === "missing") throw redirect("/");

  currentRulesetStore.getState().setRuleset(result.ruleset);
  return null;
}
