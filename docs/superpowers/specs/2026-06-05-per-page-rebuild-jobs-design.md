# Per-page Rebuild + background jobs + toasts

**Date:** 2026-06-05
**Branch:** `feat/per-page-rebuild-jobs`

## Problem

Today a single global **Rebuild** button sits in the top row on every page and always
rebuilds the *product doc* (`session.rebuild()`), regardless of which page you're on.
Two gaps:

1. It is not per-page — pressing it on Decisions or Mockup still only rebuilds the doc.
2. There is no completion signal. The server work already runs to completion detached
   from the request, but the client only shows a coarse global "Working…" indicator and
   gives no per-job feedback. After a browser reload, an in-flight rebuild is invisible.

## Goal

- The Rebuild action is **scoped to the current page** and only exists on the three pages
  that have a generated artifact: **Document**, **Decisions**, **Mockup**.
- Pressing it kicks off a **background job** that runs to completion even if the user
  leaves the page or reloads the browser — as long as the local server stays up.
- When a job finishes, show a **toast** (for every background job kind).

History and Tokens are derived live from logs; they have no heavy artifact to rebuild and
keep their existing refresh-on-open behavior (no Rebuild button).

## Approach (chosen)

**Server-side job registry + SSE job events.** The server tracks in-flight jobs and runs
them detached from the HTTP request; start/finish are broadcast over SSE. The client lifts
job + toast state to the App level so it survives view changes, and replays running jobs on
(re)connect so a browser reload restores in-flight state.

Rejected alternatives:
- *Client-only fire-and-forget* — loses in-flight state on browser reload; no cross-tab
  awareness.
- *Disk-persisted jobs* — would survive a server restart, which the requirement explicitly
  does not need ("as long as the local server is not terminated"). YAGNI.

## Design

### Job kinds

`JobKind = 'doc' | 'decisions' | 'mockup'`.

### Server — `Session` (`src/server/session.ts`)

- `private jobs = new Map<JobKind, Promise<void>>()` — in-flight jobs.
- `startJob(kind): boolean` — idempotent. If a job of this kind is already running, return
  `false` and do nothing. Otherwise broadcast `job-updated { kind, status: 'running' }`,
  start the work **detached** (not awaited by the caller), and on settle broadcast
  `job-updated { kind, status: 'done' | 'error' }`, then delete the entry. The underlying
  work still goes through `runBusy`, so the existing global "Working…" indicator keeps
  working.
- `runningJobs(): JobKind[]` — current in-flight kinds (for a freshly-connected client).
- `rebuildDecisions(): Promise<void>` (new) — full rebuild of the decisions ledger: clear
  the ledger + state, then re-extract from recent turns by looping the existing
  `extendDecisions` until it stops advancing (bounded guard). Mirrors the doc Rebuild's
  "discard and rebuild" semantics. `extendDecisions` already broadcasts `decisions-updated`.

Job dispatch maps `doc → rebuild()`, `decisions → rebuildDecisions()`,
`mockup → generateMockup()`.

### Server — API (`src/server/app.ts`)

- `POST /api/jobs/:kind` → `{ started: boolean, running: JobKind[] }`. Validates `kind`.
  Absorbs the old `POST /api/rebuild` (= `doc`) and `POST /api/mockup` (= `mockup`).
- `/api/events` initial frame additionally emits `event: 'jobs'` with `{ running }`, and a
  new `job-updated` delta event flows through the existing broadcaster.
- `GET /api/mockup` (read) stays unchanged.

### Client

- `src/web/api.ts`: `startJob(kind)` → POST; `subscribeJobs(onInitial, onUpdate)` over SSE
  (`jobs` initial list + `job-updated` deltas).
- App-level `useJobs()` hook (in `App.tsx` or a small `useJobs.ts`): exposes
  `running: Set<JobKind>` and `start(kind)`, and raises a toast on `done`/`error`. Living at
  App level is what makes busy state survive view changes and browser reload.
- `Toaster` component rendered at App level (outside the per-view region), ~4s auto-dismiss.
  Text follows the English-UI policy: `Document rebuilt`, `Decisions rebuilt`,
  `Mockup updated`, and `… failed` on error.
- Rebuild button: rendered only on `doc` and `decisions` (confirm modal kept, parameterized
  by kind — both are destructive replacements). Disabled/labelled from `running.has(kind)`.
  **Mockup keeps its own Generate/Update button**, which becomes `start('mockup')`; on
  `job-updated { mockup, done }` the view re-fetches the mockup HTML via `fetchMockup()`.
  History/Tokens show no Rebuild button.

### Data flow

Content refreshes ride existing SSE events, not `job-updated`:
- doc → `spec-updated` (already live)
- decisions → `decisions-updated` (already)
- mockup → re-fetch on `job-updated { mockup, done }`

`job-updated` is used only for per-job busy state and toasts.

## Testing

- `session.test.ts`: `startJob` idempotency; `job-updated` running/done/error broadcasts;
  `runningJobs()`; `rebuildDecisions()` clears then re-extracts (fake-runner).
- `app.test.ts`: `POST /api/jobs/:kind` returns `{ started, running }`; invalid kind
  rejected; `jobs` initial SSE frame.

## Out of scope

- Surviving a server restart (disk-persisted jobs).
- Job cancellation / queueing beyond per-kind idempotency.
- Rebuild on History/Tokens.
