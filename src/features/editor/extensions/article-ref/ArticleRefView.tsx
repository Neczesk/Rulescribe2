import { Button, Menu, Popover, Text } from "@mantine/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useState } from "react";
import { richTextToPlainText } from "../../../../core/schema/references";
import { currentRulesetStore } from "../../../../core/state/currentRuleset";
import { ArticleRefSearch } from "../../components/ArticleRefSearch";
import { useRuleset } from "../../state/useCurrentRuleset";
import {
  MISSING_ARTICLE_LABEL,
  REF_DISPLAY_LABELS,
  REF_DISPLAY_MODES,
  normalizeDisplay,
  resolveArticleRefText,
} from "../refDisplay";

export function ArticleRefView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [opened, setOpened] = useState(false);
  const ruleset = useRuleset();
  const articleId = node.attrs.articleId as string | null;
  const articles = ruleset?.registry.articles ?? {};
  const article = articleId ? articles[articleId] : undefined;
  const display = normalizeDisplay(node.attrs.display);
  const title = article?.title?.trim() || MISSING_ARTICLE_LABEL;
  const excerpt = richTextToPlainText(article?.shortText).slice(0, 160);
  const shownText = resolveArticleRefText(ruleset, articleId, display);

  const retarget = (id: string) => {
    updateAttributes({ articleId: id });
    setOpened(false);
  };

  const createAndTarget = (newTitle: string) => {
    if (!ruleset) return;
    const id = currentRulesetStore
      .getState()
      .addArticle({ parentId: ruleset.structure.articleId, title: newTitle });
    if (id) retarget(id);
  };

  return (
    <NodeViewWrapper as="span" className="article-ref-wrapper">
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        withArrow
        shadow="md"
        width={280}
        trapFocus
      >
        <Popover.Target>
          {display === "link" ? (
            <a
              className="article-ref"
              data-missing={article ? undefined : "true"}
              contentEditable={false}
              href={articleId ? `#article-${articleId}` : "#"}
              onClick={(event) => {
                event.preventDefault();
                setOpened((value) => !value);
              }}
            >
              {shownText}
            </a>
          ) : (
            <span
              className="article-ref article-ref--live"
              data-missing={article ? undefined : "true"}
              contentEditable={false}
              onClick={() => setOpened((value) => !value)}
            >
              {shownText}
            </span>
          )}
        </Popover.Target>
        <Popover.Dropdown>
          <Text size="sm" fw={700} mb={excerpt ? 4 : 8}>
            {title}
          </Text>
          {excerpt && (
            <Text size="xs" c="dimmed" mb={8}>
              {excerpt}
            </Text>
          )}
          <ArticleRefSearch
            articles={articles}
            onPick={retarget}
            onCreate={createAndTarget}
            footer={
              <Button size="xs" variant="subtle" color="red" onClick={() => deleteNode()}>
                Remove link
              </Button>
            }
          />
        </Popover.Dropdown>
      </Popover>
      <Menu position="bottom-start" withArrow shadow="md" width={190}>
        <Menu.Target>
          <button
            type="button"
            className="ref-caret"
            contentEditable={false}
            aria-label="Change reference field"
          >
            ▾
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          {REF_DISPLAY_MODES.map((mode) => (
            <Menu.Item key={mode} onClick={() => updateAttributes({ display: mode })}>
              <Text size="sm" fw={mode === display ? 700 : undefined}>
                {REF_DISPLAY_LABELS[mode]}
              </Text>
            </Menu.Item>
          ))}
        </Menu.Dropdown>
      </Menu>
    </NodeViewWrapper>
  );
}
