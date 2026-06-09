# Architecture freshness — stale-section detection

**Date:** 2026-06-09
**Branch:** `feat/architecture-freshness`

## Problem

The Architecture doc is generated on demand (Rebuild) and now cites the source files each
section came from. But a reader can't tell whether the doc is still current: code changes
after a Rebuild, and the doc silently goes stale. This completes the trust story started by
source grounding — "I can verify it" → "and I know when it's outdated."

## Goal

The Architecture view shows, per section, whether it **may be stale** — i.e., whether any of
that section's cited files changed since the doc was last built — via a top banner naming the
stale sections. Graceful: no git or never-built → no banner.

Scope: Architecture only. (Click-to-open, product-doc grounding, git-history mode stay phase 2.)

## Approach (chosen): build-commit + per-section staleness via cited files

On Rebuild, record the HEAD commit. On read, compute the files changed since that commit
(`git diff --name-only <commit>`); a section is stale if its cited files intersect that set.
Leverages the citations already in the doc and the existing git-exec pattern.

Rejected: overall-only staleness (doesn't say *which* sections; ignores the citations) and
per-section content hashing (heavier; `git diff --name-only` is a sufficient proxy).

## Design

### Pure function (`src/domain/source-citations.ts`, unit-tested)

`staleSections(md, changedFiles): string[]` — parse the doc into `##` sections, read each
section's `**Sources:**` paths, return the headings whose cited files intersect
`changedFiles`. A section with no Sources is never stale.

### Server (`src/server/session.ts`)

- Rebuild writes `.throughline/architecture-meta.json` = `{ commit, builtAt }` (current HEAD)
  whenever it writes the doc.
- `readArchitecture(): Promise<string>` stays unchanged (md only — minimal churn).
- `architectureFreshness(): Promise<ArchFreshness | null>` (new): reads meta + md + git;
  returns `{ commit, stale: string[] }`, or `null` when never built / no commit / no git.
- Injectable git helpers (like `gitDiff`): `gitHead(cwd)` = `git rev-parse HEAD`,
  `gitChangedSince(cwd, commit)` = `git diff --name-only <commit>` → paths. Both swallow errors
  (non-repo → `''` / `[]`).
- `ArchFreshness = { commit: string; stale: string[] }` in `types.ts`.

### API / client

- `GET /api/architecture` → `{ md, freshness }` (reads + freshness together).
- `fetchArchitecture()` → `{ md, freshness }`.
- MainView Architecture view: a `.tl-stale-banner` above the markdown when
  `freshness.stale.length > 0`: "⚠ Built against `abc123` — N section(s) may be stale (code
  changed since): Modules, Key Flows. Rebuild to refresh." Refetch on rebuild (doneCounts) →
  banner clears (commit advances). `.tl-stale-banner` amber style in styles.css.

## Testing

- `source-citations.test.ts`: `staleSections` — overlap → flagged, no overlap → none, no
  Sources → never stale, multiple stale sections.
- `session.test.ts`: rebuild writes meta with the head commit (injected `gitHead`);
  `architectureFreshness` flags a section when its cited file is in the changed set (injected
  `gitChangedSince`); returns null when never built.
- `app.test.ts`: `GET /api/architecture` returns `{ md, freshness }`.
- Browser (headless): after a build, a changed cited file surfaces the banner naming the
  stale section.

## Out of scope / phase 2

- Click-to-open citations; product-doc grounding/freshness; git-history mode.
