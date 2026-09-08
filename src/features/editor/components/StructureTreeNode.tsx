import { Menu, Tooltip } from "@mantine/core";
import { useRef, useState } from "react";
import { useDrag, useDrop } from "react-dnd";
import { Link, useNavigate } from "react-router";
import type { Article, StructureNode } from "../../../core/schema/ruleset";
import { findNodeContext, isDescendant } from "../../../core/schema/structure";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { IconChevron, IconDots, IconNote } from "../icons";
import { useIsCollapsed, useToggleCollapsed } from "../state/editorUi";
import { useEditorPaths } from "../state/useEditorPaths";
import classes from "./StructureTreeNode.module.css";

const DND_TYPE = "structure-node";

type DropZone = "before" | "inside" | "after";

interface DragItem {
  articleId: string;
}

interface StructureTreeNodeProps {
  node: StructureNode;
  depth: number;
  root: StructureNode;
  articles: Record<string, Article>;
  selectedId?: string;
  onRequestDelete: (node: StructureNode) => void;
}

export function StructureTreeNode({
  node,
  depth,
  root,
  articles,
  selectedId,
  onRequestDelete,
}: StructureTreeNodeProps) {
  const navigate = useNavigate();
  const paths = useEditorPaths();
  const ref = useRef<HTMLDivElement>(null);
  const [zone, setZone] = useState<DropZone | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const isRoot = node.articleId === root.articleId;
  const context = findNodeContext(root, node.articleId);
  const rawTitle = articles[node.articleId]?.title ?? "";
  const title = rawTitle || "Untitled";
  const isNotes = articles[node.articleId]?.isNotes ?? false;

  const startRename = () => {
    setDraft(rawTitle);
    setEditing(true);
  };

  const commitRename = () => {
    if (!editing) return;
    currentRulesetStore.getState().renameArticle(node.articleId, draft.trim());
    setEditing(false);
  };

  const toggleNotes = () =>
    currentRulesetStore.getState().setArticleIsNotes(node.articleId, !isNotes);
  const hasChildren = node.children.length > 0;
  const collapsed = useIsCollapsed(node.articleId);
  const toggleCollapsed = useToggleCollapsed();

  const [{ isDragging }, drag] = useDrag<DragItem, unknown, { isDragging: boolean }>(
    () => ({
      type: DND_TYPE,
      item: { articleId: node.articleId },
      canDrag: !isRoot,
      collect: (monitor) => ({ isDragging: monitor.isDragging() }),
    }),
    [node.articleId, isRoot],
  );

  const canReceive = (draggedId: string) =>
    draggedId !== node.articleId && !isDescendant(root, draggedId, node.articleId);

  const [{ isOver }, drop] = useDrop<DragItem, unknown, { isOver: boolean }>(
    () => ({
      accept: DND_TYPE,
      canDrop: (item) => canReceive(item.articleId),
      hover: (item, monitor) => {
        if (!ref.current || !canReceive(item.articleId)) {
          setZone(null);
          return;
        }
        const rect = ref.current.getBoundingClientRect();
        const offset = monitor.getClientOffset();
        if (!offset) return;
        const ratio = (offset.y - rect.top) / rect.height;
        // The root can only receive children, never siblings.
        if (isRoot) setZone("inside");
        else if (ratio < 0.3) setZone("before");
        else if (ratio > 0.7) setZone("after");
        else setZone("inside");
      },
      drop: (item, monitor) => {
        if (monitor.didDrop() || !canReceive(item.articleId)) return;
        const resolved = isRoot ? "inside" : (zone ?? "inside");
        if (resolved === "inside") {
          currentRulesetStore.getState().moveNode(item.articleId, {
            parentId: node.articleId,
            index: node.children.length,
          });
        } else if (context?.parent) {
          currentRulesetStore.getState().moveNode(item.articleId, {
            parentId: context.parent.articleId,
            index: resolved === "before" ? context.index : context.index + 1,
          });
        }
      },
      collect: (monitor) => ({ isOver: monitor.isOver({ shallow: true }) }),
    }),
    [
      node.articleId,
      node.children.length,
      context?.parent?.articleId,
      context?.index,
      zone,
      isRoot,
    ],
  );

  // Callback ref: connectors run when React attaches the node, never during render.
  const connectRef = (el: HTMLDivElement | null) => {
    ref.current = el;
    drag(el);
    drop(el);
  };

  const addAt = (parentId: string, index?: number) => {
    const id = currentRulesetStore.getState().addArticle({ parentId, index });
    if (id) navigate(paths.article(id));
  };

  const activeZone = isOver ? zone : null;

  return (
    <>
      <div
        ref={connectRef}
        className={classes.row}
        style={{ paddingLeft: `calc(${depth} * var(--space-4) + var(--space-2))` }}
        data-root={isRoot || undefined}
        data-notes={isNotes || undefined}
        data-selected={node.articleId === selectedId || undefined}
        data-dragging={isDragging || undefined}
        data-zone={activeZone ?? undefined}
      >
        {hasChildren ? (
          <button
            type="button"
            className={classes.chevron}
            data-open={!collapsed || undefined}
            onClick={() => toggleCollapsed(node.articleId)}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            <IconChevron />
          </button>
        ) : (
          <span className={classes.chevronSpacer} />
        )}

        {editing ? (
          <input
            className={classes.renameInput}
            autoFocus
            draggable={false}
            value={draft}
            onChange={(event) => setDraft(event.currentTarget.value)}
            onFocus={(event) => event.currentTarget.select()}
            onMouseDown={(event) => event.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(event) => {
              if (event.key === "Enter") commitRename();
              else if (event.key === "Escape") setEditing(false);
            }}
          />
        ) : (
          <Link
            to={paths.article(node.articleId)}
            className={classes.title}
            onDoubleClick={(event) => {
              event.preventDefault();
              startRename();
            }}
          >
            {title}
          </Link>
        )}

        {!isRoot && !editing && (
          <Tooltip
            label={isNotes ? "Notes article — excluded from export" : "Mark as notes article"}
            position="top"
            withArrow
          >
            <button
              type="button"
              className={classes.notesButton}
              data-on={isNotes || undefined}
              aria-label={isNotes ? "Unmark as notes article" : "Mark as notes article"}
              aria-pressed={isNotes}
              onClick={toggleNotes}
            >
              <IconNote size={15} />
            </button>
          </Tooltip>
        )}

        <Menu position="bottom-end" withinPortal shadow="md" width={190}>
          <Menu.Target>
            <button
              type="button"
              className={classes.menuButton}
              aria-label={`Actions for ${title}`}
            >
              <IconDots />
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item onClick={() => addAt(node.articleId)}>Add child</Menu.Item>
            {context?.parent && (
              <>
                <Menu.Item onClick={() => addAt(context.parent!.articleId, context.index)}>
                  Add sibling above
                </Menu.Item>
                <Menu.Item onClick={() => addAt(context.parent!.articleId, context.index + 1)}>
                  Add sibling below
                </Menu.Item>
              </>
            )}
            <Menu.Divider />
            <Menu.Item onClick={startRename}>Rename</Menu.Item>
            {!isRoot && (
              <Menu.Item onClick={toggleNotes}>
                {isNotes ? "Unmark as notes" : "Mark as notes"}
              </Menu.Item>
            )}
            {!isRoot && (
              <Menu.Item color="red" onClick={() => onRequestDelete(node)}>
                Delete
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>

      {!collapsed &&
        node.children.map((child) => (
          <StructureTreeNode
            key={child.articleId}
            node={child}
            depth={depth + 1}
            root={root}
            articles={articles}
            selectedId={selectedId}
            onRequestDelete={onRequestDelete}
          />
        ))}
    </>
  );
}
