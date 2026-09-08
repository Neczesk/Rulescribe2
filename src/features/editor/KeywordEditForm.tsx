import { Anchor, Badge, Button, Group, Stack, Text, Textarea, TextInput } from "@mantine/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Link, useNavigate } from "react-router";
import { keywordReferences } from "../../core/schema/references";
import type { Keyword } from "../../core/schema/ruleset";
import { currentRulesetStore, type KeywordPatch } from "../../core/state/currentRuleset";
import { EditorToolbar } from "./components/EditorToolbar";
import { ArticleRef } from "./extensions/article-ref/ArticleRef";
import { Callout } from "./extensions/callout/Callout";
import { KeywordRef } from "./extensions/keyword-ref/KeywordRef";
import "./editorContent.css";
import classes from "./KeywordEditForm.module.css";
import { useRuleset } from "./state/useCurrentRuleset";
import { useEditorPaths } from "./state/useEditorPaths";

interface KeywordEditFormProps {
  keyword: Keyword;
}

export function KeywordEditForm({ keyword }: KeywordEditFormProps) {
  const navigate = useNavigate();
  const ruleset = useRuleset();
  const paths = useEditorPaths();
  const keywordId = keyword.id;

  const update = (patch: KeywordPatch) =>
    currentRulesetStore.getState().updateKeyword(keywordId, patch);

  const shortEditor = useEditor(
    {
      extensions: [StarterKit],
      content: keyword.shortText,
      onUpdate: ({ editor }) => update({ shortText: editor.getJSON() }),
    },
    [keywordId],
  );

  const textEditor = useEditor(
    {
      extensions: [StarterKit, Callout, ArticleRef, KeywordRef],
      content: keyword.text,
      onUpdate: ({ editor }) => update({ text: editor.getJSON() }),
    },
    [keywordId],
  );

  const referencedIn = ruleset ? (keywordReferences(ruleset)[keywordId] ?? []) : [];
  const articles = ruleset?.registry.articles ?? {};

  const remove = () => {
    currentRulesetStore.getState().deleteKeyword(keywordId);
    navigate(paths.root);
  };

  return (
    <div className={classes.form}>
      <Group justify="space-between" mb="lg">
        <Group gap="sm">
          <Badge color="accent" variant="light">
            @ Keyword
          </Badge>
          <Text size="sm" c="dimmed">
            Used in {referencedIn.length} {referencedIn.length === 1 ? "article" : "articles"}
          </Text>
        </Group>
        <Button variant="subtle" size="xs" onClick={() => navigate(-1)}>
          ← Back
        </Button>
      </Group>

      <Stack gap="lg">
        <TextInput
          label="Display name"
          value={keyword.displayName}
          onChange={(event) => update({ displayName: event.currentTarget.value })}
        />

        <div className={classes.field}>
          <Text component="label" className={classes.fieldLabel}>
            Short text <span className={classes.hint}>— shown in tooltips and list views</span>
          </Text>
          <div className={classes.shortText}>
            <EditorContent editor={shortEditor} />
          </div>
        </div>

        <div className={classes.field}>
          <Text component="label" className={classes.fieldLabel}>
            Full text <span className={classes.hint}>— the authoritative definition</span>
          </Text>
          <div className={classes.fullText}>
            <EditorToolbar editor={textEditor} compact />
            <EditorContent editor={textEditor} />
          </div>
        </div>

        <Textarea
          label="Notes"
          description="Private, never printed"
          autosize
          minRows={3}
          className={classes.notes}
          value={keyword.notes}
          onChange={(event) => update({ notes: event.currentTarget.value })}
        />

        <div className={classes.field}>
          <Text className={classes.fieldLabel}>Referenced in</Text>
          <Group gap="sm">
            {referencedIn.length === 0 && (
              <Text size="sm" c="dimmed">
                Not referenced yet
              </Text>
            )}
            {referencedIn.map((articleId) => (
              <Anchor key={articleId} component={Link} to={paths.article(articleId)} size="sm">
                {articles[articleId]?.title || "Untitled"}
              </Anchor>
            ))}
          </Group>
        </div>

        <Group>
          <Button variant="subtle" color="red" onClick={remove}>
            Delete keyword
          </Button>
        </Group>
      </Stack>
    </div>
  );
}
