import dayjs from "dayjs";
import { createStore } from "zustand/vanilla";
import { diagramEntry as diagramEntrySchema, type DiagramEntry } from "../schema/diagram";
import {
  categoryDef as categoryDefSchema,
  categoryRecord as categoryRecordSchema,
  fieldDef as fieldDefSchema,
  fieldGroupDef as fieldGroupDefSchema,
  formatDef as formatDefSchema,
  listBuilding as listBuildingSchema,
  nodeDef as nodeDefSchema,
  resourceDef as resourceDefSchema,
  type CategoryDef,
  type CategoryRecord,
  type ConstraintDef,
  type FieldDef,
  type FieldGroupDef,
  type FormatDef,
  type ListBuilding,
  type NodeDef,
  type ResourceDef,
} from "../schema/listBuilding";
import type { FieldValue } from "../schema/selector";
import { syncResourceConstraints } from "../engine/resourceConstraints";
import { shortId } from "../../util/nanoid";
import {
  imageAsset as imageAssetSchema,
  type ImageAsset,
  keyword as keywordSchema,
  type Keyword,
  type RichText,
  type Ruleset,
} from "../schema/ruleset";
import {
  createArticleNode,
  insertNode,
  moveNode as moveStructureNode,
  removeNode,
} from "../schema/structure";

export type KeywordPatch = Partial<Pick<Keyword, "displayName" | "shortText" | "text" | "notes">>;
export type ResourcePatch = Partial<Pick<ResourceDef, "name" | "cap">>;
export type FormatPatch = Partial<Pick<FormatDef, "name" | "resourceCaps">>;
export type CategoryPatch = Partial<Pick<CategoryDef, "name" | "kind" | "description">>;
export type CategoryFieldPatch = Partial<
  Pick<FieldDef, "name" | "type" | "optionSource" | "options" | "categoryId" | "multiple">
>;
export type FieldGroupPatch = Partial<Pick<FieldGroupDef, "name" | "layout">>;
export type NodeDefPatch = Partial<Pick<NodeDef, "name" | "categoryId">>;
export type CategoryRecordPatch = Partial<Pick<CategoryRecord, "name" | "categoryId">>;

/** Any of the four records a `ConstraintDef` can live on. */
export type ConstraintHost =
  | { kind: "category"; id: string }
  | { kind: "format"; id: string }
  | { kind: "nodeDef"; id: string }
  | { kind: "categoryRecord"; id: string };

/** Omit that distributes over a union, so a discriminated union keeps its variants apart. */
type DistributiveOmit<T, K extends keyof never> = T extends unknown ? Omit<T, K> : never;

/**
 * Patch fields for either diagram kind, kind-specific field (`scene` or
 * `source`) included. Narrowing to the right variant is the caller's
 * responsibility — the store doesn't enforce it since it always merges into
 * an existing, already-typed entry.
 */
export type DiagramPatch = Partial<DistributiveOmit<DiagramEntry, "id" | "kind">>;
type NewDiagramEntry = DistributiveOmit<DiagramEntry, "id"> & { id?: string };

/**
 * Return a copy of `doc` with the `resolved` attr of the `todo` node whose
 * `todoId` matches set to `resolved`. Returns the same reference when nothing
 * changed, so a store `patch` can no-op.
 */
function setTodoResolvedInDoc(doc: RichText, todoId: string, resolved: boolean): RichText {
  let changed = false;
  const visit = (node: RichText): RichText => {
    let next = node;
    if (
      node.type === "todo" &&
      node.attrs?.todoId === todoId &&
      node.attrs?.resolved !== resolved
    ) {
      next = { ...node, attrs: { ...node.attrs, resolved } };
      changed = true;
    }
    const kids = next.content;
    if (kids) {
      const content = kids.map(visit);
      if (content.some((child, i) => child !== kids[i])) {
        next = { ...next, content };
      }
    }
    return next;
  };
  const result = visit(doc);
  return changed ? result : doc;
}

interface AddArticleOptions {
  parentId: string;
  index?: number;
  title?: string;
}

interface MoveTarget {
  parentId: string;
  index: number;
}

interface CurrentRulesetState {
  ruleset: Ruleset | null;
  setRuleset: (ruleset: Ruleset) => void;
  renameRuleset: (title: string) => void;
  /** Create an article, insert its node, and return the new article id. */
  addArticle: (options: AddArticleOptions) => string | null;
  renameArticle: (articleId: string, title: string) => void;
  /** Flag/unflag an article as a "notes" article (excluded from export). */
  setArticleIsNotes: (articleId: string, isNotes: boolean) => void;
  /** Remove a node, its subtree, and every orphaned article from the registry. */
  deleteArticle: (articleId: string) => void;
  moveNode: (articleId: string, target: MoveTarget) => void;
  updateArticleText: (articleId: string, text: RichText) => void;
  /** Flip the `resolved` attr of one `todo` node (by its `todoId`) in an article. */
  setTodoResolved: (articleId: string, todoId: string, resolved: boolean) => void;
  /** Create a keyword in the registry and return its id. */
  addKeyword: (options?: { displayName?: string }) => string | null;
  updateKeyword: (keywordId: string, patch: KeywordPatch) => void;
  deleteKeyword: (keywordId: string) => void;
  /** Register image metadata (the blob itself lives in `core/storage/imageStorage`). */
  addImage: (asset: Omit<ImageAsset, "id"> & { id?: string }) => string | null;
  /** Remove the registry entry only — does not touch the blob store. */
  deleteImage: (imageId: string) => void;
  /** Create a diagram in the registry and return its id. */
  addDiagram: (entry: NewDiagramEntry) => string | null;
  updateDiagram: (diagramId: string, patch: DiagramPatch) => void;
  deleteDiagram: (diagramId: string) => void;
  /** Append a list-building resource, creating `ruleset.listBuilding` if absent. Returns its id. */
  addResource: (options?: { name?: string }) => string | null;
  updateResource: (resourceId: string, patch: ResourcePatch) => void;
  deleteResource: (resourceId: string) => void;
  /** Append a format (with its generated resource-cap constraints), creating `listBuilding` if absent. */
  addFormat: (options?: { name?: string }) => string | null;
  updateFormat: (formatId: string, patch: FormatPatch) => void;
  deleteFormat: (formatId: string) => void;
  /** Append a category, creating `listBuilding` if absent. Returns its id. */
  addCategory: (options?: { name?: string; kind?: CategoryDef["kind"] }) => string | null;
  updateCategory: (categoryId: string, patch: CategoryPatch) => void;
  /** Deep-copy a category (fresh ids for it, its fields and its groups). Returns the new id. */
  duplicateCategory: (categoryId: string) => string | null;
  /** Remove a category; instances that referenced it keep their values but lose the shared shape. */
  deleteCategory: (categoryId: string) => void;
  /** Append a field to a category. Returns the new field id. */
  addCategoryField: (categoryId: string, options?: { type?: FieldDef["type"] }) => string | null;
  updateCategoryField: (categoryId: string, fieldId: string, patch: CategoryFieldPatch) => void;
  deleteCategoryField: (categoryId: string, fieldId: string) => void;
  moveCategoryField: (categoryId: string, fieldId: string, direction: "up" | "down") => void;
  /** Reorder a category's fields to match `fieldIds` (must be a permutation of the current set). */
  reorderCategoryFields: (categoryId: string, fieldIds: string[]) => void;
  /** Create a field group. Returns the new group id. */
  addFieldGroup: (categoryId: string, options?: { name?: string }) => string | null;
  updateFieldGroup: (categoryId: string, groupId: string, patch: FieldGroupPatch) => void;
  /** Remove a group; its member fields become ungrouped. */
  deleteFieldGroup: (categoryId: string, groupId: string) => void;
  /** Move a field into `groupId`, or out of every group when `groupId` is null. */
  setFieldGroup: (categoryId: string, fieldId: string, groupId: string | null) => void;

  // --- list-builder instances (table rows) ---
  /** Create a `NodeDef`, optionally in a category. Returns its id. */
  addNodeDef: (options?: { categoryId?: string; name?: string }) => string | null;
  updateNodeDef: (nodeDefId: string, patch: NodeDefPatch) => void;
  /** Set (or, with `undefined`, clear) one author field on a node instance. */
  setNodeDefFieldValue: (nodeDefId: string, fieldId: string, value: FieldValue | undefined) => void;
  /** Set (or, with `undefined`, clear) a node's base cost in one resource. */
  setNodeDefBaseCost: (nodeDefId: string, resourceId: string, amount: number | undefined) => void;
  deleteNodeDef: (nodeDefId: string) => void;
  /** Create a `CategoryRecord` in `categoryId`. Returns its id. */
  addCategoryRecord: (options: { categoryId: string; name?: string }) => string | null;
  updateCategoryRecord: (recordId: string, patch: CategoryRecordPatch) => void;
  setCategoryRecordValue: (
    recordId: string,
    fieldId: string,
    value: FieldValue | undefined,
  ) => void;
  deleteCategoryRecord: (recordId: string) => void;

  // --- constraints (on a category / format / node type / record) ---
  /** Append an already-parsed `ConstraintDef` to `host`. Returns its id, or null if the host is missing. */
  addConstraint: (host: ConstraintHost, def: ConstraintDef) => string | null;
  /** Replace the whole constraint `constraintId` on `host`. No-op on a missing or engine-generated one. */
  updateConstraint: (host: ConstraintHost, constraintId: string, def: ConstraintDef) => void;
  /** Remove `constraintId` from `host`. No-op on a missing or engine-generated one. */
  deleteConstraint: (host: ConstraintHost, constraintId: string) => void;
}

export const currentRulesetStore = createStore<CurrentRulesetState>((set, get) => {
  /** Apply an immutable change to the ruleset and touch `updatedAt`. */
  const patch = (fn: (ruleset: Ruleset) => Ruleset) => {
    const { ruleset } = get();
    if (!ruleset) return;
    const next = fn(ruleset);
    if (next === ruleset) return;
    set({ ruleset: { ...next, metadata: { ...next.metadata, updatedAt: dayjs() } } });
  };

  /** `ruleset.listBuilding`, or a fresh empty block when the ruleset predates it. */
  const listBuildingOf = (ruleset: Ruleset): ListBuilding =>
    ruleset.listBuilding ?? listBuildingSchema.parse({});

  /** Rewrite one category in place; returns `current` unchanged if it's missing or `fn` no-ops. */
  const patchOneCategory = (
    current: Ruleset,
    categoryId: string,
    fn: (category: CategoryDef) => CategoryDef,
  ): Ruleset => {
    const lb = current.listBuilding;
    const existing = lb?.categories.find((c) => c.id === categoryId);
    if (!lb || !existing) return current;
    const updated = fn(existing);
    if (updated === existing) return current;
    return {
      ...current,
      listBuilding: {
        ...lb,
        categories: lb.categories.map((c) => (c.id === categoryId ? updated : c)),
      },
    };
  };

  /** Rewrite one `NodeDef`; no-op when it's missing or `fn` returns it unchanged. */
  const patchOneNodeDef = (
    current: Ruleset,
    id: string,
    fn: (node: NodeDef) => NodeDef,
  ): Ruleset => {
    const existing = current.registry.nodeDefs[id];
    if (!existing) return current;
    const updated = fn(existing);
    if (updated === existing) return current;
    return {
      ...current,
      registry: {
        ...current.registry,
        nodeDefs: { ...current.registry.nodeDefs, [id]: updated },
      },
    };
  };

  /** Rewrite one `CategoryRecord`; no-op when it's missing or `fn` returns it unchanged. */
  const patchOneRecord = (
    current: Ruleset,
    id: string,
    fn: (record: CategoryRecord) => CategoryRecord,
  ): Ruleset => {
    const existing = current.registry.categoryRecords[id];
    if (!existing) return current;
    const updated = fn(existing);
    if (updated === existing) return current;
    return {
      ...current,
      registry: {
        ...current.registry,
        categoryRecords: { ...current.registry.categoryRecords, [id]: updated },
      },
    };
  };

  /** Rewrite one `FormatDef`; no-op when it's missing or `fn` returns it unchanged. */
  const patchOneFormat = (
    current: Ruleset,
    id: string,
    fn: (format: FormatDef) => FormatDef,
  ): Ruleset => {
    const lb = current.listBuilding;
    const existing = lb?.formats.find((f) => f.id === id);
    if (!lb || !existing) return current;
    const updated = fn(existing);
    if (updated === existing) return current;
    return {
      ...current,
      listBuilding: { ...lb, formats: lb.formats.map((f) => (f.id === id ? updated : f)) },
    };
  };

  /** Rewrite the `constraints` array on whichever record `host` names. */
  const withConstraints = (
    current: Ruleset,
    host: ConstraintHost,
    fn: (constraints: ConstraintDef[]) => ConstraintDef[],
  ): Ruleset => {
    switch (host.kind) {
      case "category":
        return patchOneCategory(current, host.id, (c) => ({
          ...c,
          constraints: fn(c.constraints),
        }));
      case "format":
        return patchOneFormat(current, host.id, (f) => ({ ...f, constraints: fn(f.constraints) }));
      case "nodeDef":
        return patchOneNodeDef(current, host.id, (n) => ({ ...n, constraints: fn(n.constraints) }));
      case "categoryRecord":
        return patchOneRecord(current, host.id, (r) => ({ ...r, constraints: fn(r.constraints) }));
      default:
        return current;
    }
  };

  /** The constraints currently on `host`, for existence and generated-flag checks. */
  const hostConstraints = (ruleset: Ruleset, host: ConstraintHost): ConstraintDef[] | null => {
    switch (host.kind) {
      case "category":
        return ruleset.listBuilding?.categories.find((c) => c.id === host.id)?.constraints ?? null;
      case "format":
        return ruleset.listBuilding?.formats.find((f) => f.id === host.id)?.constraints ?? null;
      case "nodeDef":
        return ruleset.registry.nodeDefs[host.id]?.constraints ?? null;
      case "categoryRecord":
        return ruleset.registry.categoryRecords[host.id]?.constraints ?? null;
      default:
        return null;
    }
  };

  return {
    ruleset: null,
    setRuleset: (ruleset) => set({ ruleset }),

    renameRuleset: (title) => {
      patch((current) => ({ ...current, metadata: { ...current.metadata, title } }));
    },

    addArticle: ({ parentId, index, title }) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const { article, node } = createArticleNode(title);
      patch((current) => ({
        ...current,
        registry: {
          ...current.registry,
          articles: { ...current.registry.articles, [article.id]: article },
        },
        structure: insertNode(current.structure, node, { parentId, index }),
      }));
      return article.id;
    },

    renameArticle: (articleId, title) => {
      patch((current) => {
        const existing = current.registry.articles[articleId];
        if (!existing) return current;
        return {
          ...current,
          registry: {
            ...current.registry,
            articles: {
              ...current.registry.articles,
              [articleId]: { ...existing, title },
            },
          },
        };
      });
    },

    setArticleIsNotes: (articleId, isNotes) => {
      patch((current) => {
        const existing = current.registry.articles[articleId];
        if (!existing || existing.isNotes === isNotes) return current;
        return {
          ...current,
          registry: {
            ...current.registry,
            articles: {
              ...current.registry.articles,
              [articleId]: { ...existing, isNotes },
            },
          },
        };
      });
    },

    deleteArticle: (articleId) => {
      patch((current) => {
        if (articleId === current.structure.articleId) return current;
        const { root, removedIds } = removeNode(current.structure, articleId);
        if (removedIds.length === 0) return current;
        const articles = { ...current.registry.articles };
        for (const id of removedIds) delete articles[id];
        return {
          ...current,
          registry: { ...current.registry, articles },
          structure: root,
        };
      });
    },

    moveNode: (articleId, target) => {
      patch((current) => {
        const structure = moveStructureNode(current.structure, articleId, target);
        if (structure === current.structure) return current;
        return { ...current, structure };
      });
    },

    updateArticleText: (articleId, text) => {
      patch((current) => {
        const existing = current.registry.articles[articleId];
        if (!existing) return current;
        return {
          ...current,
          registry: {
            ...current.registry,
            articles: {
              ...current.registry.articles,
              [articleId]: { ...existing, text },
            },
          },
        };
      });
    },

    setTodoResolved: (articleId, todoId, resolved) => {
      patch((current) => {
        const existing = current.registry.articles[articleId];
        if (!existing) return current;
        const text = setTodoResolvedInDoc(existing.text, todoId, resolved);
        const shortText = setTodoResolvedInDoc(existing.shortText, todoId, resolved);
        if (text === existing.text && shortText === existing.shortText) return current;
        return {
          ...current,
          registry: {
            ...current.registry,
            articles: {
              ...current.registry.articles,
              [articleId]: { ...existing, text, shortText },
            },
          },
        };
      });
    },

    addKeyword: (options) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const created = keywordSchema.parse({ displayName: options?.displayName ?? "" });
      patch((current) => ({
        ...current,
        registry: {
          ...current.registry,
          keywords: { ...current.registry.keywords, [created.id]: created },
        },
      }));
      return created.id;
    },

    updateKeyword: (keywordId, keywordPatch) => {
      patch((current) => {
        const existing = current.registry.keywords[keywordId];
        if (!existing) return current;
        return {
          ...current,
          registry: {
            ...current.registry,
            keywords: {
              ...current.registry.keywords,
              [keywordId]: { ...existing, ...keywordPatch },
            },
          },
        };
      });
    },

    deleteKeyword: (keywordId) => {
      patch((current) => {
        if (!current.registry.keywords[keywordId]) return current;
        const keywords = { ...current.registry.keywords };
        delete keywords[keywordId];
        return { ...current, registry: { ...current.registry, keywords } };
      });
    },

    addImage: (asset) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const created = imageAssetSchema.parse(asset);
      patch((current) => ({
        ...current,
        registry: {
          ...current.registry,
          images: { ...current.registry.images, [created.id]: created },
        },
      }));
      return created.id;
    },

    deleteImage: (imageId) => {
      patch((current) => {
        if (!current.registry.images[imageId]) return current;
        const images = { ...current.registry.images };
        delete images[imageId];
        return { ...current, registry: { ...current.registry, images } };
      });
    },

    addDiagram: (entry) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const created = diagramEntrySchema.parse(entry);
      patch((current) => ({
        ...current,
        registry: {
          ...current.registry,
          diagrams: { ...current.registry.diagrams, [created.id]: created },
        },
      }));
      return created.id;
    },

    updateDiagram: (diagramId, diagramPatch) => {
      patch((current) => {
        const existing = current.registry.diagrams[diagramId];
        if (!existing) return current;
        return {
          ...current,
          registry: {
            ...current.registry,
            diagrams: {
              ...current.registry.diagrams,
              [diagramId]: { ...existing, ...diagramPatch } as DiagramEntry,
            },
          },
        };
      });
    },

    deleteDiagram: (diagramId) => {
      patch((current) => {
        if (!current.registry.diagrams[diagramId]) return current;
        const diagrams = { ...current.registry.diagrams };
        delete diagrams[diagramId];
        return { ...current, registry: { ...current.registry, diagrams } };
      });
    },

    addResource: (options) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const created = resourceDefSchema.parse({ name: options?.name ?? "" });
      patch((current) => {
        const listBuilding = listBuildingOf(current);
        const resources = [...listBuilding.resources, created];
        return {
          ...current,
          listBuilding: {
            ...listBuilding,
            resources,
            // Every format needs a generated cap constraint for the new resource.
            formats: listBuilding.formats.map((f) => syncResourceConstraints(f, resources)),
          },
        };
      });
      return created.id;
    },

    updateResource: (resourceId, resourcePatch) => {
      patch((current) => {
        const listBuilding = current.listBuilding;
        if (!listBuilding?.resources.some((r) => r.id === resourceId)) return current;
        return {
          ...current,
          listBuilding: {
            ...listBuilding,
            resources: listBuilding.resources.map((r) =>
              r.id === resourceId ? { ...r, ...resourcePatch } : r,
            ),
          },
        };
      });
    },

    deleteResource: (resourceId) => {
      patch((current) => {
        const listBuilding = current.listBuilding;
        if (!listBuilding?.resources.some((r) => r.id === resourceId)) return current;
        const resources = listBuilding.resources.filter((r) => r.id !== resourceId);
        return {
          ...current,
          listBuilding: {
            ...listBuilding,
            resources,
            // Drop each format's now-orphaned generated cap constraint.
            formats: listBuilding.formats.map((f) => syncResourceConstraints(f, resources)),
          },
        };
      });
    },

    addFormat: (options) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const base = formatDefSchema.parse({ name: options?.name ?? "" });
      patch((current) => {
        const listBuilding = listBuildingOf(current);
        const created = syncResourceConstraints(base, listBuilding.resources);
        return {
          ...current,
          listBuilding: { ...listBuilding, formats: [...listBuilding.formats, created] },
        };
      });
      return base.id;
    },

    updateFormat: (formatId, formatPatch) => {
      patch((current) => {
        const listBuilding = current.listBuilding;
        if (!listBuilding?.formats.some((f) => f.id === formatId)) return current;
        return {
          ...current,
          listBuilding: {
            ...listBuilding,
            formats: listBuilding.formats.map((f) =>
              f.id === formatId ? { ...f, ...formatPatch } : f,
            ),
          },
        };
      });
    },

    deleteFormat: (formatId) => {
      patch((current) => {
        const listBuilding = current.listBuilding;
        if (!listBuilding?.formats.some((f) => f.id === formatId)) return current;
        return {
          ...current,
          listBuilding: {
            ...listBuilding,
            formats: listBuilding.formats.filter((f) => f.id !== formatId),
          },
        };
      });
    },

    addCategory: (options) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const created = categoryDefSchema.parse({
        name: options?.name ?? "",
        kind: options?.kind ?? "node",
      });
      patch((current) => {
        const listBuilding = listBuildingOf(current);
        return {
          ...current,
          listBuilding: { ...listBuilding, categories: [...listBuilding.categories, created] },
        };
      });
      return created.id;
    },

    updateCategory: (categoryId, categoryPatch) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => ({ ...c, ...categoryPatch })),
      );
    },

    duplicateCategory: (categoryId) => {
      const { ruleset } = get();
      const source = ruleset?.listBuilding?.categories.find((c) => c.id === categoryId);
      if (!source) return null;

      const fieldIdMap = new Map(source.fields.map((f) => [f.id, shortId()]));
      const copy = categoryDefSchema.parse({
        name: source.name ? `${source.name} (copy)` : "",
        kind: source.kind,
        description: source.description,
        fields: source.fields.map((f) => ({ ...f, id: fieldIdMap.get(f.id)! })),
        fieldGroups: source.fieldGroups.map((g) => ({
          id: shortId(),
          name: g.name,
          layout: g.layout,
          fieldIds: g.fieldIds.flatMap((id) => {
            const mapped = fieldIdMap.get(id);
            return mapped ? [mapped] : [];
          }),
        })),
        constraints: structuredClone(source.constraints),
      });

      patch((current) => {
        const listBuilding = current.listBuilding;
        if (!listBuilding) return current;
        const at = listBuilding.categories.findIndex((c) => c.id === categoryId);
        const categories = [...listBuilding.categories];
        categories.splice(at + 1, 0, copy);
        return { ...current, listBuilding: { ...listBuilding, categories } };
      });
      return copy.id;
    },

    deleteCategory: (categoryId) => {
      patch((current) => {
        const listBuilding = current.listBuilding;
        if (!listBuilding?.categories.some((c) => c.id === categoryId)) return current;

        const dropCategoryId = <T extends { categoryId?: string }>(record: Record<string, T>) => {
          const entries = Object.entries(record);
          if (!entries.some(([, value]) => value.categoryId === categoryId)) return record;
          return Object.fromEntries(
            entries.map(([id, value]) => [
              id,
              value.categoryId === categoryId ? { ...value, categoryId: undefined } : value,
            ]),
          ) as Record<string, T>;
        };

        return {
          ...current,
          registry: {
            ...current.registry,
            nodeDefs: dropCategoryId(current.registry.nodeDefs),
            categoryRecords: dropCategoryId(current.registry.categoryRecords),
          },
          listBuilding: {
            ...listBuilding,
            categories: listBuilding.categories.filter((c) => c.id !== categoryId),
          },
        };
      });
    },

    addCategoryField: (categoryId, options) => {
      const { ruleset } = get();
      if (!ruleset?.listBuilding?.categories.some((c) => c.id === categoryId)) return null;
      const created = fieldDefSchema.parse({ type: options?.type ?? "text" });
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => ({ ...c, fields: [...c.fields, created] })),
      );
      return created.id;
    },

    updateCategoryField: (categoryId, fieldId, fieldPatch) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => {
          if (!c.fields.some((f) => f.id === fieldId)) return c;
          return {
            ...c,
            fields: c.fields.map((f) => (f.id === fieldId ? { ...f, ...fieldPatch } : f)),
          };
        }),
      );
    },

    deleteCategoryField: (categoryId, fieldId) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => {
          if (!c.fields.some((f) => f.id === fieldId)) return c;
          return { ...c, fields: c.fields.filter((f) => f.id !== fieldId) };
        }),
      );
    },

    moveCategoryField: (categoryId, fieldId, direction) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => {
          const from = c.fields.findIndex((f) => f.id === fieldId);
          const to = direction === "up" ? from - 1 : from + 1;
          if (from === -1 || to < 0 || to >= c.fields.length) return c;
          const fields = [...c.fields];
          [fields[from], fields[to]] = [fields[to], fields[from]];
          return { ...c, fields };
        }),
      );
    },

    reorderCategoryFields: (categoryId, fieldIds) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => {
          if (
            fieldIds.length !== c.fields.length ||
            !fieldIds.every((id) => c.fields.some((f) => f.id === id))
          ) {
            return c;
          }
          const byId = new Map(c.fields.map((f) => [f.id, f]));
          const fields = fieldIds.map((id) => byId.get(id)!);
          if (fields.every((f, i) => f === c.fields[i])) return c;
          return { ...c, fields };
        }),
      );
    },

    addFieldGroup: (categoryId, options) => {
      const { ruleset } = get();
      if (!ruleset?.listBuilding?.categories.some((c) => c.id === categoryId)) return null;
      const created = fieldGroupDefSchema.parse({ name: options?.name ?? "" });
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => ({
          ...c,
          fieldGroups: [...c.fieldGroups, created],
        })),
      );
      return created.id;
    },

    updateFieldGroup: (categoryId, groupId, groupPatch) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => {
          if (!c.fieldGroups.some((g) => g.id === groupId)) return c;
          return {
            ...c,
            fieldGroups: c.fieldGroups.map((g) => (g.id === groupId ? { ...g, ...groupPatch } : g)),
          };
        }),
      );
    },

    deleteFieldGroup: (categoryId, groupId) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => {
          if (!c.fieldGroups.some((g) => g.id === groupId)) return c;
          return { ...c, fieldGroups: c.fieldGroups.filter((g) => g.id !== groupId) };
        }),
      );
    },

    setFieldGroup: (categoryId, fieldId, groupId) => {
      patch((current) =>
        patchOneCategory(current, categoryId, (c) => {
          if (!c.fields.some((f) => f.id === fieldId)) return c;
          if (groupId !== null && !c.fieldGroups.some((g) => g.id === groupId)) return c;
          const fieldGroups = c.fieldGroups.map((g) => {
            const has = g.fieldIds.includes(fieldId);
            if (g.id === groupId) {
              return has ? g : { ...g, fieldIds: [...g.fieldIds, fieldId] };
            }
            return has ? { ...g, fieldIds: g.fieldIds.filter((id) => id !== fieldId) } : g;
          });
          if (fieldGroups.every((g, i) => g === c.fieldGroups[i])) return c;
          return { ...c, fieldGroups };
        }),
      );
    },

    addNodeDef: (options) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const created = nodeDefSchema.parse({
        name: options?.name ?? "",
        ...(options?.categoryId ? { categoryId: options.categoryId } : {}),
      });
      patch((current) => ({
        ...current,
        registry: {
          ...current.registry,
          nodeDefs: { ...current.registry.nodeDefs, [created.id]: created },
        },
      }));
      return created.id;
    },

    updateNodeDef: (nodeDefId, nodePatch) => {
      patch((current) => patchOneNodeDef(current, nodeDefId, (n) => ({ ...n, ...nodePatch })));
    },

    setNodeDefFieldValue: (nodeDefId, fieldId, value) => {
      patch((current) =>
        patchOneNodeDef(current, nodeDefId, (n) => {
          const fields = { ...n.fields };
          if (value === undefined) {
            if (!(fieldId in fields)) return n;
            delete fields[fieldId];
          } else {
            fields[fieldId] = value;
          }
          return { ...n, fields };
        }),
      );
    },

    setNodeDefBaseCost: (nodeDefId, resourceId, amount) => {
      patch((current) =>
        patchOneNodeDef(current, nodeDefId, (n) => {
          const baseCosts = { ...n.baseCosts };
          if (amount === undefined) {
            if (!(resourceId in baseCosts)) return n;
            delete baseCosts[resourceId];
          } else {
            baseCosts[resourceId] = amount;
          }
          return { ...n, baseCosts };
        }),
      );
    },

    deleteNodeDef: (nodeDefId) => {
      patch((current) => {
        if (!current.registry.nodeDefs[nodeDefId]) return current;
        const nodeDefs = { ...current.registry.nodeDefs };
        delete nodeDefs[nodeDefId];
        return { ...current, registry: { ...current.registry, nodeDefs } };
      });
    },

    addCategoryRecord: (options) => {
      const { ruleset } = get();
      if (!ruleset) return null;
      const created = categoryRecordSchema.parse({
        name: options.name ?? "",
        categoryId: options.categoryId,
      });
      patch((current) => ({
        ...current,
        registry: {
          ...current.registry,
          categoryRecords: { ...current.registry.categoryRecords, [created.id]: created },
        },
      }));
      return created.id;
    },

    updateCategoryRecord: (recordId, recordPatch) => {
      patch((current) => patchOneRecord(current, recordId, (r) => ({ ...r, ...recordPatch })));
    },

    setCategoryRecordValue: (recordId, fieldId, value) => {
      patch((current) =>
        patchOneRecord(current, recordId, (r) => {
          const values = { ...r.values };
          if (value === undefined) {
            if (!(fieldId in values)) return r;
            delete values[fieldId];
          } else {
            values[fieldId] = value;
          }
          return { ...r, values };
        }),
      );
    },

    deleteCategoryRecord: (recordId) => {
      patch((current) => {
        if (!current.registry.categoryRecords[recordId]) return current;
        const categoryRecords = { ...current.registry.categoryRecords };
        delete categoryRecords[recordId];
        return { ...current, registry: { ...current.registry, categoryRecords } };
      });
    },

    addConstraint: (host, def) => {
      const { ruleset } = get();
      if (!ruleset || hostConstraints(ruleset, host) === null) return null;
      patch((current) => withConstraints(current, host, (list) => [...list, def]));
      return def.id;
    },

    updateConstraint: (host, constraintId, def) => {
      patch((current) =>
        withConstraints(current, host, (list) => {
          const at = list.findIndex((c) => c.id === constraintId);
          if (at < 0 || list[at].generatedFor) return list;
          const next = [...list];
          next[at] = def;
          return next;
        }),
      );
    },

    deleteConstraint: (host, constraintId) => {
      patch((current) =>
        withConstraints(current, host, (list) => {
          const target = list.find((c) => c.id === constraintId);
          if (!target || target.generatedFor) return list;
          return list.filter((c) => c.id !== constraintId);
        }),
      );
    },
  };
});
