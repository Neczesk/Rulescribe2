import { Fragment } from "react";
import { Link, Navigate, Outlet, useMatches, useParams } from "react-router";
import { listBuildingHomeView } from "./homeView";
import { IconBook, IconHome } from "./icons";
import { ListBuildingSidebar } from "./ListBuildingSidebar";
import { useRuleset } from "./state/useRuleset";
import classes from "./listBuilding.module.css";

interface RouteHandle {
  crumb?: string;
}

/** Shell for the list-building side of a ruleset: top bar, left rail, `<Outlet />`. */
export function ListBuildingLayout() {
  const ruleset = useRuleset();
  const { rulesetId, categoryId, nodeId, recordId } = useParams();
  const matches = useMatches();

  if (!ruleset) {
    return <Navigate to="/" replace />;
  }

  const view = listBuildingHomeView(ruleset);
  const editorHref = `/editor/${rulesetId ?? ""}`;
  const handleCrumb = matches
    .map((match) => (match.handle as RouteHandle | undefined)?.crumb)
    .filter((crumb): crumb is string => Boolean(crumb))
    .at(-1);
  // Everything after "List building". A `:categoryId` route shows the category's
  // own name; a nested page (Fields & constraints) adds its static crumb after.
  const category = categoryId
    ? ruleset.listBuilding?.categories.find((c) => c.id === categoryId)
    : undefined;
  const node = nodeId ? ruleset.registry.nodeDefs[nodeId] : undefined;
  const record = recordId ? ruleset.registry.categoryRecords[recordId] : undefined;
  const segments: { text: string; to?: string }[] = [];
  if (category) {
    segments.push({
      text: category.name || "Untitled category",
      to: handleCrumb || nodeId || recordId ? `categories/${categoryId}` : undefined,
    });
  }
  if (node) segments.push({ text: node.name || "Untitled node type" });
  if (record) segments.push({ text: record.name || "Untitled record" });
  if (handleCrumb) segments.push({ text: handleCrumb });

  return (
    <div className={classes.shell}>
      <div className={classes.topbar}>
        <Link to="/" className={classes.crumbIcon} aria-label="Main menu" title="Main menu">
          <IconHome />
        </Link>
        <span className={classes.sep}>/</span>
        <Link to={editorHref} className={classes.crumbLink} title="Back to the ruleset editor">
          <IconBook />
          {ruleset.metadata.title || "Untitled ruleset"}
        </Link>
        <span className={classes.sep}>/</span>
        {segments.length > 0 ? (
          <Link to="." className={classes.crumbLinkPlain}>
            List building
          </Link>
        ) : (
          <span className={classes.crumbCurrent}>List building</span>
        )}
        {segments.map((segment, index) => (
          <Fragment key={segment.text}>
            <span className={classes.sep}>/</span>
            {index === segments.length - 1 || !segment.to ? (
              <span className={classes.crumbCurrent}>{segment.text}</span>
            ) : (
              <Link to={segment.to} className={classes.crumbLinkPlain}>
                {segment.text}
              </Link>
            )}
          </Fragment>
        ))}

        <div className={classes.topbarRight}>
          <input
            type="search"
            className={classes.search}
            placeholder="Search everything…"
            disabled
          />
          <span className={classes.savedTag}>Saved</span>
          <button type="button" className={classes.secondaryBtn} disabled>
            Test mode
          </button>
        </div>
      </div>

      <div className={classes.body}>
        <ListBuildingSidebar view={view} />
        <main className={classes.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
