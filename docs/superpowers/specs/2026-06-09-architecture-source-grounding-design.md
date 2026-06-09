# Architecture source grounding — verifiable per-section citations

**Date:** 2026-06-09
**Branch:** `feat/architecture-source-grounding`

## Problem

The Architecture doc is LLM-derived from a code scan, so a professional developer can't
verify it without re-reading the whole codebase. Auto-generated docs aren't trusted unless
each claim points to its source. This is the decisive step from a vibe-coding tool toward a
professional one.

## Goal

Each section of the Architecture doc carries a **Sources** line listing the real source
files it came from, and **every cited path is guaranteed to exist in the repo** (hallucinated
paths are dropped). Surfaced inline in the existing Architecture markdown view.

Scope: **Architecture doc only** (the same mechanism can extend to the product doc later).
Freshness/drift tracking and click-to-open-in-editor are **out of scope** (phase 2).

## Approach (chosen): LLM-tagged + code-validated

Thread source-file tags through the existing map → merge → reduce pipeline, then validate the
final citations against the real file set — so the LLM's understanding of "which file
implements what" is used, but no hallucinated path can survive.

Rejected: deterministic attribution (keyword/embedding matching of section text to files) —
heavier and less accurate than what the LLM already does in reduce.

## Design (server-only; the markdown view renders citations as-is)

### Prompts (`src/domain/architecture-prompt.ts`)

- `buildArchMapPrompt(label, code, files)` — gains the chunk's exact `files` list; instructs
  the model to tag each extracted item with `[src: <one of these files>]`.
- `buildArchMergePrompt` — instructs preserving/unioning the `[src: …]` tags when merging.
- `buildArchDocPrompt(summary, ctx)` — instructs a `**Sources:** \`a.ts\`, \`b.ts\`` line at
  the end of each `##` section, citing **only** files from the provided list (`ctx.files`).
  Paths are backticked so they render as inline code.

### Validation (`src/domain/source-citations.ts`, new — pure, unit-tested)

`validateCitations(md, realPaths): string` — for each `**Sources:**` line, keep only
backticked paths present in `realPaths`; drop the line entirely if none remain; leave all
other content untouched. Guarantees every shown citation is a real repo file. Fail-safe: an
unvalidatable (e.g. un-backticked) sources line drops rather than showing unverified paths.

### Server (`src/server/session.ts`)

`buildArchFromCode`: pass `chunk.files` to the map prompt; add `files: files.map(f => f.path)`
to the doc `ArchContext`; run `validateCitations(doc, realPaths)` on the final doc before
writing. `ArchContext` gains `files?: string[]`.

### Client

None. The Architecture view already renders the markdown; the Sources lines render as bold +
inline-code paths.

## Testing

- `source-citations.test.ts`: keeps real paths, drops hallucinated, removes all-invalid
  Sources lines, preserves the rest of the doc.
- `architecture-prompt.test.ts`: map prompt lists the files + the `[src:` tag instruction;
  doc prompt asks for `**Sources:**` lines citing only the provided files.
- `session.test.ts`: an architecture rebuild whose doc cites a real + a fake file keeps only
  the real one (end-to-end validation).
- Browser (headless): the Architecture view shows the validated Sources line.

## Out of scope / phase 2

- Freshness/drift (per-section commit tracking + stale warnings).
- Click-a-path to open it in the editor.
- Source grounding for the product doc (same mechanism, later).
