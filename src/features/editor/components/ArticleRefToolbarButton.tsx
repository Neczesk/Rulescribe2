import { Popover } from "@mantine/core";
import type { Editor } from "@tiptap/core";
import { useState } from "react";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { IconArticleLink } from "../icons";
import { useRuleset } from "../state/useCurrentRuleset";
import { ArticleRefSearch } from "./ArticleRefSearch";
import { ToolbarButton } from "./ToolbarButton";

interface ArticleRefToolbarButtonProps {
  editor: Editor | null;
}

export function ArticleRefToolbarButton({ editor }: ArticleRefToolbarButtonProps) {
  const [opened, setOpened] = useState(false);
  const ruleset = useRuleset();
  const articles = ruleset?.registry.articles ?? {};

  const insert = (articleId: string) => {
    editor?.chain().focus().insertArticleRef({ articleId }).run();
    setOpened(false);
  };

  const createAndInsert = (title: string) => {
    if (!ruleset) return;
    const id = currentRulesetStore
      .getState()
      .addArticle({ parentId: ruleset.structure.articleId, title });
    if (id) insert(id);
  };

  return (
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
        <ToolbarButton
          icon={<IconArticleLink />}
          label="Article"
          aria-label="Link to article"
          active={opened}
          onClick={() => setOpened((value) => !value)}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <ArticleRefSearch articles={articles} onPick={insert} onCreate={createAndInsert} />
      </Popover.Dropdown>
    </Popover>
  );
}
