import { Button, Group, ScrollArea, Stack, Text, TextInput, UnstyledButton } from "@mantine/core";
import { useState } from "react";
import type { DiagramEntry } from "../../../core/schema/diagram";
import classes from "./ArticleRefSearch.module.css";

interface DiagramSearchProps {
  diagrams: Record<string, DiagramEntry>;
  onPick: (diagramId: string) => void;
  onCreate: (kind: "excalidraw" | "mermaid") => void;
}

export function DiagramSearch({ diagrams, onPick, onCreate }: DiagramSearchProps) {
  const [query, setQuery] = useState("");
  const trimmed = query.trim().toLowerCase();
  const entries = Object.values(diagrams);

  const matches = entries
    .filter((entry) => (trimmed ? (entry.name || "").toLowerCase().includes(trimmed) : true))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  return (
    <Stack gap="xs">
      <Group grow>
        <Button size="xs" variant="light" onClick={() => onCreate("excalidraw")}>
          New sketch
        </Button>
        <Button size="xs" variant="light" onClick={() => onCreate("mermaid")}>
          New flowchart
        </Button>
      </Group>
      {entries.length > 0 && (
        <>
          <div className={classes.divider} />
          <TextInput
            size="xs"
            placeholder="Search diagrams…"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
          <ScrollArea.Autosize mah={180} type="hover">
            <Stack gap={2}>
              {matches.map((entry) => (
                <UnstyledButton
                  key={entry.id}
                  className={classes.row}
                  onClick={() => onPick(entry.id)}
                >
                  {entry.name || "Untitled diagram"}{" "}
                  <Text component="span" size="xs" c="dimmed">
                    ({entry.kind})
                  </Text>
                </UnstyledButton>
              ))}
              {matches.length === 0 && (
                <Text size="xs" c="dimmed" px="xs" py={4}>
                  No matching diagrams
                </Text>
              )}
            </Stack>
          </ScrollArea.Autosize>
        </>
      )}
    </Stack>
  );
}
