import { Popover } from "@mantine/core";
import type { Editor } from "@tiptap/core";
import { useState } from "react";
import { EMPTY_SCENE } from "../../../core/schema/diagram";
import { currentRulesetStore } from "../../../core/state/currentRuleset";
import { IconDiagram } from "../icons";
import { useRuleset } from "../state/useCurrentRuleset";
import { DiagramSearch } from "./DiagramSearch";
import { ToolbarButton } from "./ToolbarButton";

interface DiagramToolbarButtonProps {
  editor: Editor | null;
}

export function DiagramToolbarButton({ editor }: DiagramToolbarButtonProps) {
  const [opened, setOpened] = useState(false);
  const ruleset = useRuleset();
  const diagrams = ruleset?.registry.diagrams ?? {};

  const insert = (diagramId: string) => {
    editor
      ?.chain()
      .focus()
      .insertDiagramRef({ diagramId, displayScale: 1, caption: "", wrap: "none" })
      .run();
    setOpened(false);
  };

  const createAndInsert = (kind: "excalidraw" | "mermaid") => {
    const id = currentRulesetStore
      .getState()
      .addDiagram(
        kind === "excalidraw"
          ? { kind: "excalidraw", name: "", notes: "", scene: EMPTY_SCENE }
          : { kind: "mermaid", name: "", notes: "", source: "graph TD;\nA-->B;" },
      );
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
          icon={<IconDiagram />}
          label="Diagram"
          aria-label="Insert diagram"
          active={opened}
          onClick={() => setOpened((value) => !value)}
        />
      </Popover.Target>
      <Popover.Dropdown>
        <DiagramSearch diagrams={diagrams} onPick={insert} onCreate={createAndInsert} />
      </Popover.Dropdown>
    </Popover>
  );
}
