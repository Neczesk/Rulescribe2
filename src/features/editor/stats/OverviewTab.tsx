import type { BarRow, RulesetStats, Severity, StatsIssue } from "../../../core/stats";
import classes from "./StatsModal.module.css";

interface OverviewTabProps {
  stats: RulesetStats;
  issues: StatsIssue[];
}

/**
 * The design's Overview tab. Its "contributors" and "edits, last 30 days"
 * panels are not built: the app stores no edit history or authorship, so the
 * two slots carry Coverage and the issue mix instead.
 */
export function OverviewTab({ stats, issues }: OverviewTabProps) {
  const { coverage, reading } = stats;
  const topKeywords = stats.keywordUsage.slice(0, 6);

  return (
    <>
      <section>
        <div className={classes.sectionHead}>Size</div>
        <div className={classes.figures}>
          {stats.figures.map((figure) => (
            <div key={figure.label} className={classes.figure}>
              <div className={classes.figureNumber}>{figure.value}</div>
              <div className={classes.figureLabel}>{figure.label}</div>
              <div className={classes.figureSub}>{figure.sub}</div>
            </div>
          ))}
        </div>
      </section>

      <div className={classes.two}>
        <section>
          <div className={classes.sectionHead}>Most used keywords</div>
          <Bars rows={topKeywords} />
          <div className={classes.panelNote}>
            {topKeywords.length > 0
              ? "Number of articles referencing each keyword."
              : "No keywords defined yet."}
          </div>
        </section>

        <section>
          <div className={classes.sectionHead}>How references render</div>
          <Bars rows={stats.referenceModes} />
          <div className={classes.panelNote}>
            Live references re-read their source on every render; links only carry the name.
          </div>
        </section>
      </div>

      <div className={classes.two}>
        <section>
          <div className={classes.sectionHead}>Reading level · Flesch–Kincaid</div>
          <div className={classes.big}>
            <div className={classes.bigNumber}>{reading.grade.toFixed(1)}</div>
            <div className={classes.panelNote} style={{ marginTop: 0 }}>
              grade level across all articles.
              <br />
              Average sentence {reading.averageSentenceWords} words; {reading.aboveThreshold}{" "}
              {reading.aboveThreshold === 1 ? "article scores" : "articles score"} above{" "}
              {reading.threshold}.
            </div>
          </div>
        </section>

        <section>
          <div className={classes.sectionHead}>Coverage</div>
          <div className={classes.big}>
            <div className={classes.bigNumber}>
              {coverage.articlesWithText}/{coverage.articles}
            </div>
            <div className={classes.panelNote} style={{ marginTop: 0 }}>
              articles have body text.
              <br />
              {coverage.keywordsWithFullText} of {coverage.keywords} keywords have a full text;{" "}
              {coverage.notesArticles} notes{" "}
              {coverage.notesArticles === 1 ? "article is" : "articles are"} excluded from the
              rulebook.
            </div>
          </div>
        </section>
      </div>

      <section>
        <div className={classes.sectionHead}>Consistency</div>
        <div className={classes.figures}>
          {(["severe", "minor", "info"] as Severity[]).map((severity) => (
            <div key={severity} className={classes.figure}>
              <div className={classes.figureNumber}>
                {issues.filter((issue) => issue.severity === severity).length}
              </div>
              <div className={classes.figureLabel}>{severity}</div>
              <div className={classes.figureSub}>{SEVERITY_SUB[severity]}</div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

const SEVERITY_SUB: Record<Severity, string> = {
  severe: "breaks an export",
  minor: "stale or misleading",
  info: "worth knowing",
};

/** The design's horizontal bars, scaled against the largest row. */
function Bars({ rows }: { rows: BarRow[] }) {
  const max = rows.reduce((highest, row) => Math.max(highest, row.value), 0);
  return (
    <div>
      {rows.map((row) => (
        <div key={row.name} className={classes.bar}>
          <span className={classes.barName} title={row.name}>
            {row.name}
          </span>
          <span className={classes.barTrack}>
            <span
              className={classes.barFill}
              style={{ width: max > 0 ? `${Math.round((row.value / max) * 100)}%` : "0%" }}
            />
          </span>
          <span className={classes.barValue}>{row.value}</span>
        </div>
      ))}
    </div>
  );
}
