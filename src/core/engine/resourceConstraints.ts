import { shortId } from "../../util/nanoid";
import type { ConstraintDef, FormatDef, ResourceDef } from "../schema/listBuilding";

/**
 * Resource caps are ordinary constraints, materialized onto the format that
 * owns them so an author can edit or delete one — downgrading it to a
 * `warning` is how "you may exceed the limit, but your opponent gets a bonus"
 * is expressed.
 *
 * `generatedFor` marks them, which is what makes regeneration idempotent (the
 * sync below never clobbers an edited one) and what lets `validateList` report
 * the specific `resource-over-cap` code instead of a generic `limit-above-max`.
 *
 * The bound stays **dynamic**: `resourceLimit` resolves through `effectiveCap`,
 * so `FormatDef.resourceCaps` remains the number store and a player's
 * `list.resourceCaps` choice still flows through for a `playerChosen` resource.
 */
export function generatedResourceConstraint(resourceId: string): ConstraintDef {
  return {
    id: shortId(),
    kind: "limit",
    severity: "error",
    overrides: [],
    values: {},
    generatedFor: { resourceId },
    metric: { op: "costSum", selector: { type: "all" }, resourceId },
    max: { op: "resourceLimit", resourceId },
  };
}

/**
 * Ensure `format` carries exactly one generated `limit` per declared resource.
 * Existing generated constraints are left untouched (author edits survive);
 * generated constraints whose resource no longer exists are dropped;
 * hand-written constraints are never touched. Returns `format` unchanged — same
 * reference — when there is nothing to do.
 */
export function syncResourceConstraints(format: FormatDef, resources: ResourceDef[]): FormatDef {
  const declared = new Set(resources.map((r) => r.id));
  const kept = format.constraints.filter(
    (c) => !c.generatedFor || declared.has(c.generatedFor.resourceId),
  );
  const present = new Set(kept.flatMap((c) => (c.generatedFor ? [c.generatedFor.resourceId] : [])));
  const added = resources
    .filter((r) => !present.has(r.id))
    .map((r) => generatedResourceConstraint(r.id));

  if (added.length === 0 && kept.length === format.constraints.length) return format;
  return { ...format, constraints: [...kept, ...added] };
}
