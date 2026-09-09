import StarterKit from "@tiptap/starter-kit";
import { ArticleRef } from "../extensions/article-ref/ArticleRef";
import { Callout } from "../extensions/callout/Callout";
import { DiagramRef } from "../extensions/diagram-ref/DiagramRef";
import { ImageBlock } from "../extensions/image-block/ImageBlock";
import { KeywordRef } from "../extensions/keyword-ref/KeywordRef";
import { tableExtensions } from "../extensions/table/tableExtensions";
import { Todo } from "../extensions/todo/Todo";

/**
 * The exact extension set the article editor uses (`EditorPage.tsx`), so
 * `generateHTML` builds the same schema and the custom nodes' static
 * `renderHTML` runs. Those `renderHTML` implementations read the *current*
 * ruleset from `currentRulesetStore`, so generation must happen while the
 * export route is mounted (its parent loader has the ruleset loaded).
 *
 * This module pulls the full TipTap stack; it is only ever imported from the
 * lazy `export` route, keeping that weight out of the shell and editor chunks.
 */
export const EXPORT_EXTENSIONS = [
  StarterKit,
  Callout,
  Todo,
  ArticleRef,
  KeywordRef,
  ImageBlock,
  DiagramRef,
  ...tableExtensions,
];
