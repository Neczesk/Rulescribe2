import { beforeEach, describe, expect, it } from "vitest";
import { constraintDef } from "../schema/listBuilding";
import { createRuleset } from "../schema/createRuleset";
import { currentRulesetStore, type ConstraintHost } from "./currentRuleset";

const store = () => currentRulesetStore.getState();
const ID_RE = /^[A-Za-z0-9_-]{10}$/;

const con = (max: number) =>
  constraintDef.parse({
    kind: "limit",
    metric: { op: "count", selector: { type: "all" } },
    max: { op: "constant", value: max },
  });

beforeEach(() => {
  currentRulesetStore.setState({ ruleset: createRuleset("Test") });
});

function hostConstraints(host: ConstraintHost) {
  const rs = store().ruleset!;
  switch (host.kind) {
    case "category":
      return rs.listBuilding?.categories.find((c) => c.id === host.id)?.constraints ?? [];
    case "format":
      return rs.listBuilding?.formats.find((f) => f.id === host.id)?.constraints ?? [];
    case "nodeDef":
      return rs.registry.nodeDefs[host.id]?.constraints ?? [];
    case "categoryRecord":
      return rs.registry.categoryRecords[host.id]?.constraints ?? [];
  }
}

describe("addConstraint / updateConstraint / deleteConstraint", () => {
  it("adds to each host kind and returns the id", () => {
    const categoryId = store().addCategory({ name: "Model" })!;
    const formatId = store().addFormat({ name: "Combat Patrol" })!;
    const nodeId = store().addNodeDef({ name: "Halberdier" })!;
    const recordId = store().addCategoryRecord({ categoryId, name: "Empire" })!;

    const hosts: ConstraintHost[] = [
      { kind: "category", id: categoryId },
      { kind: "format", id: formatId },
      { kind: "nodeDef", id: nodeId },
      { kind: "categoryRecord", id: recordId },
    ];

    for (const host of hosts) {
      const before = hostConstraints(host).length;
      const id = store().addConstraint(host, con(3));
      expect(id).toMatch(ID_RE);
      expect(hostConstraints(host)).toHaveLength(before + 1);
      expect(hostConstraints(host).at(-1)?.id).toBe(id);
    }
  });

  it("touches updatedAt", () => {
    const nodeId = store().addNodeDef({ name: "X" })!;
    const before = store().ruleset!.metadata.updatedAt;
    store().addConstraint({ kind: "nodeDef", id: nodeId }, con(2));
    expect(store().ruleset!.metadata.updatedAt).not.toBe(before);
  });

  it("updateConstraint replaces the whole object by id, leaving siblings untouched", () => {
    const nodeId = store().addNodeDef({ name: "X" })!;
    const host: ConstraintHost = { kind: "nodeDef", id: nodeId };
    const a = store().addConstraint(host, con(1))!;
    const b = store().addConstraint(host, con(2))!;

    const replacement = { ...con(9), id: a };
    store().updateConstraint(host, a, replacement);

    const list = hostConstraints(host);
    expect(list.find((c) => c.id === a)).toEqual(replacement);
    const sibling = list.find((c) => c.id === b);
    expect(sibling?.kind === "limit" && sibling.max).toEqual({ op: "constant", value: 2 });
  });

  it("deleteConstraint removes only the named constraint", () => {
    const nodeId = store().addNodeDef({ name: "X" })!;
    const host: ConstraintHost = { kind: "nodeDef", id: nodeId };
    const a = store().addConstraint(host, con(1))!;
    const b = store().addConstraint(host, con(2))!;
    store().deleteConstraint(host, a);
    expect(hostConstraints(host).map((c) => c.id)).toEqual([b]);
  });

  it("unknown host id is a no-op and never adds", () => {
    expect(store().addConstraint({ kind: "nodeDef", id: "zzzzzzzzzz" }, con(1))).toBeNull();
    const before = store().ruleset;
    store().updateConstraint({ kind: "category", id: "zzzzzzzzzz" }, "x", con(1));
    store().deleteConstraint({ kind: "format", id: "zzzzzzzzzz" }, "x");
    expect(store().ruleset).toBe(before);
  });
});

describe("engine-generated constraints are protected", () => {
  it("a format's resource-cap constraint cannot be updated or deleted", () => {
    const resourceId = store().addResource({ name: "Points" })!;
    const formatId = store().addFormat({ name: "Combined Arms" })!;
    const host: ConstraintHost = { kind: "format", id: formatId };

    const generated = hostConstraints(host).find((c) => c.generatedFor);
    expect(generated).toBeDefined();
    expect(generated?.generatedFor?.resourceId).toBe(resourceId);

    store().updateConstraint(host, generated!.id, { ...con(1), id: generated!.id });
    store().deleteConstraint(host, generated!.id);

    const still = hostConstraints(host).find((c) => c.id === generated!.id);
    expect(still).toEqual(generated);
  });

  it("adding an author constraint to a format leaves the generated ones in place", () => {
    store().addResource({ name: "Points" });
    const formatId = store().addFormat({ name: "Combined Arms" })!;
    const host: ConstraintHost = { kind: "format", id: formatId };
    const generatedBefore = hostConstraints(host)
      .filter((c) => c.generatedFor)
      .map((c) => c.id);

    store().addConstraint(host, con(3));

    const generatedAfter = hostConstraints(host)
      .filter((c) => c.generatedFor)
      .map((c) => c.id);
    expect(generatedAfter).toEqual(generatedBefore);
    expect(hostConstraints(host).filter((c) => !c.generatedFor)).toHaveLength(1);
  });
});

describe("perPartition.expectedKeys persistence", () => {
  it("updateConstraint round-trips a partitioned constraint with expectedKeys", () => {
    const categoryId = store().addCategory({ name: "Model" })!;
    const host: ConstraintHost = { kind: "category", id: categoryId };
    const id = store().addConstraint(host, con(3))!;

    const partitioned = constraintDef.parse({
      id,
      kind: "limit",
      metric: { op: "count", selector: { type: "all" } },
      max: { op: "constant", value: 3 },
      perPartition: { key: { type: "nodeCategory" }, expectedKeys: ["core", "rare"] },
    });
    store().updateConstraint(host, id, partitioned);

    const stored = hostConstraints(host).find((c) => c.id === id);
    expect(stored?.perPartition).toEqual({
      key: { type: "nodeCategory" },
      expectedKeys: ["core", "rare"],
    });
  });
});
