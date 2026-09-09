import { useState } from "react";
import { useNavigate } from "react-router";
import { IconPlus } from "../../../app/components/icons";
import type { TodoRef } from "../../../core/schema/references";
import type { Article, Keyword, StructureNode } from "../../../core/schema/ruleset";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { useEditorPaths } from "../state/useEditorPaths";
import classes from "./ArticleDrawer.module.css";
import { KeywordList } from "./KeywordList";
import { StructureTree } from "./StructureTree";
import { TodoList } from "./TodoList";

type DrawerTab = "articles" | "keywords" | "todos";

interface ArticleDrawerProps {
  opened: boolean;
  defaultTab?: DrawerTab;
  root: StructureNode;
  articles: Record<string, Article>;
  selectedId?: string;
  keywords: Record<string, Keyword>;
  references: Record<string, string[]>;
  todos: TodoRef[];
  selectedKeywordId?: string;
}

export function ArticleDrawer({
  opened,
  defaultTab = "articles",
  root,
  articles,
  selectedId,
  keywords,
  references,
  todos,
  selectedKeywordId,
}: ArticleDrawerProps) {
  const navigate = useNavigate();
  const paths = useEditorPaths();
  const [tab, setTab] = useState<DrawerTab>(defaultTab);

  if (!opened) {
    return null;
  }

  const addTopLevel = () => {
    const id = currentRulesetStore.getState().addArticle({ parentId: root.articleId });
    if (id) navigate(paths.article(id));
  };

  const keywordCount = Object.keys(keywords).length;
  const openTodoCount = todos.filter((todo) => !todo.resolved).length;

  return (
    <aside className={classes.drawer}>
      <div className={classes.tabs}>
        <button
          type="button"
          className={tab === "articles" ? `${classes.tab} ${classes.tabOn}` : classes.tab}
          onClick={() => setTab("articles")}
        >
          Articles
        </button>
        <button
          type="button"
          className={tab === "keywords" ? `${classes.tab} ${classes.tabOn}` : classes.tab}
          onClick={() => setTab("keywords")}
        >
          Keywords <span className={classes.tabCount}>{keywordCount}</span>
        </button>
        <button
          type="button"
          className={tab === "todos" ? `${classes.tab} ${classes.tabOn}` : classes.tab}
          onClick={() => setTab("todos")}
        >
          TODOs
          {openTodoCount > 0 && <span className={classes.tabBadge}>{openTodoCount}</span>}
        </button>
      </div>

      {tab === "articles" && (
        <>
          <StructureTree root={root} articles={articles} selectedId={selectedId} />
          <button type="button" className={classes.newArticle} onClick={addTopLevel}>
            <IconPlus size={12} />
            New article
          </button>
        </>
      )}
      {tab === "keywords" && (
        <KeywordList
          keywords={keywords}
          references={references}
          selectedKeywordId={selectedKeywordId}
        />
      )}
      {tab === "todos" && <TodoList todos={todos} />}
    </aside>
  );
}
