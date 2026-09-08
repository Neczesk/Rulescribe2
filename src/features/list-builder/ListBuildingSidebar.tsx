import { NavLink } from "react-router";
import { type CategoryTile, type ListBuildingHomeView } from "./homeView";
import classes from "./listBuilding.module.css";

const navClass = ({ isActive }: { isActive: boolean }) =>
  isActive ? `${classes.navItem} ${classes.navItemActive}` : classes.navItem;

/** Left rail. Everything here now navigates. */
export function ListBuildingSidebar({ view }: { view: ListBuildingHomeView }) {
  return (
    <div className={classes.sidebar}>
      <NavLink to="." end className={navClass}>
        <span className={classes.navItemName}>Everything</span>
      </NavLink>

      <NavGroup label="Node types" tiles={view.nodeCategories} />
      <NavGroup label="Records" tiles={view.recordCategories} />

      <div className={classes.navGroupLabel}>Foundations</div>
      {view.foundations.map((panel) => (
        <NavLink
          key={panel.key}
          to={panel.key}
          end={panel.key === "categories"}
          className={navClass}
        >
          <span className={classes.navItemName}>{panel.name}</span>
          <span className={classes.navItemCount}>{panel.count}</span>
        </NavLink>
      ))}
    </div>
  );
}

function NavGroup({ label, tiles }: { label: string; tiles: CategoryTile[] }) {
  return (
    <>
      <div className={classes.navGroupLabel}>{label}</div>
      {tiles.length === 0 && (
        <span className={`${classes.navItem}`} style={{ color: "var(--color-neutral-700)" }}>
          None yet
        </span>
      )}
      {tiles.map((tile) => (
        <NavLink key={tile.id} to={`categories/${tile.id}`} className={navClass}>
          <span className={classes.navItemName}>{tile.name}</span>
          <span className={classes.navItemCount}>{tile.count}</span>
        </NavLink>
      ))}
    </>
  );
}
