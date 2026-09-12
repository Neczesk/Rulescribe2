# CLAUDE.md

Guidance for AI agents working in this repo. Read before making changes. The
**Architecture boundaries** and **Do not** sections are load-bearing — violating
them silently breaks the design.

## What this is

A **local-first PWA** for making tabletop wargames rulesets. IndexedDB on the
user's device is the source of truth, the app works fully offline, and a
signed-out user can do everything except sync and share. Offline is the point,
not a feature.

There is now an **optional** Supabase backend, added deliberately after a long
local-only period, for exactly two things:

- **Accounts + multi-device sync** — sign in and continue a ruleset on another
  device.
- **Share links** — publish an immutable HTML snapshot of a ruleset and hand
  someone a URL. Re-sharing after more editing mints a *new* link; old links
  keep working.

Nothing else. The cloud is a mirror and a publishing target, never the source of
truth. If you find yourself making the app require a network round-trip to do
something it does today, you have taken a wrong turn.

Two user-facing features, one app:

1. **Rules editor** — a rich text editor for authoring rulesets. Supports
   keyword definitions, article/cross-reference linking, and export to
   auto-formatted standalone HTML.
2. **List builder** — a *rules-agnostic* army list builder (in the spirit of
   New Recruit). It reads the rulesets and keyword/article registry the editor
   produces and enforces list-building constraints the ruleset author defined.
   It contains no game-specific logic of its own.

## Architecture boundaries

The app is **one Vite app with split (lazy-loaded) bundles** over a shared core.
It is **not** two apps. Do not propose splitting it into separate apps/origins —
the two features share too much data, and IndexedDB is per-origin, so a split
would break the free data handoff between them.

Three layers:

```
core/               framework-agnostic, dependency-free TypeScript
  schema/           Zod ruleset schema (source of truth for types)
  engine/           constraint engine (list-building rules evaluator)
  registry/         keyword + article registry types
  storage/          storage interface (persistence abstraction)
  sync/             sync decision logic + SyncTransport INTERFACE (no SDK)
  auth/             session store — plain state, no SDK
features/
  editor/           TipTap editor, custom nodes  — depends on core
  list-builder/     forms + constraint UI        — depends on core
app/                shell, router, providers, service worker
  cloud/            the ONLY place @supabase/supabase-js is imported
```

Rules:

- **`core/` imports nothing from React, TipTap, Mantine, any UI/browser
  framework, or the Supabase SDK.** It is pure TS. It is the portable spine, the
  most-tested part of the codebase, and the piece that could one day move to a
  Rust/Tauri backend. Keep it clean.
- **Features depend on `core/`, never on each other.** No import from
  `features/editor` into `features/list-builder` or vice versa. Shared logic
  goes in `core/`.
- **Each feature is lazy-loaded** via dynamic `import()` at the route boundary,
  so Vite emits a separate chunk per feature. A user who only builds lists
  should never download the editor's (heavy) TipTap bundle.
- **`core/sync` is pure and the SDK lives behind an interface.** `core/sync`
  defines `SyncTransport` and the decision logic that plans a sync (compare
  content hashes and server revisions, emit actions); `app/cloud` implements
  that interface with Supabase. The orchestrator takes a `SyncTransport` as a
  **parameter** — it never imports one. This is what keeps the SDK out of
  `core/`, which every feature imports, and what makes the protocol testable
  against a fake transport with no network.
- **`core/auth/session.ts` is a vanilla Zustand store with no SDK import**, so
  router `loader`s (which run outside React) can read it via `getState()` and
  `throw redirect()`. The pattern already exists — see `rulesetLoader.ts`.

⚠️ **The code-split is fragile.** It only holds if the feature is reached
*exclusively* through a dynamic `import()`. A single static `import` of anything
from a feature module into the shell or shared code pulls that whole feature
back into the main chunk with **no error** and silently defeats the split. If
you must share something between the shell and a feature, it belongs in `core/`.
After changes near feature boundaries, verify chunks with the build output /
bundle visualizer.

⚠️ **The Supabase SDK is subject to the same fragility, and the shell is where
it will break.** Reach it only through the memoized dynamic import in
`app/cloud/lazyCloud.ts`. The four places a static import would silently pull
~120 KB of SDK into the main chunk: the account control in `AppLayout` (eager
shell), anything registered beside `initPersistence()` in `App.tsx`,
`core/sync`'s orchestrator, and `MainMenu` when it reads the remote library
index. Re-run `npm run build` and compare chunk sizes after touching any of
them.

## Tech stack

Choices are deliberate. Do not swap these out or reintroduce rejected options
without being asked.

| Concern        | Choice                                  | Notes / rejected alternatives |
|----------------|-----------------------------------------|-------------------------------|
| Build/scaffold | Vite + React + TS, **React Compiler**   | Scaffolded from create-vite's "React + TypeScript + React Compiler" variant (compiler pre-wired). |
| UI library     | **Mantine** (+ `@mantine/form`)         | NOT MUI, NOT shadcn. |
| Styling        | Mantine CSS Modules + theme tokens/CSS vars | **No Tailwind** (project preference). No runtime CSS-in-JS. |
| State          | **Zustand**                             | NOT Redux. |
| Persistence    | Zustand `persist` + `idb-keyval` (IndexedDB) | NOT localStorage. Local IndexedDB is the source of truth. |
| Backend        | **Supabase** (auth, Postgres, Storage)  | Optional and opt-in. Chosen as a single vendor over assembling Cloudflare + a separate auth provider. NOT Firebase (its SDK wants to own the local cache, which fights local-first). |
| Hosting        | **Cloudflare Workers** (static assets), own subdomain | Migrated off GitHub Pages — see Gotchas. Workers rather than Pages because Cloudflare now steers new Git connections there; for a pure static SPA the two are equivalent. |
| Editor         | **TipTap** + `@mantine/tiptap`          | NOT Slate (perpetual beta), NOT Lexical. |
| Schema         | **Zod**                                 | Runtime validation + derive TS types from one source. |
| PWA            | `vite-plugin-pwa`                       | Service worker + manifest. |
| Lint           | **oxlint**                              | NOT ESLint. |
| Format         | **oxfmt**                               | NOT Prettier. |
| Test           | **Vitest** (+ Testing Library)          | Concentrate tests in `core/`. |

## Conventions

### React Compiler is on

- **Do not** add manual `useMemo`, `useCallback`, or `React.memo` for
  performance. Write plain code; the compiler handles memoization. Only reach
  for manual memoization in the rare component the compiler explicitly bails on.
- Follow the Rules of React (pure render, no mutation during render) so the
  compiler can optimize. oxlint's `react/react-compiler` rule enforces this.

### State & effects

- **Read** store state with a Zustand selector — not by mirroring into local
  `useState`.
- **Write** in the event handler that caused the change (call the store action
  directly). No local copy reconciled by an effect.
- **Derive** in render / in a computed selector — e.g. list validity is
  `validateList(list, ruleset)` computed on the fly, never stored and synced.
- **Persist** via the `persist` middleware, not a hand-written effect.
- `useEffect` is reserved for genuine synchronization with the outside world
  (subscriptions, imperative DOM/browser APIs). If you're using it for derived
  state or store-sync, that's a smell — use one of the patterns above.

### Custom TipTap nodes (keyword links, article links)

- Each custom node stores an **id referencing `core/registry`**, never a copy of
  the definition or preview text. The registry is the single source of truth;
  nodes are pointers that look up their entity at render time.
- Each node has **two render targets**, and they differ by design:
  - **In-editor:** a React node view (`ReactNodeViewRenderer`) with hover
    (Mantine `HoverCard`) + click-to-edit. Make nodes atoms and put
    `contentEditable={false}` on interactive elements so clicks aren't swallowed
    by ProseMirror.
  - **HTML export:** static output — keyword → `<span>` with tooltip, article
    link → `<a href="#article-id">`. No editing affordances.
- "Create new on insert" is handled in the suggestion `command`: append a
  synthetic "create …" item to the suggestion list; on select, create the
  registry entry (stub, empty definition), then insert the node with the new id.

### TypeScript

- `strict` on. The constraint engine models rule nodes as **discriminated
  unions** and switches on the tag with **exhaustiveness checking** (the `never`
  assertion in the default branch) so new node types are compile-time errors
  until handled.

## Gotchas

- **Static imports defeating the code-split** — see Architecture boundaries.
  This is the highest-impact mistake in this repo.
- **Mantine setup** — requires a PostCSS config (`postcss-preset-mantine` +
  `postcss-simple-vars`) and a `@mantine/core/styles.css` import at the root.
  Missing these breaks styling quietly, not loudly.
- **TipTap mention** — `@tiptap/suggestion` is a separate peer dependency the
  mention extension needs; install it explicitly.
- **Service worker caching** — aggressive by design; old versions may persist in
  dev. Understand `vite-plugin-pwa`'s update lifecycle rather than fighting it.
  HTTPS required in production (localhost exempt).
- **oxfmt** — configure via `.oxfmtrc.json`; CLI style flags (e.g. `--no-semi`)
  are not supported, use the config file.
- **React Compiler + tests** — Vitest doesn't apply the compiler transform to
  test files by default. Harmless; don't expect memoization in tests.
- **Set `sourcemap: true`** in Vite — the compiler's generated code is
  unreadable in devtools otherwise.
- **Diagrams (`@excalidraw/excalidraw`, `mermaid`)** — both are heavy and must
  stay out of the main/editor bundle. `@excalidraw/excalidraw/index.css` and
  the `<Excalidraw>` component itself may only be imported from inside
  `ExcalidrawEditModal.tsx`, which is reached exclusively via a lazy
  `import()` — never add a static import of either anywhere else. Mermaid
  needs no separate CSS import (its theme is injected via JS at render time).
  `mermaid.render(id, source)` is called from inside a React `useEffect` on a
  detached container, so keep the installed Mermaid version pinned to one
  confirmed to support off-DOM SVG string rendering (v10+).
- **Hosting migration is in flight.** The target is a Cloudflare Worker serving
  static assets at a subdomain, with `base: "/"` and SPA routing configured in
  `wrangler.jsonc` as `assets.not_found_handling: "single-page-application"` —
  **not** a `_redirects` file. (A `_headers` file *is* supported for static
  assets; put it in `public/` so Vite copies it into `dist/`.) Until that lands
  the repo still carries the GitHub Pages machinery — `public/404.html`, the
  query-unescaping shim `<script>` in `index.html`, the
  `mode === "github-pages"` branch in `vite.config.ts`, and
  `.github/workflows/deploy.yml`. All four get deleted together; don't build
  anything new on top of them. Note `public/404.html` is actively harmful on
  Cloudflare — a custom 404 is served for unmatched paths, and that file's shim
  treats the first path segment as a base prefix, so deep links bounce through a
  garbled URL until it's gone.
- **The cloud is optional and every code path must prove it.** A signed-out
  user, an offline user, and a user who never creates an account must all get
  today's behaviour. Network failures surface as status, never as a blocked
  editor.
- **Ruleset bodies are big and do not belong in Postgres.** Excalidraw scenes
  are stored verbatim in the ruleset JSON, so a real ruleset is 0.5–2 MB and can
  reach 3–10 MB. Bodies go to Supabase Storage **gzipped** (`CompressionStream`),
  keyed by revision so they are append-only; Postgres holds a ~200-byte metadata
  row. Image blobs are already out-of-band and content-addressed by id — keep
  them that way.
- **`metadata.updatedAt` is a device clock and is display-only.** It is bumped
  reliably (one choke point — `patch()` in `currentRuleset.ts`), but two devices
  do not share a clock. Sync decisions use a **content hash** (SHA-256 of
  key-sorted canonical JSON) and the server's `rev`, never a timestamp. Key
  sorting is not optional: the ruleset is full of `z.record` maps whose key order
  differs between "freshly edited" and "parsed from IndexedDB", and an
  order-sensitive hash reports spurious changes forever.
- **schemaVersion skew is a data-loss vector, not a UX wrinkle.** `migrate()` is
  forward-only and passes a *newer* version through untouched, which then fails
  `safeParse`. Without a guard, an older device overwrites a newer-schema body
  and the owner gets the "written by a newer version" banner with the real data
  already gone. The database rejects schema downgrades in a trigger; the client
  refuses to pull anything above `CURRENT_SCHEMA_VERSION`.
- **Conflicts fork, they never merge.** On a genuine conflict, mint a fresh id
  for the local copy and keep both. `readRulesetFile` already implements and
  tests exactly this id-collision primitive — reuse it rather than writing a
  second one.
- **The Supabase anon key is not a secret.** RLS is the security boundary, so it
  ships as a plain build-time `VITE_` var. What *is* load-bearing: RLS on every
  table and bucket, and "allow new signups" staying off while the project is
  private.
- **A free Supabase project pauses after 7 days with no API activity** and needs
  a manual restore, which would silently break every share link. A Cloudflare
  Worker cron pings it; don't remove that without moving to Pro.

## Commands

<!-- Adjust to match package.json once finalized. -->

The user always has `npm run dev` running at `localhost:5173`. Don't start
another dev server to check a change or take a screenshot — just hit the
already-running one.

```
npm run dev            # Vite dev server
npm run build          # production build (check chunk split here)
npm run test           # Vitest
npm run lint           # oxlint
npm run format         # oxfmt --check
npm run format:fix     # oxfmt .
```

## Scope & roadmap

- **Now:** conventional points-based systems (points totals, force-org limits,
  per-unit caps, wargear/options, keyword interactions).
- **Later:** narrative/campaign rules and unusual/asymmetric mechanics. The
  constraint schema should leave room for these but need not implement them yet.
- **Backend scope is fixed at accounts, sync, and share links.** That is the
  whole justification for adding Supabase; it was weighed against staying
  local-only and against assembling Cloudflare + a separate auth provider. Live
  collaboration, a central ruleset registry, server-side rendering, and
  server-side game logic remain **out of scope** — each would need its own
  argument, and none has one yet.
- **Sync is single-user, multi-device.** Not collaborative editing. That is what
  makes last-writer-wins-with-fork correct and a CRDT unnecessary. Do not
  introduce one.
- Army list sync is **not** built yet: the list persistence layer
  (`saveList`/`loadList`/`listLists`) currently has no UI callers at all. When
  that UI gets built, design sync in from the start rather than retrofitting.
- Keep `core/` extractable: if a desktop authoring app (Tauri, real files) is
  ever added for power users, it should reuse `core/` as a shared package with a
  different frontend — not a fork.

## Do not

- Split the app into multiple apps or origins.
- Make the cloud required for anything the app does today, or treat the server
  as the source of truth. IndexedDB is authoritative; the cloud is a mirror.
- Import `@supabase/supabase-js` anywhere but `app/cloud/`, or reach it by
  anything other than the lazy dynamic import.
- Let `core/` depend on the Supabase SDK — including indirectly, by having
  `core/sync` import a transport implementation instead of taking the interface
  as a parameter.
- Store a ruleset body in a Postgres column, or sync an uncompressed body.
- Use `updatedAt` (or any timestamp) to decide a sync outcome.
- Merge two conflicting rulesets. Fork and keep both.
- Expand the backend past accounts / sync / share links without being asked.
- Add Tailwind, MUI, shadcn, Redux, ESLint, or Prettier.
- Swap the editor away from TipTap, or reintroduce Slate/Lexical.
- Add manual `useMemo`/`useCallback`/`React.memo` or use `useEffect` for derived
  state or store-sync.
- Import feature code into the shell/shared layer via a static import.
- Store definition/preview text inside a TipTap node instead of a registry id.
- Put game-specific logic in the list builder — it must stay rules-agnostic.
- Let `core/` depend on any UI framework.