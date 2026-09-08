import { useNavigate } from "react-router";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { downloadRuleset, readRulesetFile } from "../../../core/storage/rulesetFile";
import { saveRuleset } from "../../../core/storage/rulesetStorage";
import { rulesetSlugId } from "../paths";
import { useRuleset } from "./useCurrentRuleset";
import { useSaveStatus } from "./useSaveStatus";

/** Save-status + file export/import wiring shared by the editor pages' nav. */
export function useRulesetFileActions() {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  const saveStatus = useSaveStatus();

  const onDownload = async () => {
    if (ruleset) await downloadRuleset(ruleset);
  };

  const onOpenFile = async (file: File) => {
    try {
      const opened = await readRulesetFile(file);
      await saveRuleset(opened);
      currentRulesetStore.getState().setRuleset(opened);
      navigate(`/editor/${rulesetSlugId(opened.metadata)}`);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Could not open that file.");
    }
  };

  return { saveStatus, onDownload, onOpenFile };
}
