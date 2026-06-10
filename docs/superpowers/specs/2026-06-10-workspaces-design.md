# Workspaces (Phase 1) — partition work into named buckets

**Date:** 2026-06-10
**Branch:** `feat/workspaces`

## Problem

As a product grows, one giant doc becomes unwieldy. Users want to split their work by their
own criteria. Model (user-decided): **time/active-scoped workspaces** — you work in the
default workspace by default; create another and select it, and the work you do *while it is
active* accrues to that workspace (its own doc/decisions/history/…). A future "unified view"
merges workspaces (with AI-chat conflict resolution) — **Phase 2, out of scope here**.

This sidesteps the path/feature scoping problem: each workspace just captures the activity
that happened while it was active, so doc/decisions/history partition naturally by time.

## Phase 1 scope (this build)

- Workspace **registry** + per-workspace artifact dirs `.throughline/ws/<id>/`; existing root
  artifacts migrate into `ws/default/` once. The **default** workspace = today's behavior.
- **Active-capture**: only the active workspace ingests new session activity. Selecting a
  workspace makes it capture **from now** (its checkpoint advances to the current log offset),
  so activity while another workspace was active is not retroactively pulled in.
- Create / select / list workspaces. Client **switcher** in the top bar.
- **Phase 1 rule:** the deep code Rebuild (whole-repo re-derive) only makes sense for the
  "everything" default workspace. Non-default workspaces build **purely from activity**, so
  their Rebuild/Tidy controls are hidden. (Touched-files-scoped Rebuild = **Phase 1.5**.)

## Design

### Storage

- `.throughline/workspaces.json` = `{ active: id, workspaces: [{ id, name }] }`.
- Per workspace: `.throughline/ws/<id>/` holds prd.md, decisions*.json, mockup*, architecture*,
  *-meta.json, ingest-state.json. On first run: create `default`; if legacy root artifacts
  exist, move them into `ws/default/`.

### Session changes (small, backward-compatible)

- `SessionDeps.artifactsDir?` (default `join(cwd, '.throughline')`) — all internal artifact
  paths derive from it; the manager passes `ws/<id>/`. (store + ingest are already injected.)
- `SessionDeps.broadcaster?` — inject a shared broadcaster (default: own). So all workspace
  Sessions share one broadcaster and SSE survives switches.
- `init({ watch = true })` — when false, seed/catch-up but don't self-watch (the manager
  drives). The watch callback body is extracted to `notifyActivity()`.
- `startFresh()` — set checkpoint to the current log offsets and persist (capture-from-now on
  activation).

### WorkspaceManager (`src/server/workspace-manager.ts`, new)

- Owns the shared `broadcaster`, `reader`, `runner`, `selfReader`, and the registry.
- Builds a `Session` per workspace (shared broadcaster/reader/runner, `artifactsDir = ws/<id>`,
  `init({ watch: false })`). Sets up **one** watcher on `reader` → `active().notifyActivity()`.
- `list()`, `active(): Session`, `activeInfo()` (id/name/isDefault), `create(name)`,
  `select(id)` — on select: persist active, `active().startFresh()`, and re-emit the new
  workspace's state (broadcast spec-updated + decisions-updated) so clients update over SSE.

### API (`app.ts`) — takes the manager

- New: `GET /api/workspaces` → `{ active, workspaces: [{id,name,isDefault}] }`;
  `POST /api/workspaces {name}` → create; `POST /api/workspaces/:id/select`.
- All existing endpoints operate on `manager.active()`. SSE uses `manager.broadcaster`.
- `server.ts` builds a `WorkspaceManager` instead of a single `Session`.

### Client

- A workspace switcher in the top row (name of active workspace + dropdown to switch + "New…").
- On select: `POST select` → re-fetch the fetch-based views (history/tokens/mockup/architecture/
  freshness); the doc/decisions auto-update via the shared SSE (the server re-emits on select).
- Hide Rebuild/Tidy when the active workspace is not the default (Phase 1 rule).

## Testing

- `workspace-manager.test.ts`: create/select/list; activity routes only to the active
  workspace (capture-from-now); switching re-emits state.
- `session.test.ts`: `artifactsDir` scoping; `init({watch:false})` doesn't self-watch;
  `notifyActivity`/`startFresh`.
- `app.test.ts`: workspace endpoints; existing endpoints hit the active workspace.
- Browser: create a workspace, switch, confirm isolated content + Rebuild hidden on non-default.

## Out of scope

- Phase 2 unified view + AI-chat conflict resolution.
- Phase 1.5 touched-files-scoped Rebuild for non-default workspaces.
