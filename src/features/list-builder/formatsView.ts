import type { ResourceCap } from "../../core/schema/listBuilding";
import type { Ruleset } from "../../core/schema/ruleset";

/**
 * Read model for the formats editor. A format sets a per-list cap on each
 * declared resource (absent = no cap from this format) plus whole-list
 * constraints. The generated resource-cap constraints are engine bookkeeping,
 * so `listConstraintCount` counts only the author's own.
 */

export interface FormatCap {
  resourceId: string;
  resourceName: string;
  /** This format's cap for the resource, or `null` when it sets none. */
  value: number | null;
  /** The resource's own cap shape, so the editor can explain what "empty" means. */
  resourceCapType: ResourceCap["type"];
  /** The resource's fixed fallback cap; 0 unless `resourceCapType === "fixed"`. */
  resourceFixedValue: number;
}

export interface FormatRow {
  id: string;
  name: string;
  /** One entry per declared resource, in declaration order. */
  caps: FormatCap[];
  listConstraintCount: number;
}

export function formatRows(ruleset: Ruleset): FormatRow[] {
  const listBuilding = ruleset.listBuilding;
  const resources = listBuilding?.resources ?? [];

  return (listBuilding?.formats ?? []).map((format) => ({
    id: format.id,
    name: format.name,
    caps: resources.map((resource) => {
      const value = format.resourceCaps[resource.id];
      return {
        resourceId: resource.id,
        resourceName: resource.name,
        value: typeof value === "number" ? value : null,
        resourceCapType: resource.cap.type,
        resourceFixedValue: resource.cap.type === "fixed" ? resource.cap.value : 0,
      };
    }),
    listConstraintCount: format.constraints.filter((c) => !c.generatedFor).length,
  }));
}
