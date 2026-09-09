import { Divider, Menu } from "@mantine/core";
import type { Editor } from "@tiptap/core";
import { useEditorState } from "@tiptap/react";
import { IconBulletList, IconCallout, IconNumberedList, IconTable, IconTodo } from "../icons";
import { createTableContent } from "../extensions/table/tableExtensions";
import { ArticleRefToolbarButton } from "./ArticleRefToolbarButton";
import { DiagramToolbarButton } from "./DiagramToolbarButton";
import classes from "./EditorToolbar.module.css";
import { ImageToolbarButton } from "./ImageToolbarButton";
import { ToolbarButton } from "./ToolbarButton";

interface EditorToolbarProps {
  editor: Editor | null;
  /** Hide headings + tables — used by the keyword full-text editor. */
  compact?: boolean;
}

export function EditorToolbar({ editor, compact = false }: EditorToolbarProps) {
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            underline: editor.isActive("underline"),
            h1: editor.isActive("heading", { level: 1 }),
            h2: editor.isActive("heading", { level: 2 }),
            bulletList: editor.isActive("bulletList"),
            orderedList: editor.isActive("orderedList"),
            callout: editor.isActive("callout"),
            inTable: editor.isActive("table"),
          }
        : null,
  });

  return (
    <div className={classes.toolbar}>
      <ToolbarButton
        label="B"
        bold
        aria-label="Bold"
        active={state?.bold}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        label="I"
        italic
        aria-label="Italic"
        active={state?.italic}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        label="U"
        underline
        aria-label="Underline"
        active={state?.underline}
        onClick={() => editor?.chain().focus().toggleUnderline().run()}
      />
      {!compact && (
        <>
          <Divider orientation="vertical" />
          <ToolbarButton
            label="H1"
            aria-label="Heading 1"
            active={state?.h1}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
          />
          <ToolbarButton
            label="H2"
            aria-label="Heading 2"
            active={state?.h2}
            onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
          />
        </>
      )}
      <Divider orientation="vertical" />
      <ToolbarButton
        icon={<IconBulletList />}
        aria-label="Bullet list"
        active={state?.bulletList}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        icon={<IconNumberedList />}
        aria-label="Numbered list"
        active={state?.orderedList}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      />
      {!compact && (
        <Menu position="bottom-start" withinPortal shadow="md" width={200}>
          <Menu.Target>
            <ToolbarButton icon={<IconTable />} aria-label="Table" active={state?.inTable} />
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              onClick={() => editor?.chain().focus().insertContent(createTableContent(3, 3)).run()}
            >
              Insert table
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              disabled={!state?.inTable}
              onClick={() => editor?.chain().focus().addRowBefore().run()}
            >
              Add row above
            </Menu.Item>
            <Menu.Item
              disabled={!state?.inTable}
              onClick={() => editor?.chain().focus().addRowAfter().run()}
            >
              Add row below
            </Menu.Item>
            <Menu.Item
              disabled={!state?.inTable}
              onClick={() => editor?.chain().focus().addColumnBefore().run()}
            >
              Add column left
            </Menu.Item>
            <Menu.Item
              disabled={!state?.inTable}
              onClick={() => editor?.chain().focus().addColumnAfter().run()}
            >
              Add column right
            </Menu.Item>
            <Menu.Divider />
            <Menu.Item
              disabled={!state?.inTable}
              onClick={() => editor?.chain().focus().deleteRow().run()}
            >
              Delete row
            </Menu.Item>
            <Menu.Item
              disabled={!state?.inTable}
              onClick={() => editor?.chain().focus().deleteColumn().run()}
            >
              Delete column
            </Menu.Item>
            <Menu.Item
              color="red"
              disabled={!state?.inTable}
              onClick={() => editor?.chain().focus().deleteTable().run()}
            >
              Delete table
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      )}
      <ToolbarButton
        icon={<IconCallout />}
        label="Callout"
        aria-label="Callout"
        active={state?.callout}
        onClick={() => editor?.chain().focus().toggleCallout().run()}
      />
      <ToolbarButton
        icon={<IconTodo />}
        label="TODO"
        aria-label="Insert TODO"
        onClick={() => editor?.chain().focus().insertTodo().run()}
      />
      <Divider orientation="vertical" />
      <ImageToolbarButton editor={editor} />
      <DiagramToolbarButton editor={editor} />
      <ArticleRefToolbarButton editor={editor} />
      <ToolbarButton
        label="@ Keyword"
        bold
        aria-label="Link to keyword"
        onClick={() => editor?.chain().focus().insertContent("@").run()}
      />
    </div>
  );
}
