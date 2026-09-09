import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { Navigate, useParams } from "react-router";
import { keywordReferences, todoReferences } from "../../core/schema/references";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { ArticleDrawer } from "./components/ArticleDrawer";
import { ArticleHeader } from "./components/ArticleHeader";
import { EditorNav } from "./components/EditorNav";
import { EditorToolbar } from "./components/EditorToolbar";
import { ArticleRef } from "./extensions/article-ref/ArticleRef";
import { Callout } from "./extensions/callout/Callout";
import { DiagramRef } from "./extensions/diagram-ref/DiagramRef";
import { ImageBlock } from "./extensions/image-block/ImageBlock";
import {
  insertImageBlockAtSelection,
  prepareImageInsert,
} from "./extensions/image-block/insertImage";
import { KeywordRef } from "./extensions/keyword-ref/KeywordRef";
import { tableExtensions } from "./extensions/table/tableExtensions";
import { Todo } from "./extensions/todo/Todo";
import "./editorContent.css";
import classes from "./EditorPage.module.css";
import { useRuleset } from "./state/useCurrentRuleset";
import { useEditorPaths } from "./state/useEditorPaths";
import { useRenameRuleset } from "./state/useRenameRuleset";
import { useRulesetFileActions } from "./state/useRulesetFileActions";

export function EditorPage() {
  const [drawerOpened, setDrawerOpened] = useState(true);
  const ruleset = useRuleset();
  const { articleId } = useParams();
  const paths = useEditorPaths();
  const renameRuleset = useRenameRuleset();
  const fileActions = useRulesetFileActions();

  const selectedId = articleId ?? ruleset?.structure.articleId;
  const article = ruleset && selectedId ? ruleset.registry.articles[selectedId] : undefined;

  const editor = useEditor(
    {
      extensions: [
        StarterKit,
        Callout,
        Todo,
        ArticleRef,
        KeywordRef,
        ImageBlock,
        DiagramRef,
        ...tableExtensions,
      ],
      content: article?.text,
      onUpdate: ({ editor }) => {
        if (!selectedId) return;
        currentRulesetStore.getState().updateArticleText(selectedId, editor.getJSON());
      },
      editorProps: {
        handlePaste: (view, event) => {
          const files = [...(event.clipboardData?.files ?? [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length === 0) return false;
          for (const file of files) {
            void prepareImageInsert(file).then((attrs) => insertImageBlockAtSelection(view, attrs));
          }
          return true;
        },
        handleDrop: (view, event) => {
          const files = [...(event.dataTransfer?.files ?? [])].filter((file) =>
            file.type.startsWith("image/"),
          );
          if (files.length === 0) return false;
          event.preventDefault();
          for (const file of files) {
            void prepareImageInsert(file).then((attrs) => insertImageBlockAtSelection(view, attrs));
          }
          return true;
        },
      },
    },
    [selectedId],
  );

  if (!ruleset) {
    return <Navigate to="/" replace />;
  }

  if (!article) {
    return <Navigate to={paths.root} replace />;
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className={classes.shell}>
        <EditorNav
          onToggleDrawer={() => setDrawerOpened((o) => !o)}
          rulesetTitle={ruleset.metadata.title}
          onRename={renameRuleset}
          saveStatus={fileActions.saveStatus}
          onDownload={fileActions.onDownload}
          onOpenFile={fileActions.onOpenFile}
          listBuildingHref={paths.listBuilding}
          exportHref={paths.export}
        />
        <EditorToolbar editor={editor} />
        <div className={classes.body}>
          <ArticleDrawer
            opened={drawerOpened}
            defaultTab="articles"
            root={ruleset.structure}
            articles={ruleset.registry.articles}
            selectedId={selectedId!}
            keywords={ruleset.registry.keywords}
            references={keywordReferences(ruleset)}
            todos={todoReferences(ruleset)}
          />
          <div className={classes.article}>
            <ArticleHeader
              articleId={selectedId!}
              title={article.title}
              isNotes={article.isNotes}
              isRoot={selectedId === ruleset.structure.articleId}
            />
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>
    </DndProvider>
  );
}
