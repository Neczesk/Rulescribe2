import { Button, Group, Modal, SimpleGrid, Text, TextInput } from "@mantine/core";
import { useRef, useState } from "react";
import { useLoaderData, useNavigate, useSearchParams } from "react-router";
import { createRuleset } from "../core/schema/createRuleset";
import { currentRulesetStore } from "../core/state/currentRuleset";
import { readRulesetFile } from "../core/storage/rulesetFile";
import { type RulesetSummary, saveRuleset } from "../core/storage/rulesetStorage";
import { rulesetSlugId } from "../features/editor/paths";
import { FeatureCard } from "./components/FeatureCard";
import { IconListBuilder, IconRulesetEditor } from "./components/icons";
import { RecentItemRow } from "./components/RecentItemRow";
import classes from "./MainMenu.module.css";

export function MainMenu() {
  const navigate = useNavigate();
  const recents = useLoaderData() as RulesetSummary[];
  const [searchParams] = useSearchParams();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const shownError =
    error ??
    (searchParams.has("unreadable")
      ? "That ruleset couldn't be opened — its saved data appears to be corrupted or was written by a newer version. If you have a backup file, use “Open file” to restore it."
      : null);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [newName, setNewName] = useState("");

  const openRuleset = (id: string, title: string) => {
    navigate(`/editor/${rulesetSlugId({ id, title })}`);
  };

  const createNamedRuleset = async () => {
    const rs = createRuleset(newName);
    await saveRuleset(rs);
    currentRulesetStore.getState().setRuleset(rs);
    setNameModalOpen(false);
    setNewName("");
    navigate(`/editor/${rulesetSlugId(rs.metadata)}`);
  };

  const onFilePicked = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(null);
    try {
      const rs = await readRulesetFile(file);
      await saveRuleset(rs);
      currentRulesetStore.getState().setRuleset(rs);
      navigate(`/editor/${rulesetSlugId(rs.metadata)}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open that file.");
    }
  };

  return (
    <div className={classes.main}>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/zip,.zip"
        hidden
        onChange={onFilePicked}
      />

      <Modal
        opened={nameModalOpen}
        onClose={() => setNameModalOpen(false)}
        title="New ruleset"
        centered
      >
        <TextInput
          data-autofocus
          label="Name"
          placeholder="Untitled ruleset"
          value={newName}
          onChange={(event) => setNewName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") void createNamedRuleset();
          }}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" color="gray" onClick={() => setNameModalOpen(false)}>
            Cancel
          </Button>
          <Button onClick={() => void createNamedRuleset()}>Create</Button>
        </Group>
      </Modal>

      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" className={classes.features}>
        <FeatureCard
          icon={<IconRulesetEditor />}
          title="Ruleset Editor"
          description="Write and format the rules for a game of your own design."
          primaryLabel="New ruleset"
          onPrimaryClick={() => {
            setNewName("");
            setNameModalOpen(true);
          }}
          secondaryLabel="Open file"
          onSecondaryClick={() => fileInputRef.current?.click()}
        />
        <FeatureCard
          icon={<IconListBuilder />}
          title="List Builder"
          description="Build army lists using a ruleset you've written."
          primaryLabel="New list"
          secondaryLabel="Open existing"
        />
      </SimpleGrid>

      {shownError && (
        <Text c="red" size="sm" mb="sm">
          {shownError}
        </Text>
      )}

      <Text component="h3" className={classes.recentLabel}>
        Recent
      </Text>
      <div>
        {recents.length === 0 && (
          <Text size="sm" c="dimmed">
            No rulesets yet — create one to get started.
          </Text>
        )}
        {recents.map((item) => (
          <RecentItemRow
            key={item.id}
            name={item.title || "Untitled ruleset"}
            tagLabel="Ruleset"
            tagVariant="accent"
            meta={item.updatedAt.isValid() ? `Edited ${item.updatedAt.fromNow()}` : ""}
            onOpen={() => openRuleset(item.id, item.title)}
          />
        ))}
      </div>
    </div>
  );
}
