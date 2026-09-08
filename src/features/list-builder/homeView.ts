import type { CategoryDef } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";

/**
 * Shapes the list-building home page's sections from a ruleset. Nothing here is
 * game-specific: the only distinction it draws is `CategoryDef.kind` ("node" vs
 * "record"), and every category, format and resource it lists is author-defined.
 * Tile counts are just how many `NodeDef`s / `CategoryRecord`s currently point
 * at a given category.
 */

export interface CategoryTile {
  id: string;
  name: string;
  /** NodeDefs (node kind) or CategoryRecords (record kind) that use this category. */
  count: number;
}

export type FoundationKey = "categories" | "formats" | "resources";

export interface FoundationPanel {
  key: FoundationKey;
  name: string;
  addLabel: string;
  count: number;
  /** Names of the entries, for the panel's preview list. */
  items: string[];
}

export interface ListBuildingHomeView {
  nodeCategories: CategoryTile[];
  recordCategories: CategoryTile[];
  foundations: FoundationPanel[];
}

const EMPTY_LIST_BUILDING = { resources: [], fields: [], categories: [], formats: [] };

const named = (name: string) => name.trim() || "Untitled";

export function listBuildingHomeView(ruleset: Ruleset): ListBuildingHomeView {
  const lb = ruleset.listBuilding ?? EMPTY_LIST_BUILDING;
  const nodeDefs = Object.values(ruleset.registry.nodeDefs);
  const records = Object.values(ruleset.registry.categoryRecords);

  const toTile = (category: CategoryDef): CategoryTile => ({
    id: category.id,
    name: named(category.name),
    count:
      category.kind === "record"
        ? records.filter((record) => record.categoryId === category.id).length
        : nodeDefs.filter((node) => node.categoryId === category.id).length,
  });

  return {
    nodeCategories: lb.categories.filter((c) => c.kind !== "record").map(toTile),
    recordCategories: lb.categories.filter((c) => c.kind === "record").map(toTile),
    foundations: [
      {
        key: "categories",
        name: "Categories",
        addLabel: "+ Add category",
        count: lb.categories.length,
        items: lb.categories.map((c) => named(c.name)),
      },
      {
        key: "formats",
        name: "Formats",
        addLabel: "+ Add format",
        count: lb.formats.length,
        items: lb.formats.map((f) => named(f.name)),
      },
      {
        key: "resources",
        name: "Resources",
        addLabel: "+ Add resource",
        count: lb.resources.length,
        items: lb.resources.map((r) => named(r.name)),
      },
    ],
  };
}
