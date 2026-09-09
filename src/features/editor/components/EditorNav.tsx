import { ActionIcon, Badge, Button, Group, Menu, Modal, TextInput, Tooltip } from "@mantine/core";
import { lazy, Suspense, useRef, useState } from "react";
import { Link } from "react-router";
import { ThemeToggle } from "../../../app/components/ThemeToggle";
import type { SaveStatus } from "../../../core/state/persistence";
import { IconArrowLeft, IconDots, IconListBuilding, IconMenu, IconStats } from "../icons";
import classes from "./EditorNav.module.css";

/**
 * Lazy so the stats panel's own weight — `text-readability`, and Mermaid when a
 * diagram needs parsing — stays out of the editor bundle until it is opened.
 */
const StatsModal = lazy(() => import("../stats/StatsModal"));

interface EditorNavProps {
  /**
   * Optional breadcrumb title shown after the ruleset name, with an inline
   * editor. The article editor renders its title above the content instead
   * (see `ArticleHeader`) and omits this; the keyword editor still uses it.
   */
  title?: string;
  onTitleChange?: (title: string) => void;
  onToggleDrawer: () => void;
  rulesetTitle: string;
  onRename: (title: string) => void;
  saveStatus: SaveStatus;
  onDownload: () => void | Promise<void>;
  onOpenFile: (file: File) => void;
  /** Route to this ruleset's list-building side. */
  listBuildingHref: string;
  /** Route to this ruleset's export screen. */
  exportHref: string;
}

const SAVE_LABEL: Record<SaveStatus, string> = {
  idle: "Saved",
  saving: "Saving…",
  saved: "Saved",
  error: "Not saved",
};

export function EditorNav({
  title,
  onTitleChange,
  onToggleDrawer,
  rulesetTitle,
  onRename,
  saveStatus,
  onDownload,
  onOpenFile,
  listBuildingHref,
  exportHref,
}: EditorNavProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [renameOpen, setRenameOpen] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [draftName, setDraftName] = useState(rulesetTitle);

  const openRename = () => {
    setDraftName(rulesetTitle);
    setRenameOpen(true);
  };

  const commitRename = () => {
    onRename(draftName.trim() || "Untitled ruleset");
    setRenameOpen(false);
  };

  return (
    <nav className={classes.nav}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/zip,.zip"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          event.currentTarget.value = "";
          if (file) onOpenFile(file);
        }}
      />

      <Modal
        opened={renameOpen}
        onClose={() => setRenameOpen(false)}
        title="Rename ruleset"
        centered
      >
        <TextInput
          data-autofocus
          label="Name"
          value={draftName}
          onChange={(event) => setDraftName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") commitRename();
          }}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="gray" onClick={() => setRenameOpen(false)}>
            Cancel
          </Button>
          <Button onClick={commitRename}>Save</Button>
        </Group>
      </Modal>

      <ActionIcon component={Link} to="/" variant="subtle" color="accent" aria-label="Back to menu">
        <IconArrowLeft />
      </ActionIcon>
      <ActionIcon
        variant="subtle"
        color="accent"
        aria-label="Toggle side navigation"
        onClick={onToggleDrawer}
      >
        <IconMenu />
      </ActionIcon>
      <div className={classes.titleRow}>
        <button type="button" className={classes.rulesetName} onClick={openRename}>
          {rulesetTitle || "Untitled ruleset"}
        </button>
        {title !== undefined && (
          <>
            <span className={classes.sep}>/</span>
            <input
              className={classes.title}
              value={title}
              onChange={(event) => onTitleChange?.(event.currentTarget.value)}
              placeholder="Untitled"
              aria-label="Title"
            />
          </>
        )}
      </div>
      <Button
        component={Link}
        to={listBuildingHref}
        variant="default"
        size="xs"
        leftSection={<IconListBuilding />}
        title="Open the list-building side of this ruleset"
      >
        List building
      </Button>
      <Button
        variant="default"
        size="xs"
        leftSection={<IconStats />}
        title="Ruleset statistics"
        onClick={() => setStatsOpen(true)}
      >
        Stats
      </Button>
      {statsOpen && (
        <Suspense fallback={null}>
          <StatsModal onClose={() => setStatsOpen(false)} />
        </Suspense>
      )}
      <Tooltip
        label="This ruleset could not be written to local storage — your recent changes are only in memory. Use “Save to file” to keep a copy."
        multiline
        w={260}
        disabled={saveStatus !== "error"}
      >
        <Badge
          color={saveStatus === "error" ? "red" : "gray"}
          variant={saveStatus === "error" ? "filled" : "light"}
          radius={0}
          tt="none"
        >
          {SAVE_LABEL[saveStatus]}
        </Badge>
      </Tooltip>
      <ThemeToggle />
      <Menu position="bottom-end" withinPortal shadow="md" width={190}>
        <Menu.Target>
          <ActionIcon variant="subtle" color="accent" aria-label="Ruleset actions">
            <IconDots />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={openRename}>Rename ruleset…</Menu.Item>
          <Menu.Item component={Link} to={exportHref}>
            Export…
          </Menu.Item>
          <Menu.Item onClick={onDownload}>Save to file</Menu.Item>
          <Menu.Item onClick={() => fileInputRef.current?.click()}>Open file…</Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </nav>
  );
}
