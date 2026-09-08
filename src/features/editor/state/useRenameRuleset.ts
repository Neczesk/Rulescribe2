import { useLocation, useNavigate } from "react-router";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { rulesetSlugId } from "../paths";
import { useRuleset } from "./useCurrentRuleset";

/** Rename the active ruleset and refresh the slug in the URL, keeping the current sub-path. */
export function useRenameRuleset(): (title: string) => void {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  const location = useLocation();

  return (title) => {
    if (!ruleset) return;
    currentRulesetStore.getState().renameRuleset(title);
    const parts = location.pathname.split("/"); // ["", "editor", "<slugId>", ...rest]
    parts[2] = rulesetSlugId({ id: ruleset.metadata.id, title });
    navigate(parts.join("/"), { replace: true });
  };
}
