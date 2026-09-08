import { Link, useNavigate } from "react-router";
import type { CategoryDef } from "../../core/schema/listBuilding";
import { currentRulesetStore } from "../../core/state/currentRuleset";
import { listBuildingHomeView } from "./homeView";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

const actions = () => currentRulesetStore.getState();

export function CategoriesPage() {
  const ruleset = useRuleset();
  const navigate = useNavigate();

  if (!ruleset) return null;

  const categories = ruleset.listBuilding?.categories ?? [];
  const tiles = listBuildingHomeView(ruleset);
  const countOf = (id: string) =>
    [...tiles.nodeCategories, ...tiles.recordCategories].find((t) => t.id === id)?.count ?? 0;

  const nodeCategories = categories.filter((c) => c.kind !== "record");
  const recordCategories = categories.filter((c) => c.kind === "record");

  const add = (kind: CategoryDef["kind"]) => {
    const id = actions().addCategory({ kind });
    if (id) navigate(`${id}/fields`);
  };

  return (
    <div className={classes.content}>
      <div className={classes.pageHead}>
        <div className={classes.pageHeadText}>
          <h1 className={classes.pageTitle}>Categories</h1>
          <div className={classes.pageSub}>
            A named set of fields that many things share — node types and records alike. The fields
            become the columns when you browse them.
          </div>
        </div>
        <div style={{ display: "flex", gap: "var(--space-2)", flexWrap: "wrap" }}>
          <button type="button" className={classes.primaryBtn} onClick={() => add("node")}>
            + Node category
          </button>
          <button type="button" className={classes.secondaryBtn} onClick={() => add("record")}>
            + Record category
          </button>
        </div>
      </div>

      {categories.length === 0 ? (
        <div className={classes.emptyState}>
          No categories yet. Add one to define the fields its node types or records share.
        </div>
      ) : (
        <>
          <CategoryGroup label="Node types" categories={nodeCategories} countOf={countOf} />
          <CategoryGroup label="Records" categories={recordCategories} countOf={countOf} />
        </>
      )}
    </div>
  );
}

interface CategoryGroupProps {
  label: string;
  categories: CategoryDef[];
  countOf: (id: string) => number;
}

function CategoryGroup({ label, categories, countOf }: CategoryGroupProps) {
  if (categories.length === 0) return null;
  const noun = label === "Records" ? "records" : "node types";

  return (
    <section className={classes.section}>
      <h2 className={classes.sectionTitle}>{label}</h2>
      <div className={classes.rowList}>
        {categories.map((category) => (
          <div key={category.id} className={classes.row}>
            <div className={classes.rowHead}>
              <span className={classes.rowName}>{category.name || "Untitled category"}</span>
              <span className={classes.rowMeta}>
                {countOf(category.id)} {noun} · {category.fields.length} field
                {category.fields.length === 1 ? "" : "s"}
              </span>
              <Link to={`${category.id}/fields`} className={classes.ghostBtn}>
                Fields
              </Link>
              <Link to={category.id} className={classes.ghostBtn}>
                Browse →
              </Link>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
