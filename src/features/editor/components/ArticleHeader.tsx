import { Switch, Tooltip } from "@mantine/core";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import classes from "./ArticleHeader.module.css";

interface ArticleHeaderProps {
  articleId: string;
  title: string;
  isNotes: boolean;
  /** The root article can't be flagged as notes — it's the ruleset itself. */
  isRoot: boolean;
}

export function ArticleHeader({ articleId, title, isNotes, isRoot }: ArticleHeaderProps) {
  return (
    <div className={classes.header} data-notes={isNotes || undefined}>
      <input
        className={classes.title}
        value={title}
        onChange={(event) =>
          currentRulesetStore.getState().renameArticle(articleId, event.currentTarget.value)
        }
        placeholder="Untitled"
        aria-label="Article title"
      />
      {!isRoot && (
        <Tooltip
          label="Notes articles are left out of the exported ruleset"
          position="left"
          withArrow
        >
          <Switch
            className={classes.notesToggle}
            size="sm"
            label="Notes"
            checked={isNotes}
            onChange={(event) =>
              currentRulesetStore
                .getState()
                .setArticleIsNotes(articleId, event.currentTarget.checked)
            }
          />
        </Tooltip>
      )}
    </div>
  );
}
