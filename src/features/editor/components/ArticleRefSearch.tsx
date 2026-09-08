import { ScrollArea, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import type { ReactNode } from "react";
import { useState } from "react";
import type { Article } from "../../../core/schema/ruleset";
import classes from "./ArticleRefSearch.module.css";

interface ArticleRefSearchProps {
  articles: Record<string, Article>;
  onPick: (articleId: string) => void;
  onCreate?: (title: string) => void;
  footer?: ReactNode;
}

export function ArticleRefSearch({ articles, onPick, onCreate, footer }: ArticleRefSearchProps) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim();
  const entries = Object.values(articles);

  const matches = entries
    .filter((article) =>
      trimmed ? (article.title || "").toLowerCase().includes(trimmed.toLowerCase()) : true,
    )
    .sort((a, b) => (a.title || "").localeCompare(b.title || ""));

  const exactExists = entries.some(
    (article) => (article.title || "").toLowerCase() === trimmed.toLowerCase(),
  );

  return (
    <Stack gap="xs">
      <TextInput
        data-autofocus
        size="xs"
        placeholder="Search articles…"
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <ScrollArea.Autosize mah={220} type="hover">
        <Stack gap={2}>
          {matches.map((article) => (
            <UnstyledButton
              key={article.id}
              className={classes.row}
              onClick={() => onPick(article.id)}
            >
              {article.title || "Untitled article"}
            </UnstyledButton>
          ))}
          {matches.length === 0 && !onCreate && (
            <Text size="xs" c="dimmed" px="xs" py={4}>
              No matching articles
            </Text>
          )}
          {onCreate && trimmed && !exactExists && (
            <UnstyledButton className={classes.row} onClick={() => onCreate(trimmed)}>
              Create “{trimmed}”
            </UnstyledButton>
          )}
        </Stack>
      </ScrollArea.Autosize>
      {footer && (
        <>
          <div className={classes.divider} />
          {footer}
        </>
      )}
    </Stack>
  );
}
