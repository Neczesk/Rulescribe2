import { describe, expect, it } from "vitest";
import { createRuleset } from "../schema/createRuleset";
import { ruleset } from "../schema/ruleset";
import { CURRENT_SCHEMA_VERSION, migrate } from "./rulesetMigrate";

/** A v7-shaped ruleset blob: legacy `groupBy` and the old constraint kinds. */
function legacyBlob(): Record<string, unknown> {
  const base = JSON.parse(JSON.stringify(createRuleset())) as Record<string, unknown>;
  return {
    ...base,
    schemaVersion: 7,
    registry: {
      ...(base.registry as object),
      nodeDefs: {
        aaaaaaaaaa: {
          id: "aaaaaaaaaa",
          constraints: [
            {
              id: "c000000001",
              kind: "countLimit",
              max: 3,
              groupBy: "nodeDefId",
              scope: { type: "nodeDefId", ids: ["specialwpn"] },
            },
            {
              id: "c000000004",
              kind: "requires",
              severity: "warning",
              trigger: { type: "nodeDefId", ids: ["warlord000"] },
              target: { type: "nodeDefId", ids: ["banner0000"] },
            },
            {
              id: "c000000005",
              kind: "excludes",
              trigger: { type: "nodeDefId", ids: ["warlord000"] },
              target: { type: "nodeDefId", ids: ["assassin00"] },
            },
          ],
        },
      },
      categoryRecords: {
        bbbbbbbbbb: {
          id: "bbbbbbbbbb",
          categoryId: "faction000",
          constraints: [
            {
              id: "c000000002",
              kind: "countLimit",
              min: 1,
              groupBy: { type: "field", fieldId: "role" },
            },
          ],
        },
      },
    },
    listBuilding: {
      resources: [{ id: "pts0000000", name: "Points", cap: { type: "playerChosen" } }],
      fields: [],
      categories: [],
      detachmentTypes: [{ id: "dt00000000", name: "Battalion", rootNodeId: "x" }],
      formats: [
        {
          id: "ff00000000",
          detachmentTypeIds: ["dt00000000"],
          resourceCaps: { pts0000000: 2000 },
          constraints: [
            {
              id: "c000000003",
              kind: "countLimit",
              max: 6,
              groupBy: { key: "nodeDefId", expectedValues: ["a", "b"] },
            },
          ],
        },
      ],
    },
  };
}

const parsed = () => ruleset.parse(migrate(legacyBlob()));

describe("rulesetMigrate — countLimit -> limit", () => {
  it("becomes a count metric with constant bounds", () => {
    const c = parsed().registry.nodeDefs.aaaaaaaaaa?.constraints[0];
    expect(c).toMatchObject({
      id: "c000000001",
      kind: "limit",
      metric: { op: "count", selector: { type: "nodeDefId", ids: ["specialwpn"] } },
      max: { op: "constant", value: 3 },
    });
    expect(c && "min" in c ? c.min : undefined).toBeUndefined();
  });

  it("groupBy becomes perPartition, in both legacy shapes, with expectedKeys", () => {
    const node = parsed().registry.nodeDefs.aaaaaaaaaa?.constraints[0];
    expect(node?.perPartition).toEqual({ key: { type: "nodeDefId" } });

    const record = parsed().registry.categoryRecords.bbbbbbbbbb?.constraints[0];
    expect(record?.perPartition).toEqual({ key: { type: "field", fieldId: "role" } });
    expect(record).toMatchObject({ min: { op: "constant", value: 1 } });

    const format = parsed().listBuilding?.formats[0]?.constraints[0];
    expect(format?.perPartition).toEqual({
      key: { type: "nodeDefId" },
      expectedKeys: ["a", "b"],
    });
  });

  it("a countLimit with no groupBy gets no perPartition", () => {
    const blob = legacyBlob();
    const nodeDefs = (blob.registry as Record<string, never>).nodeDefs as Record<string, never>;
    const bare = {
      ...blob,
      registry: {
        ...(blob.registry as object),
        nodeDefs: {
          ...nodeDefs,
          aaaaaaaaaa: { id: "aaaaaaaaaa", constraints: [{ kind: "countLimit", max: 1 }] },
        },
      },
    };
    const c = ruleset.parse(migrate(bare)).registry.nodeDefs.aaaaaaaaaa?.constraints[0];
    expect(c?.perPartition).toBeUndefined();
    expect(c).toMatchObject({ kind: "limit", metric: { op: "count", selector: { type: "all" } } });
  });
});

describe("rulesetMigrate — requires / excludes -> require", () => {
  it("requires becomes a trigger-gated 'target is present'", () => {
    const c = parsed().registry.nodeDefs.aaaaaaaaaa?.constraints[1];
    expect(c).toMatchObject({
      id: "c000000004",
      kind: "require",
      severity: "warning",
      when: {
        op: "compare",
        left: { op: "count", selector: { type: "nodeDefId", ids: ["warlord000"] } },
        cmp: "gte",
        right: { op: "constant", value: 1 },
      },
      condition: {
        op: "compare",
        left: { op: "count", selector: { type: "nodeDefId", ids: ["banner0000"] } },
        cmp: "gte",
        right: { op: "constant", value: 1 },
      },
    });
  });

  it("excludes becomes the same gate with 'target count is 0'", () => {
    const c = parsed().registry.nodeDefs.aaaaaaaaaa?.constraints[2];
    expect(c).toMatchObject({ id: "c000000005", kind: "require" });
    expect(c && c.kind === "require" ? c.condition : undefined).toMatchObject({
      op: "compare",
      left: { op: "count", selector: { type: "nodeDefId", ids: ["assassin00"] } },
      cmp: "eq",
      right: { op: "constant", value: 0 },
    });
  });
});

describe("rulesetMigrate — resource constraint backfill", () => {
  it("materializes one generated limit per resource onto every format", () => {
    const format = parsed().listBuilding?.formats[0];
    const generated = format?.constraints.filter((c) => c.generatedFor) ?? [];
    expect(generated).toHaveLength(1);
    expect(generated[0]).toMatchObject({
      kind: "limit",
      generatedFor: { resourceId: "pts0000000" },
      metric: { op: "costSum", selector: { type: "all" }, resourceId: "pts0000000" },
      max: { op: "resourceLimit", resourceId: "pts0000000" },
    });
  });

  it("keeps the format's hand-written constraint alongside it", () => {
    const format = parsed().listBuilding?.formats[0];
    expect(format?.constraints).toHaveLength(2);
    expect(format?.constraints[0]?.id).toBe("c000000003");
  });

  it("adds nothing when no resources are declared", () => {
    const blob = legacyBlob();
    const lb = blob.listBuilding as Record<string, unknown>;
    const noResources = { ...blob, listBuilding: { ...lb, resources: [] } };
    const format = ruleset.parse(migrate(noResources)).listBuilding?.formats[0];
    expect(format?.constraints.filter((c) => c.generatedFor)).toHaveLength(0);
  });
});

describe("rulesetMigrate — TODO nodes (v13 -> v14)", () => {
  /** A current ruleset blob with one article whose body contains "TODO". */
  function todoBlob(bodyText: string): Record<string, unknown> {
    const base = JSON.parse(JSON.stringify(createRuleset())) as Record<string, unknown>;
    const registry = base.registry as { articles: Record<string, Record<string, unknown>> };
    const [articleId, article] = Object.entries(registry.articles)[0];
    return {
      ...base,
      schemaVersion: 13,
      registry: {
        ...registry,
        articles: {
          [articleId]: {
            ...article,
            text: {
              type: "doc",
              content: [{ type: "paragraph", content: [{ type: "text", text: bodyText }] }],
            },
          },
        },
      },
    };
  }

  interface Block {
    type: string;
    attrs?: Record<string, unknown>;
    content?: { type: string; text?: string }[];
  }
  const bodyOf = (blob: Record<string, unknown>): Block[] => {
    const parsed = ruleset.parse(migrate(blob));
    const article = Object.values(parsed.registry.articles)[0];
    return (article.text as { content: Block[] }).content;
  };

  it("turns a bare TODO sentence into a todo node, keeping the rest", () => {
    const content = bodyOf(
      todoBlob(
        "After a hit is scored, roll to wound. TODO confirm flanking stacks with cover. A wound removes the model.",
      ),
    );
    expect(content.map((n) => n.type)).toEqual(["paragraph", "todo", "paragraph"]);
    expect(content[1].attrs).toMatchObject({
      text: "confirm flanking stacks with cover.",
      resolved: false,
    });
    expect(typeof content[1].attrs?.todoId).toBe("string");
    expect(content[0].content?.[0].text).toBe("After a hit is scored, roll to wound.");
    expect(content[2].content?.[0].text).toBe("A wound removes the model.");
  });

  it("handles a TODO that starts the block and runs to the end", () => {
    const content = bodyOf(todoBlob("TODO write this section"));
    expect(content.map((n) => n.type)).toEqual(["todo"]);
    expect(content[0].attrs).toMatchObject({ text: "write this section", resolved: false });
  });

  it("leaves articles without the string TODO untouched", () => {
    const content = bodyOf(todoBlob("Nothing to do here."));
    expect(content.map((n) => n.type)).toEqual(["paragraph"]);
  });
});

describe("rulesetMigrate — versioning", () => {
  it("stamps the current version and drops keys removed along the way", () => {
    const result = parsed();
    expect(result.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(result.listBuilding).not.toHaveProperty("detachmentTypes");
    expect(result.listBuilding?.formats[0]).not.toHaveProperty("detachmentTypeIds");
  });

  it("leaves an already-current blob untouched", () => {
    const current = JSON.parse(JSON.stringify(createRuleset()));
    expect(migrate(current)).toBe(current);
  });

  it("migrates a v9 blob, whose groupBy is already reshaped", () => {
    const base = JSON.parse(JSON.stringify(createRuleset())) as Record<string, unknown>;
    const v9 = {
      ...base,
      schemaVersion: 9,
      registry: {
        ...(base.registry as object),
        nodeDefs: {
          aaaaaaaaaa: {
            id: "aaaaaaaaaa",
            constraints: [
              { id: "c000000001", kind: "countLimit", max: 2, groupBy: { key: "nodeDefId" } },
            ],
          },
        },
      },
    };
    const c = ruleset.parse(migrate(v9)).registry.nodeDefs.aaaaaaaaaa?.constraints[0];
    expect(c).toMatchObject({ kind: "limit", perPartition: { key: { type: "nodeDefId" } } });
  });
});
