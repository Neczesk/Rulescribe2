import { Modal, Stack, Textarea, TextInput } from "@mantine/core";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import { useRef, useState } from "react";
import { currentRulesetStore } from "../../../../../core/state/currentRuleset";
import { useRuleset } from "../../../state/useCurrentRuleset";

/**
 * This module is only ever reached via a lazy `import()` from
 * `DiagramRefView`/`DiagramInsertModal` — `@excalidraw/excalidraw` and its
 * CSS are statically imported here, but since this whole module is one
 * dynamic-import chunk boundary, that still keeps Excalidraw out of the
 * editor's main bundle.
 */
export function ExcalidrawEditModal({
  diagramId,
  onClose,
}: {
  diagramId: string;
  onClose: () => void;
}) {
  const ruleset = useRuleset();
  const entry = ruleset?.registry.diagrams[diagramId];
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);

  const [name, setName] = useState(entry?.name ?? "");
  const [notes, setNotes] = useState(entry && "notes" in entry ? entry.notes : "");

  if (!entry || entry.kind !== "excalidraw") return null;

  const save = () => {
    const api = apiRef.current;
    if (api) {
      currentRulesetStore.getState().updateDiagram(diagramId, {
        name,
        notes,
        scene: { elements: [...api.getSceneElements()], appState: api.getAppState() },
      });
    } else {
      currentRulesetStore.getState().updateDiagram(diagramId, { name, notes });
    }
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
        <div style={{ height: "70vh" }}>
          <Excalidraw
            excalidrawAPI={(api) => {
              apiRef.current = api;
            }}
            initialData={{ elements: entry.scene.elements, appState: entry.scene.appState }}
          />
        </div>
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
