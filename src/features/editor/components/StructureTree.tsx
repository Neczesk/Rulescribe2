import { Button, Group, Modal, Text } from "@mantine/core";
import { useState } from "react";
import { useNavigate } from "react-router";
import type { Article, StructureNode } from "../../../core/schema/ruleset";
import { collectArticleIds } from "../../../core/schema/structure";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { useEditorPaths } from "../state/useEditorPaths";
import { StructureTreeNode } from "./StructureTreeNode";
import classes from "./StructureTree.module.css";

interface StructureTreeProps {
  root: StructureNode;
  articles: Record<string, Article>;
  selectedId?: string;
}

export function StructureTree({ root, articles, selectedId }: StructureTreeProps) {
  const navigate = useNavigate();
  const paths = useEditorPaths();
  const [deleteTarget, setDeleteTarget] = useState<StructureNode | null>(null);

  const confirmDelete = () => {
    if (!deleteTarget) return;
    const removed = collectArticleIds(deleteTarget);
    currentRulesetStore.getState().deleteArticle(deleteTarget.articleId);
    if (selectedId !== undefined && removed.includes(selectedId)) navigate(paths.root);
    setDeleteTarget(null);
  };

  const deleteCount = deleteTarget ? collectArticleIds(deleteTarget).length : 0;

  return (
    <div className={classes.tree}>
      <StructureTreeNode
        node={root}
        depth={0}
        root={root}
        articles={articles}
        selectedId={selectedId}
        onRequestDelete={(node) => setDeleteTarget(node)}
      />

      <Modal
        opened={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        title="Delete article"
        centered
      >
        <Text size="sm">
          {deleteCount === 1
            ? "This article will be permanently removed."
            : `This article and its ${deleteCount - 1} nested ${
                deleteCount - 1 === 1 ? "article" : "articles"
              } will be permanently removed.`}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="gray" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button color="red" onClick={confirmDelete}>
            Delete
          </Button>
        </Group>
      </Modal>
    </div>
  );
}
