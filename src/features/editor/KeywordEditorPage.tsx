import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Navigate, useParams } from "react-router";
import { keywordReferences } from "../../core/schema/references";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { useState } from "react";
import { ArticleDrawer } from "./components/ArticleDrawer";
import { EditorNav } from "./components/EditorNav";
import classes from "./EditorPage.module.css";
import { KeywordEditForm } from "./KeywordEditForm";
import { useRuleset } from "./state/useCurrentRuleset";
import { useEditorPaths } from "./state/useEditorPaths";
import { useRenameRuleset } from "./state/useRenameRuleset";
import { useRulesetFileActions } from "./state/useRulesetFileActions";

export function KeywordEditorPage() {
  const [drawerOpened, setDrawerOpened] = useState(true);
  const ruleset = useRuleset();
  const { keywordId } = useParams();
  const paths = useEditorPaths();
  const renameRuleset = useRenameRuleset();
  const fileActions = useRulesetFileActions();

  const keyword = ruleset && keywordId ? ruleset.registry.keywords[keywordId] : undefined;

  if (!ruleset) {
    return <Navigate to="/" replace />;
  }

  if (!keyword) {
    return <Navigate to={paths.root} replace />;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={classes.shell}>
        <EditorNav
          title={keyword.displayName}
          onTitleChange={(displayName) =>
            currentRulesetStore.getState().updateKeyword(keyword.id, { displayName })
          }
          onToggleDrawer={() => setDrawerOpened((o) => !o)}
          rulesetTitle={ruleset.metadata.title}
          onRename={renameRuleset}
          saveStatus={fileActions.saveStatus}
          onDownload={fileActions.onDownload}
          onOpenFile={fileActions.onOpenFile}
          listBuildingHref={paths.listBuilding}
        />
        <div className={classes.body}>
          <ArticleDrawer
            opened={drawerOpened}
            defaultTab="keywords"
            root={ruleset.structure}
            articles={ruleset.registry.articles}
            keywords={ruleset.registry.keywords}
            references={keywordReferences(ruleset)}
            selectedKeywordId={keyword.id}
          />
          <div className={classes.article}>
            <KeywordEditForm keyword={keyword} />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
