# CLAUDE.md

Guidance for AI agents working in this repo. Read before making changes. The
**Architecture boundaries** and **Do not** sections are load-bearing — violating
them silently breaks the design.

## What this is

A **local-only PWA** for making tabletop wargames rulesets. No backend, no
accounts, no server. All data lives on the user's device (IndexedDB). Offline
and privacy are the point, not a feature.

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
features/
  editor/           TipTap editor, custom nodes  — depends on core
  list-builder/     forms + constraint UI        — depends on core
app/                shell, router, providers, service worker
```

Rules:

- **`core/` imports nothing from React, TipTap, Mantine, or any UI/browser
  framework.** It is pure TS. It is the portable spine, the most-tested part of
  the codebase, and the piece that could one day move to a Rust/Tauri backend.
  Keep it clean.
- **Features depend on `core/`, never on each other.** No import from
  `features/editor` into `features/list-builder` or vice versa. Shared logic
  goes in `core/`.
- **Each feature is lazy-loaded** via dynamic `import()` at the route boundary,
  so Vite emits a separate chunk per feature. A user who only builds lists
  should never download the editor's (heavy) TipTap bundle.

⚠️ **The code-split is fragile.** It only holds if the feature is reached
*exclusively* through a dynamic `import()`. A single static `import` of anything
from a feature module into the shell or shared code pulls that whole feature
back into the main chunk with **no error** and silently defeats the split. If
you must share something between the shell and a feature, it belongs in `core/`.
After changes near feature boundaries, verify chunks with the build output /
bundle visualizer.

## Tech stack

Choices are deliberate. Do not swap these out or reintroduce rejected options
without being asked.

| Concern        | Choice                                  | Notes / rejected alternatives |
|----------------|-----------------------------------------|-------------------------------|
| Build/scaffold | Vite + React + TS, **React Compiler**   | Scaffolded from create-vite's "React + TypeScript + React Compiler" variant (compiler pre-wired). |
| UI library     | **Mantine** (+ `@mantine/form`)         | NOT MUI, NOT shadcn. |
| Styling        | Mantine CSS Modules + theme tokens/CSS vars | **No Tailwind** (project preference). No runtime CSS-in-JS. |
| State          | **Zustand**                             | NOT Redux. |
| Persistence    | Zustand `persist` + `idb-keyval` (IndexedDB) | NOT localStorage. |
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
- **No backend.** If ruleset *sharing* is added later, prefer static file
  export/import or static hosting of ruleset JSON — a real backend is only
  warranted for accounts, live collaboration, or a central registry, all of
  which are out of scope for now.
- Keep `core/` extractable: if a desktop authoring app (Tauri, real files) is
  ever added for power users, it should reuse `core/` as a shared package with a
  different frontend — not a fork.

## Do not

- Split the app into multiple apps or origins.
- Introduce a backend, accounts, or a server dependency.
- Add Tailwind, MUI, shadcn, Redux, ESLint, or Prettier.
- Swap the editor away from TipTap, or reintroduce Slate/Lexical.
- Add manual `useMemo`/`useCallback`/`React.memo` or use `useEffect` for derived
  state or store-sync.
- Import feature code into the shell/shared layer via a static import.
- Store definition/preview text inside a TipTap node instead of a registry id.
- Put game-specific logic in the list builder — it must stay rules-agnostic.
- Let `core/` depend on any UI framework.