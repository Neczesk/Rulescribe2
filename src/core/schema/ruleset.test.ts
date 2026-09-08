import dayjs from "dayjs";
import { describe, expect, it } from "vitest";
import { createRuleset } from "./createRuleset";
import { imageAsset, ruleset } from "./ruleset";

describe("ruleset serialization round-trip", () => {
  it("survives JSON.stringify -> JSON.parse -> ruleset.parse", () => {
    const original = createRuleset();
    const revived = ruleset.parse(JSON.parse(JSON.stringify(original)));

    expect(dayjs.isDayjs(revived.metadata.createdAt)).toBe(true);
    expect(dayjs.isDayjs(revived.metadata.updatedAt)).toBe(true);
    expect(revived.metadata.createdAt.toISOString()).toBe(
      original.metadata.createdAt.toISOString(),
    );
    expect(revived.metadata.id).toBe(original.metadata.id);
    expect(revived.structure).toEqual(original.structure);
  });

  it("keeps a genuine Dayjs untouched", () => {
    const parsed = ruleset.parse(createRuleset());
    expect(dayjs.isDayjs(parsed.metadata.updatedAt)).toBe(true);
  });

  it("safeParse rejects non-ruleset input", () => {
    expect(ruleset.safeParse({ nope: true }).success).toBe(false);
    expect(ruleset.safeParse("not json").success).toBe(false);
    expect(ruleset.safeParse({ ...createRuleset(), metadata: { id: "x" } }).success).toBe(false);
  });

  it("backfills registry.images for a pre-images ruleset shape", () => {
    const legacy = createRuleset();
    const { images: _images, ...registryWithoutImages } = legacy.registry;
    const parsed = ruleset.parse({ ...legacy, registry: registryWithoutImages });
    expect(parsed.registry.images).toEqual({});
  });

  it("backfills registry.diagrams for a pre-diagrams ruleset shape", () => {
    const legacy = createRuleset();
    const { diagrams: _diagrams, ...registryWithoutDiagrams } = legacy.registry;
    const parsed = ruleset.parse({ ...legacy, registry: registryWithoutDiagrams });
    expect(parsed.registry.diagrams).toEqual({});
  });

  it("stamps schemaVersion 13 and empty nodeDefs / categoryRecords for a fresh ruleset", () => {
    const revived = ruleset.parse(JSON.parse(JSON.stringify(createRuleset())));
    expect(revived.schemaVersion).toBe(13);
    expect(revived.registry.nodeDefs).toEqual({});
    expect(revived.registry.categoryRecords).toEqual({});
  });

  it("backfills registry.nodeDefs and leaves listBuilding undefined for a v4 shape", () => {
    const legacy = createRuleset();
    const { nodeDefs: _nodeDefs, categoryRecords: _cr, ...registryTrimmed } = legacy.registry;
    const parsed = ruleset.parse({
      ...legacy,
      schemaVersion: 4,
      registry: registryTrimmed,
    });
    expect(parsed.registry.nodeDefs).toEqual({});
    expect(parsed.registry.categoryRecords).toEqual({});
    expect(parsed.listBuilding).toBeUndefined();
  });

  it("backfills registry.categoryRecords {} and listBuilding.categories [] for a v5 shape", () => {
    const legacy = createRuleset();
    const { categoryRecords: _cr, ...registryWithoutCategoryRecords } = legacy.registry;
    const parsed = ruleset.parse({
      ...legacy,
      schemaVersion: 5,
      registry: registryWithoutCategoryRecords,
      listBuilding: { resources: [], fields: [], formats: [] },
    });
    expect(parsed.registry.categoryRecords).toEqual({});
    expect(parsed.listBuilding?.categories).toEqual([]);
  });

  it("accepts and round-trips populated categories, categoryRecords, nodeDefs and listBuilding", () => {
    const base = createRuleset();
    const original = ruleset.parse({
      ...base,
      registry: {
        ...base.registry,
        nodeDefs: {
          abcdefghij: {
            id: "abcdefghij",
            name: "Rifle Squad",
            categoryId: "unit000000",
            baseCosts: { pts: 65 },
            constraints: [
              {
                kind: "limit",
                max: { op: "constant", value: 3 },
                metric: { op: "count", selector: { type: "nodeDefId", ids: ["specialwpn"] } },
              },
            ],
          },
        },
        categoryRecords: {
          empire0000: {
            id: "empire0000",
            categoryId: "faction000",
            values: { name: "Empire", characterCapPct: 25 },
            constraints: [
              {
                kind: "limit",
                max: { op: "constant", value: 1 },
                metric: {
                  op: "count",
                  selector: { type: "nodeCategory", categoryId: "general000" },
                },
              },
            ],
          },
        },
      },
      listBuilding: {
        resources: [{ id: "pts0000000", name: "Points", cap: { type: "playerChosen" } }],
        fields: [
          { id: "faction000", name: "Faction", type: "reference", categoryId: "faction000" },
          { id: "rulesart00", name: "Rules Article", type: "articleReference", inherited: true },
        ],
        categories: [
          {
            id: "faction000",
            name: "Faction",
            fields: [{ id: "name000000", name: "Name", type: "text" }],
          },
        ],
        formats: [
          {
            id: "combinedar",
            name: "Combined Arms",
            resourceCaps: { pts0000000: 2000 },
            constraints: [
              {
                kind: "limit",
                max: { op: "constant", value: 6 },
                perPartition: { key: { type: "nodeDefId" } },
                metric: {
                  op: "count",
                  selector: { type: "nodeCategory", categoryId: "unit000000" },
                },
              },
            ],
          },
        ],
      },
    });
    const revived = ruleset.parse(JSON.parse(JSON.stringify(original)));
    expect(revived.registry.nodeDefs).toEqual(original.registry.nodeDefs);
    expect(revived.registry.categoryRecords).toEqual(original.registry.categoryRecords);
    expect(revived.listBuilding).toEqual(original.listBuilding);
  });
});

describe("imageAsset", () => {
  it("defaults metadata fields and generates an id", () => {
    const asset = imageAsset.parse({ mimeType: "image/png", width: 800, height: 600 });
    expect(asset.id).toMatch(/^[A-Za-z0-9_-]{10}$/);
    expect(asset.filename).toBe("");
  });

  it("rejects non-positive dimensions", () => {
    expect(imageAsset.safeParse({ mimeType: "image/png", width: 0, height: 600 }).success).toBe(
      false,
    );
  });
});
