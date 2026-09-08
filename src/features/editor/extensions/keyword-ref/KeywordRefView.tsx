import { Anchor, Button, Menu, Popover, Stack, Text, Textarea, TextInput } from "@mantine/core";
import type { JSONContent } from "@tiptap/core";
import type { NodeViewProps } from "@tiptap/react";
import { NodeViewWrapper } from "@tiptap/react";
import { useState } from "react";
import { Link } from "react-router";
import { richTextToPlainText } from "../../../../core/schema/references";
import { currentRulesetStore } from "../../../../core/state/currentRuleset";
import { useRuleset } from "../../state/useCurrentRuleset";
import { useEditorPaths } from "../../state/useEditorPaths";
import {
  REF_DISPLAY_LABELS,
  REF_DISPLAY_MODES,
  normalizeDisplay,
  resolveKeywordRefText,
} from "../refDisplay";

const textToDoc = (value: string): JSONContent => ({
  type: "doc",
  content: [
    value ? { type: "paragraph", content: [{ type: "text", text: value }] } : { type: "paragraph" },
  ],
});

export function KeywordRefView({ node, updateAttributes, deleteNode }: NodeViewProps) {
  const [opened, setOpened] = useState(false);
  const ruleset = useRuleset();
  const paths = useEditorPaths();
  const keywordId = node.attrs.keywordId as string | null;
  const keyword = keywordId ? ruleset?.registry.keywords[keywordId] : undefined;
  const display = normalizeDisplay(node.attrs.display);
  const shortText = richTextToPlainText(keyword?.shortText);
  const shownText = resolveKeywordRefText(ruleset, keywordId, display);

  return (
    <NodeViewWrapper as="span" className="keyword-ref-wrapper">
      <Popover
        opened={opened}
        onChange={setOpened}
        position="bottom-start"
        withArrow
        shadow="md"
        width={300}
        trapFocus
      >
        <Popover.Target>
          <span
            className={display === "link" ? "keyword-ref" : "keyword-ref keyword-ref--live"}
            data-missing={keyword ? undefined : "true"}
            title={shortText || undefined}
            contentEditable={false}
            onClick={() => setOpened((value) => !value)}
          >
            {shownText}
          </span>
        </Popover.Target>
        <Popover.Dropdown>
          {keyword ? (
            <Stack gap="sm">
              <Text size="sm" fw={700}>
                Quick edit keyword
              </Text>
              <TextInput
                size="xs"
                label="Display name"
                value={keyword.displayName}
                onChange={(event) =>
                  currentRulesetStore
                    .getState()
                    .updateKeyword(keyword.id, { displayName: event.currentTarget.value })
                }
              />
              <Textarea
                size="xs"
                label="Short text"
                autosize
                minRows={2}
                value={shortText}
                onChange={(event) =>
                  currentRulesetStore
                    .getState()
                    .updateKeyword(keyword.id, { shortText: textToDoc(event.currentTarget.value) })
                }
              />
              <Anchor component={Link} to={paths.keyword(keyword.id)} size="xs">
                Open full editor →
              </Anchor>
              <Button size="xs" variant="subtle" color="red" onClick={() => deleteNode()}>
                Remove reference
              </Button>
            </Stack>
          ) : (
            <Stack gap="sm">
              <Text size="sm">This keyword no longer exists.</Text>
              <Button size="xs" variant="subtle" color="red" onClick={() => deleteNode()}>
                Remove reference
              </Button>
            </Stack>
          )}
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
