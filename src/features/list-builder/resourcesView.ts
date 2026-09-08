import type { ResourceCap } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";

/**
 * Read model for the resources editor. Every resource is author-defined; the
 * only fixed vocabulary is `ResourceCap`'s three shapes. `usedByCount` is how
 * many node types currently spend the resource (a base cost or an option cost),
 * so deleting one can warn about what it leaves dangling.
 */

export interface ResourceRow {
  id: string;
  name: string;
  capType: ResourceCap["type"];
  /** The fixed cap amount; 0 unless `capType === "fixed"`. */
  capValue: number;
  capLabel: string;
  usedByCount: number;
}

export function capLabel(cap: ResourceCap): string {
  switch (cap.type) {
    case "fixed":
      return `Fixed cap ${cap.value}`;
    case "playerChosen":
      return "Player sets the cap";
    case "none":
      return "Cap set per format";
  }
}

export function resourceRows(ruleset: Ruleset): ResourceRow[] {
  const resources = ruleset.listBuilding?.resources ?? [];
  const nodeDefs = Object.values(ruleset.registry.nodeDefs);

  return resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    capType: resource.cap.type,
    capValue: resource.cap.type === "fixed" ? resource.cap.value : 0,
    capLabel: capLabel(resource.cap),
    usedByCount: nodeDefs.filter(
      (node) =>
        Object.prototype.hasOwnProperty.call(node.baseCosts, resource.id) ||
        node.options.some((option) => option.cost.resourceId === resource.id),
    ).length,
  }));
}
