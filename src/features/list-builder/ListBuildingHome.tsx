import { Link, useNavigate } from "react-router";
import type { CategoryDef } from "../../core/schema/listBuilding";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { type CategoryTile, type FoundationPanel, listBuildingHomeView } from "./homeView";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const PANEL_ROUTES: Record<FoundationPanel["key"], string> = {
  categories: "categories",
  formats: "formats",
  resources: "resources",
};

export function ListBuildingHome() {
  const ruleset = useRuleset();
  const navigate = useNavigate();
  if (!ruleset) return null;

  const view = listBuildingHomeView(ruleset);

  const addCategory = (kind: CategoryDef["kind"]) => {
    const id = currentRulesetStore.getState().addCategory({ kind });
    if (id) navigate(`categories/${id}/fields`);
  };

  return (
    <div className={classes.content}>
      <div className={classes.pageHead}>
        <div className={classes.pageHeadText}>
          <h1 className={classes.pageTitle}>List building</h1>
          <div className={classes.pageSub}>Rules for what a player may put in a list.</div>
        </div>
        <button type="button" className={classes.ghostBtn} disabled>
          Import from another ruleset
        </button>
      </div>

      <div className={classes.foundGrid}>
        {view.foundations.map((panel) => (
          <FoundationCard key={panel.key} panel={panel} />
        ))}
      </div>

      <CategorySection
        title="Node types"
        hint="Things with a cost, slots and options."
        tiles={view.nodeCategories}
        newLabel="+ New category"
        emptyHint="No node categories yet."
        onNew={() => addCategory("node")}
      />

      <CategorySection
        title="Records"
        hint="Pure data — no cost, no slots. Other things reference them."
        tiles={view.recordCategories}
        newLabel="+ New record category"
        emptyHint="No record categories yet."
        onNew={() => addCategory("record")}
      />
    </div>
  );
}

function FoundationCard({ panel }: { panel: FoundationPanel }) {
  const to = PANEL_ROUTES[panel.key];
  return (
    <div className={classes.foundPanel}>
      <div className={classes.foundPanelHead}>
        <Link to={to} className={classes.foundPanelName}>
          {panel.name}
        </Link>
        <span className={classes.foundPanelCount}>{panel.count}</span>
      </div>
      <div className={classes.foundPanelItems}>
        {panel.items.length === 0 ? (
          <span className={classes.foundPanelEmpty}>Nothing defined yet.</span>
        ) : (
          panel.items.map((item, index) => (
            <div key={`${item}-${index}`} className={classes.foundPanelItem}>
              {item}
            </div>
          ))
        )}
      </div>
      <Link to={to} className={`${classes.ghostBtn} ${classes.ghostBtnFlush}`}>
        {panel.addLabel}
      </Link>
    </div>
  );
}

interface CategorySectionProps {
  title: string;
  hint: string;
  tiles: CategoryTile[];
  newLabel: string;
  emptyHint: string;
  onNew: () => void;
}

function CategorySection({ title, hint, tiles, newLabel, emptyHint, onNew }: CategorySectionProps) {
  return (
    <section className={classes.section}>
      <div className={classes.sectionHead}>
        <h2 className={classes.sectionTitle}>{title}</h2>
        <span className={classes.sectionHint}>
          {hint}
          {tiles.length === 0 && ` ${emptyHint}`}
        </span>
      </div>
      <div className={classes.tileRow}>
        {tiles.map((tile) => (
          <Link key={tile.id} to={`categories/${tile.id}`} className={classes.tile}>
            <span className={classes.tileCount}>
              {tile.count} {tile.count === 1 ? "entry" : "entries"}
            </span>
            <span className={classes.tileName}>{tile.name}</span>
          </Link>
        ))}
        <button type="button" className={classes.tileNew} onClick={onNew}>
          {newLabel}
        </button>
      </div>
    </section>
  );
}
