import { Group, Modal, Stack, Textarea, TextInput } from "@mantine/core";
import { useEffect, useRef, useState } from "react";
import { currentRulesetStore } from "../../../../../core/state/currentRuleset";
import { useRuleset } from "../../../state/useCurrentRuleset";
import { renderMermaidSvg } from "../renderMermaidSvg";

export function MermaidEditModal({
  diagramId,
  onClose,
}: {
  diagramId: string;
  onClose: () => void;
}) {
  const ruleset = useRuleset();
  const entry = ruleset?.registry.diagrams[diagramId];
  const previewRef = useRef<HTMLDivElement>(null);

  const [name, setName] = useState(entry?.name ?? "");
  const [source, setSource] = useState(entry && entry.kind === "mermaid" ? entry.source : "");
  const [notes, setNotes] = useState(entry && "notes" in entry ? entry.notes : "");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    renderMermaidSvg(source, `diagram-edit-${diagramId}`)
      .then((svg) => {
        if (cancelled || !previewRef.current) return;
        previewRef.current.innerHTML = svg;
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to render");
      });
    return () => {
      cancelled = true;
    };
  }, [source, diagramId]);

  if (!entry || entry.kind !== "mermaid") return null;

  const save = () => {
    currentRulesetStore.getState().updateDiagram(diagramId, { name, notes, source });
    onClose();
  };

  return (
    <Modal opened onClose={save} title="Edit diagram" size="90%" trapFocus>
      <Stack gap="sm">
        <TextInput
          size="xs"
          label="Name"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
        <Group align="flex-start" grow>
          <Textarea
            size="xs"
            label="Mermaid source"
            autosize
            minRows={12}
            value={source}
            onChange={(event) => setSource(event.currentTarget.value)}
            styles={{ input: { fontFamily: "monospace" } }}
          />
          <div>
            <div ref={previewRef} />
            {error && <div style={{ color: "var(--mantine-color-red-6)" }}>{error}</div>}
          </div>
        </Group>
        <Textarea
          size="xs"
          label="Notes (private, excluded from export)"
          autosize
          minRows={2}
          value={notes}
          onChange={(event) => setNotes(event.currentTarget.value)}
        />
      </Stack>
    </Modal>
  );
}
