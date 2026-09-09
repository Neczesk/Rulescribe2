import { diagramReferences, imageReferences, keywordReferences } from "../../schema/references";
import { buildIssue } from "../catalogue";
import { isLiveText, type EntityInfo, type StatsContext } from "../context";
import { THRESHOLDS } from "../thresholds";
import { joinNames, plural, verb } from "../text";
import {
  articleTarget,
  keywordTarget,
  type IssueEntry,
  type IssueTarget,
  type StatsIssue,
} from "../types";

/** REF-01 … REF-17 — the integrity of links between articles, keywords and assets. */
export function referenceChecks(ctx: StatsContext): StatsIssue[] {
  return [
    ...unlinkedMentions(ctx),
    ...danglingRefs(ctx),
    ...missingImageBlobs(ctx),
    ...circularLiveRefs(ctx),
    ...selfLiveRefs(ctx),
    ...emptyLiveRefs(ctx),
    ...linksIntoNotes(ctx),
    ...deepLiveChains(ctx),
    ...keywordUsage(ctx),
    ...unusedAssets(ctx),
    ...articlesWithoutInboundLinks(ctx),
  ];
}

/**
 * REF-01 — a keyword's name typed as plain text instead of inserted as a
 * reference. Linked references are node attributes, so they contribute no text
 * nodes: anything the flattened text still matches is by definition unlinked.
 */
function unlinkedMentions(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];

  for (const keyword of ctx.keywords) {
    if (!keyword.named) continue;
    const pattern = new RegExp(`\\b${escapeRegExp(keyword.name)}\\b`, "gi");

    let mentions = 0;
    const entries: IssueEntry[] = [];
    for (const entity of ctx.entities) {
      if (entity.kind === "keyword" && entity.id === keyword.id) continue;
      const count = (entity.text.match(pattern) ?? []).length;
      if (count === 0) continue;
      mentions += count;
      entries.push({ label: entity.name, target: targetOf(entity) });
    }
    if (mentions === 0) continue;

    issues.push(
      buildIssue(
        "REF-01",
        {
          countPhrase: plural(mentions, "keyword mention"),
          verb: verb(mentions, "is", "are"),
          keyword: keyword.name,
          names: joinNames(entries.map((entry) => entry.label)),
        },
        { kind: "list", label: "Show list", entries },
      ),
    );
  }

  return issues;
}

/** REF-02 … REF-05 — references whose target is no longer in the registry. */
function danglingRefs(ctx: StatsContext): StatsIssue[] {
  const specs = [
    {
      code: "REF-02",
      type: "keywordRef" as const,
      exists: (id: string) => id in ctx.ruleset.registry.keywords,
    },
    {
      code: "REF-03",
      type: "articleRef" as const,
      exists: (id: string) => id in ctx.ruleset.registry.articles,
    },
    {
      code: "REF-04",
      type: "diagramRef" as const,
      exists: (id: string) => id in ctx.ruleset.registry.diagrams,
    },
    {
      code: "REF-05",
      type: "imageBlock" as const,
      exists: (id: string) => id in ctx.ruleset.registry.images,
    },
  ];

  const issues: StatsIssue[] = [];
  for (const spec of specs) {
    const broken = ctx.refs.filter(
      (ref) => ref.type === spec.type && (ref.targetId === null || !spec.exists(ref.targetId)),
    );
    if (broken.length === 0) continue;

    const entries = dedupeEntries(
      broken.map((ref) => ({
        label: ctx.name(ctx.ownerTarget(ref.owner)),
        target: ctx.ownerTarget(ref.owner),
      })),
    );

    issues.push(
      buildIssue(
        spec.code,
        {
          countPhrase: plural(broken.length, "reference"),
          pointVerb: verb(broken.length, "points", "point"),
          names: joinNames(entries.map((entry) => entry.label)),
        },
        { kind: "list", label: "Show list", entries },
      ),
    );
  }
  return issues;
}

/** REF-06 — an image entry whose bytes are missing from IndexedDB. */
function missingImageBlobs(ctx: StatsContext): StatsIssue[] {
  const blobIds = ctx.extras.imageBlobIds;
  if (!blobIds) return [];

  const missing = Object.values(ctx.ruleset.registry.images).filter(
    (image) => !blobIds.has(image.id),
  );
  if (missing.length === 0) return [];

  return [
    buildIssue(
      "REF-06",
      {
        countPhrase: plural(missing.length, "image"),
        verb: verb(missing.length, "has", "have"),
        names: joinNames(missing.map((image) => image.filename.trim() || "an untitled image")),
      },
      { kind: "none" },
    ),
  ];
}

interface LiveEdge {
  from: IssueTarget;
  to: IssueTarget;
}

/** Reference edges that embed the target's own text at render time. */
function liveEdges(ctx: StatsContext): LiveEdge[] {
  const edges: LiveEdge[] = [];
  for (const ref of ctx.refs) {
    if (!isLiveText(ref.display) || ref.targetId === null) continue;
    if (ref.type === "keywordRef" && ref.targetId in ctx.ruleset.registry.keywords) {
      edges.push({ from: ctx.ownerTarget(ref.owner), to: keywordTarget(ref.targetId) });
    } else if (ref.type === "articleRef" && ref.targetId in ctx.ruleset.registry.articles) {
      edges.push({ from: ctx.ownerTarget(ref.owner), to: articleTarget(ref.targetId) });
    }
  }
  return edges;
}

const key = (target: IssueTarget) => `${target.kind}:${target.id}`;

function adjacency(edges: LiveEdge[]): Map<string, IssueTarget[]> {
  const map = new Map<string, IssueTarget[]>();
  for (const edge of edges) {
    const list = map.get(key(edge.from)) ?? [];
    list.push(edge.to);
    map.set(key(edge.from), list);
  }
  return map;
}

/**
 * REF-07 — a live-embed cycle. Each cycle expands the other's text forever, so
 * the export never terminates on its own; the renderer has to cut it off.
 */
function circularLiveRefs(ctx: StatsContext): StatsIssue[] {
  const edges = liveEdges(ctx).filter((edge) => key(edge.from) !== key(edge.to));
  const graph = adjacency(edges);
  const cycles: IssueTarget[][] = [];
  const seenCycles = new Set<string>();
  const state = new Map<string, "visiting" | "done">();

  const visit = (node: IssueTarget, stack: IssueTarget[]) => {
    const id = key(node);
    if (state.get(id) === "done") return;
    if (state.get(id) === "visiting") {
      const start = stack.findIndex((entry) => key(entry) === id);
      if (start < 0) return;
      const cycle = stack.slice(start);
      // Rotate to a canonical start so the same loop found from two entry
      // points is reported once.
      const signature = [...cycle.map(key)].sort().join("|");
      if (!seenCycles.has(signature)) {
        seenCycles.add(signature);
        cycles.push(cycle);
      }
      return;
    }
    state.set(id, "visiting");
    for (const next of graph.get(id) ?? []) visit(next, [...stack, node]);
    state.set(id, "done");
  };

  for (const node of graph.keys()) {
    const [kind, ...rest] = node.split(":");
    visit({ kind: kind as IssueTarget["kind"], id: rest.join(":") }, []);
  }

  if (cycles.length === 0) return [];

  const first = cycles[0]!;
  const chain = [...first, first[0]!];
  return [
    buildIssue(
      "REF-07",
      {
        countPhrase: plural(cycles.length, "circular live reference"),
        chain: chain.map((node) => ctx.name(node)).join(" live-embeds "),
      },
      {
        kind: "chain",
        label: "Show chain",
        entries: chain.map((node) => ({ label: ctx.name(node), target: node })),
      },
    ),
  ];
}

/** REF-08 — an entity that live-embeds itself; the same cycle, length one. */
function selfLiveRefs(ctx: StatsContext): StatsIssue[] {
  const selves = dedupeEntries(
    liveEdges(ctx)
      .filter((edge) => key(edge.from) === key(edge.to))
      .map((edge) => ({ label: ctx.name(edge.from), target: edge.from })),
  );
  if (selves.length === 0) return [];

  return [
    buildIssue(
      "REF-08",
      {
        countPhrase: plural(selves.length, "reference"),
        names: joinNames(selves.map((entry) => entry.label)),
        embedVerb: verb(selves.length, "live-embeds", "live-embed"),
      },
      { kind: "list", label: "Show list", entries: selves },
    ),
  ];
}

/** REF-09 / REF-10 — a live reference whose target has nothing to embed. */
function emptyLiveRefs(ctx: StatsContext): StatsIssue[] {
  const specs = [
    { code: "REF-09", display: "text" as const, field: "text" as const },
    { code: "REF-10", display: "shortText" as const, field: "shortText" as const },
  ];

  const issues: StatsIssue[] = [];
  for (const spec of specs) {
    const entries: IssueEntry[] = [];
    for (const ref of ctx.refs) {
      if (ref.display !== spec.display || ref.targetId === null) continue;
      const target = resolveTarget(ctx, ref.type, ref.targetId);
      if (!target || target[spec.field].trim()) continue;
      entries.push({ label: target.name, target: targetOf(target) });
    }
    const unique = dedupeEntries(entries);
    if (unique.length === 0) continue;

    issues.push(
      buildIssue(
        spec.code,
        {
          countPhrase: plural(entries.length, "live reference"),
          resolveVerb: verb(entries.length, "resolves", "resolve"),
          names: joinNames(unique.map((entry) => entry.label)),
          haveVerb: verb(unique.length, "has", "have"),
        },
        unique.length === 1
          ? { kind: "navigate", label: `Open ${unique[0]!.label}`, target: unique[0]!.target! }
          : { kind: "list", label: "Show list", entries: unique },
      ),
    );
  }
  return issues;
}

/** REF-11 — an exported article linking into one that export strips out. */
function linksIntoNotes(ctx: StatsContext): StatsIssue[] {
  const entries: IssueEntry[] = [];
  for (const ref of ctx.refs) {
    if (ref.type !== "articleRef" || ref.targetId === null) continue;
    if (ref.owner.kind !== "article") continue;
    const owner = ctx.articles.find((article) => article.id === ref.owner.id);
    const target = ctx.articles.find((article) => article.id === ref.targetId);
    if (!owner || !target || owner.isNotes || !target.isNotes) continue;
    entries.push({ label: `${owner.name} → ${target.name}`, target: articleTarget(owner.id) });
  }
  const unique = dedupeEntries(entries);
  if (unique.length === 0) return [];

  return [
    buildIssue(
      "REF-11",
      {
        countPhrase: plural(unique.length, "exported article"),
        linkVerb: verb(unique.length, "links", "link"),
        names: joinNames(unique.map((entry) => entry.label)),
      },
      { kind: "list", label: "Show list", entries: unique },
    ),
  ];
}

/** REF-12 — text pulled through a long chain of live references. */
function deepLiveChains(ctx: StatsContext): StatsIssue[] {
  const graph = adjacency(liveEdges(ctx));
  let deepest: IssueTarget[] = [];

  const walk = (node: IssueTarget, path: IssueTarget[]) => {
    if (path.some((entry) => key(entry) === key(node))) return; // a cycle; REF-07 owns it
    const next = [...path, node];
    if (next.length > deepest.length) deepest = next;
    for (const child of graph.get(key(node)) ?? []) walk(child, next);
  };

  for (const node of graph.keys()) {
    const [kind, ...rest] = node.split(":");
    walk({ kind: kind as IssueTarget["kind"], id: rest.join(":") }, []);
  }

  // A path of N nodes is N-1 hops.
  const hops = Math.max(deepest.length - 1, 0);
  if (hops <= THRESHOLDS.liveChainLength) return [];

  return [
    buildIssue(
      "REF-12",
      { start: ctx.name(deepest[0]!), hopsPhrase: plural(hops, "level") },
      {
        kind: "chain",
        label: "Show chain",
        entries: deepest.map((node) => ({ label: ctx.name(node), target: node })),
      },
    ),
  ];
}

/** REF-13 / REF-14 — keywords nothing points at, and keywords only one article uses. */
function keywordUsage(ctx: StatsContext): StatsIssue[] {
  const uses = keywordReferences(ctx.ruleset);
  const issues: StatsIssue[] = [];

  const unused = ctx.keywords.filter((keyword) => (uses[keyword.id]?.length ?? 0) === 0);
  if (unused.length > 0) {
    const entries = unused.map((keyword) => ({
      label: keyword.name,
      target: keywordTarget(keyword.id),
    }));
    const be = verb(unused.length, "is", "are");
    issues.push(
      buildIssue(
        "REF-13",
        {
          countPhrase: plural(unused.length, "keyword"),
          verb: be,
          names: joinNames(entries.map((entry) => entry.label)),
        },
        unused.length === 1
          ? { kind: "navigate", label: `Open ${entries[0]!.label}`, target: entries[0]!.target }
          : { kind: "list", label: "Show list", entries },
      ),
    );
  }

  const single = ctx.keywords.filter((keyword) => (uses[keyword.id]?.length ?? 0) === 1);
  if (single.length > 0) {
    const entries = single.map((keyword) => ({
      label: keyword.name,
      target: keywordTarget(keyword.id),
    }));
    const where = single
      .map((keyword) => ctx.name(articleTarget(uses[keyword.id]![0]!)))
      .filter(Boolean);
    const detail =
      single.length === 1
        ? `${single[0]!.name} appears only in ${where[0]}.`
        : `${joinNames(entries.map((entry) => entry.label))} each appear in only one article.`;
    issues.push(
      buildIssue(
        "REF-14",
        {
          countPhrase: plural(single.length, "keyword"),
          verb: verb(single.length, "is", "are"),
          detail,
        },
        single.length === 1
          ? { kind: "navigate", label: `Open ${entries[0]!.label}`, target: entries[0]!.target }
          : { kind: "list", label: "Show list", entries },
      ),
    );
  }

  return issues;
}

/** REF-15 / REF-16 — diagrams and images nothing embeds. */
function unusedAssets(ctx: StatsContext): StatsIssue[] {
  const issues: StatsIssue[] = [];

  const diagramUses = diagramReferences(ctx.ruleset);
  const unusedDiagrams = Object.values(ctx.ruleset.registry.diagrams).filter(
    (diagram) => (diagramUses[diagram.id]?.length ?? 0) === 0,
  );
  if (unusedDiagrams.length > 0) {
    issues.push(
      buildIssue(
        "REF-15",
        {
          countPhrase: plural(unusedDiagrams.length, "diagram"),
          verb: verb(unusedDiagrams.length, "is", "are"),
          names: joinNames(
            unusedDiagrams.map((diagram) => diagram.name.trim() || "an unnamed diagram"),
          ),
        },
        { kind: "none" },
      ),
    );
  }

  const imageUses = imageReferences(ctx.ruleset);
  const unusedImages = Object.values(ctx.ruleset.registry.images).filter(
    (image) => (imageUses[image.id]?.length ?? 0) === 0,
  );
  if (unusedImages.length > 0) {
    const be = verb(unusedImages.length, "is", "are");
    const detail =
      unusedImages.length === 1
        ? "One image is stored but unused; it still ships in the export bundle."
        : `${unusedImages.length} images are stored but unused; they still ship in the export bundle.`;
    issues.push(
      buildIssue(
        "REF-16",
        { countPhrase: plural(unusedImages.length, "image"), verb: be, detail },
        { kind: "none" },
      ),
    );
  }

  return issues;
}

/** REF-17 — an article only the structure tree points at. */
function articlesWithoutInboundLinks(ctx: StatsContext): StatsIssue[] {
  const linked = new Set(
    ctx.refs
      .filter((ref) => ref.type === "articleRef" && ref.targetId !== null)
      .map((ref) => ref.targetId!),
  );

  const rootId = ctx.ruleset.structure.articleId;
  const orphans = ctx.articles.filter(
    (article) => article.id !== rootId && !linked.has(article.id),
  );
  if (orphans.length === 0) return [];

  const entries = orphans.map((article) => ({
    label: article.name,
    target: articleTarget(article.id),
  }));
  return [
    buildIssue(
      "REF-17",
      {
        countPhrase: plural(orphans.length, "article"),
        verbHave: verb(orphans.length, "has", "have"),
        verbBe: verb(orphans.length, "is", "are"),
        names: joinNames(entries.map((entry) => entry.label)),
      },
      { kind: "list", label: "Show list", entries },
    ),
  ];
}

function resolveTarget(ctx: StatsContext, type: string, id: string): EntityInfo | undefined {
  if (type === "keywordRef") return ctx.keywords.find((keyword) => keyword.id === id);
  if (type === "articleRef") return ctx.articles.find((article) => article.id === id);
  return undefined;
}

function targetOf(entity: EntityInfo): IssueTarget {
  return entity.kind === "article" ? articleTarget(entity.id) : keywordTarget(entity.id);
}

function dedupeEntries(entries: IssueEntry[]): IssueEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => {
    const id = entry.target ? key(entry.target) : entry.label;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
