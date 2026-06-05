# Architecture view — a developer-facing "how it's built" doc

**Date:** 2026-06-06
**Branch:** `feat/architecture-view`

## Problem

The product doc and mockup explain the product to *planners* — what the service does and
how its screens look. A developer joining to build part of the whole product has no
in-app orientation to *how the system is built*: its layers, modules, stack, and key flows.

## Goal

A new **Architecture** view: a code-grounded technical overview generated from a deep scan
of the codebase. Same code, the opposite lens from the product doc — "how it's built", for
a developer building a piece of the whole. Scope is the architecture *overview* only (no
codebase map, extension guide, or diagram — explicitly out of scope per the brainstorm).

## Approach (chosen): parallel code-grounded map→reduce pipeline

Reuse the product-doc "Rebuild" deep pass (`collectProjectFiles` → map → reduce) with a
technical prompt set. Rejected: a single-pass summary (breaks on big repos, lower quality —
the lesson the product doc already encodes) and deriving from the product doc (impossible —
it deliberately excludes implementation).

## Design

### Document structure (English spine, prose in the user's language — language policy)

- `## Overview` — the system at a glance (1–2 paragraphs)
- `## Stack` — languages, frameworks, key libraries, runtime
- `## Modules` — the real modules/layers (domain / core / server / agent / web …), their
  responsibilities and boundaries
- `## Key Flows` — the main data/control flows (e.g. session-log → ingest → doc; the Rebuild
  job lifecycle; SSE updates)

### Prompts (`src/domain/architecture-prompt.ts`, new — parallel to product-doc-prompt)

- `buildArchMapPrompt(label, code)` — "You are a software architect. From this source chunk
  extract: modules/layers & responsibilities, boundary types/interfaces, libraries/runtime,
  and the data/control flows this code participates in." (Describes code structure — the
  inverse of the product-doc map, which forbids implementation.) English intermediate output.
- `buildArchMergePrompt(summaries)` — lossless merge of architectural summaries (for big
  repos), by module/concern.
- `buildArchDocPrompt(summary, ctx)` — synthesize the doc in the spine above; ground in the
  scan, mark uncertainty; takes README / manifest / decisions as context (the "why").

### Server (`src/server/session.ts`, `app.ts`)

- `architecturePath = .throughline/architecture.md` (own file IO like mockup/decisions — not
  SpecStore, so "absent" reads as '' → the view shows a placeholder).
- `readArchitecture(): Promise<string>` ('' if none).
- `rebuildArchitecture(): Promise<void>` — `buildArchFromCode` (map→reduce over
  `collectProjectFiles`, reusing `pool`/`chunkByBudget`/budgets) then write; keep the previous
  doc on empty/failure.
- **Update model:** generated/updated **only via the Rebuild job** — no continuous background
  ingest (cheaper, simpler). The product-doc background scribe does not touch it.
- `JobKind` gains `'architecture'`; `runJob` dispatches it to `rebuildArchitecture()`.
- `GET /api/architecture` → `{ md }`.

### Client (`api.ts`, `ViewRail.tsx`, `MainView.tsx`, `useJobs.ts`, `icons.tsx`)

- `fetchArchitecture(): Promise<string>`; `JobKind` includes `'architecture'`.
- New rail view `'architecture'` (label "Architecture", new icon).
- MainView renders the markdown (same ReactMarkdown as the doc). `REBUILD_KIND` gains
  `architecture: 'architecture'` so the Rebuild button works there (confirm modal copy added).
  Fetch on view-open and refetch on `job-updated{architecture,done}` (the `doneCounts` pattern,
  like mockup). Empty → "Press Rebuild to generate the architecture overview…" placeholder.
- `useJobs`: `doneCounts` and the toast text maps gain `architecture` ("Architecture rebuilt"
  / "Architecture rebuild failed").

### Testing

- `architecture-prompt.test.ts`: map/merge/doc prompts carry the architect framing, the
  English spine, and the language rule.
- `session.test.ts`: `rebuildArchitecture` writes a code-grounded doc (map→reduce, fake
  runner); `startJob('architecture')` dispatches to it.
- `app.test.ts`: `GET /api/architecture` returns `{ md }`.
- Browser (headless): the Architecture view renders, Rebuild generates + toasts, content shows.

## Cost note

An Architecture Rebuild is a full-codebase map→reduce — as heavy as the product-doc Rebuild —
but **manual** (the Rebuild button), so it is fully user-controlled.

## Out of scope / YAGNI

- Codebase map ("what lives where"), extension/"where to add X" guide, module diagram.
- Continuous background regeneration; editing the doc by hand.
