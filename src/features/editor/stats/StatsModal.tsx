import { Button, CloseButton, Group, Loader, Modal } from "@mantine/core";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import {
  buildRulesetStats,
  buildStatsContext,
  runConsistencyChecks,
  type IssueTarget,
  type StatsExtras,
} from "../../../core/stats";
import { downloadFile } from "../export/download";
import { useRuleset } from "../state/useCurrentRuleset";
import { useEditorPaths } from "../state/useEditorPaths";
import { gatherStatsExtras } from "./gatherStatsExtras";
import { IssueRow } from "./IssueRow";
import { OverviewTab } from "./OverviewTab";
import classes from "./StatsModal.module.css";
import { issuesToCsv } from "./statsCsv";

interface StatsModalProps {
  onClose: () => void;
}

/**
 * Ruleset statistics and consistency checks, per the design canvas. The checks
 * run once when the modal opens: everything but the image-store and Mermaid
 * lookups is pure and synchronous, so it is derived in render rather than kept
 * in state.
 */
export default function StatsModal({ onClose }: StatsModalProps) {
  const ruleset = useRuleset();
  const paths = useEditorPaths();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "checks">("overview");
  const [extras, setExtras] = useState<StatsExtras | null>(null);

  // Genuine outside-world sync: what the image store holds, and whether Mermaid
  // can parse each diagram. Everything downstream is derived, never stored.
  useEffect(() => {
    if (!ruleset) return;
    let cancelled = false;
    void gatherStatsExtras(ruleset).then((result) => {
      if (!cancelled) setExtras(result);
    });
    return () => {
      cancelled = true;
    };
  }, [ruleset]);

  if (!ruleset) return null;

  const context = extras ? buildStatsContext(ruleset, extras) : null;
  const issues = context ? runConsistencyChecks(context) : [];
  const stats = context ? buildRulesetStats(context) : null;

  const goTo = (target: IssueTarget) => {
    navigate(target.kind === "article" ? paths.article(target.id) : paths.keyword(target.id));
    onClose();
  };

  const updated = ruleset.metadata.updatedAt;

  return (
    <Modal
      opened
      onClose={onClose}
      size={860}
      padding={0}
      withCloseButton={false}
      title={undefined}
      aria-label="Ruleset statistics"
    >
      <div className={classes.header}>
        <div>
          <div className={classes.heading}>Ruleset statistics</div>
          <div className={classes.subheading}>
            {ruleset.metadata.title || "Untitled ruleset"}
            {updated.isValid() ? ` · last edited ${updated.fromNow()}` : ""}
          </div>
        </div>
        <div className={classes.tabs}>
          <Button
            size="xs"
            variant={tab === "overview" ? "filled" : "subtle"}
            color={tab === "overview" ? undefined : "gray"}
            onClick={() => setTab("overview")}
          >
            Overview
          </Button>
          <Button
            size="xs"
            variant={tab === "checks" ? "filled" : "subtle"}
            color={tab === "checks" ? undefined : "gray"}
            onClick={() => setTab("checks")}
          >
            Consistency{" "}
            {stats ? <span style={{ opacity: 0.65 }}>&nbsp;{issues.length}</span> : null}
          </Button>
          <CloseButton aria-label="Close statistics" onClick={onClose} />
        </div>
      </div>

      <div className={classes.body}>
        {!stats ? (
          <Group justify="center" py="xl">
            <Loader size="sm" />
          </Group>
        ) : tab === "overview" ? (
          <OverviewTab stats={stats} issues={issues} />
        ) : (
          <section>
            <div className={classes.sectionHead}>Consistency checks</div>
            {issues.length === 0 ? (
              <p className={classes.clean}>Nothing to report — every check passed.</p>
            ) : (
              issues.map((issue) => (
                <IssueRow key={`${issue.code}-${issue.title}`} issue={issue} onNavigate={goTo} />
              ))
            )}
            <div className={classes.panelNote}>
              Checks run when this panel opens and are purely structural — broken, empty, circular,
              duplicate or unlinked. Filled dots break an export; hollow dots are advisory.
            </div>
          </section>
        )}
      </div>

      <div className={classes.footer}>
        <span className={classes.footerNote}>
          Counts cover the rules side of the ruleset; list-building checks are not in this pass.
        </span>
        <Group ml="auto" gap="xs">
          <Button
            size="xs"
            variant="default"
            disabled={issues.length === 0}
            onClick={() =>
              downloadFile(
                `${ruleset.metadata.title || "ruleset"} consistency.csv`,
                issuesToCsv(issues),
                "text/csv;charset=utf-8",
              )
            }
          >
            Export CSV
          </Button>
          <Button size="xs" onClick={onClose}>
            Done
          </Button>
        </Group>
      </div>
    </Modal>
  );
}
