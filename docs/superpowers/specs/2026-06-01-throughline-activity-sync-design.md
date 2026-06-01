# Throughline — Activity-Based Sync Agent (SP-A) Design Spec

- **Status:** Draft (approved in brainstorming, pending written-spec review)
- **Date:** 2026-06-01
- **Context:** First sub-project of the corrected product model (see memory `throughline-core-model`). Throughline is an **enhanced terminal**: the user codes in their OWN terminal with their OWN CLI agent (Claude Code); Throughline observes that work and keeps living docs + a live preview. This spec builds the **observation → living spec** half. The embedded terminal mirror (SP-B) and the autonomous-agent direction are out of scope.

---

## 1. Overview

The user works as usual in their own terminal, driving their own Claude Code. Throughline runs as the local browser app and **watches the real activity** — the Claude Code session transcript (`~/.claude/projects/.../*.jsonl`) and the repo's `git diff` — then keeps `spec.md` (and therefore the flow view) **live**, with no Throughline-hosted conversation. The right pane's document/flow/preview views (already built) reflect reality as the user codes.

This corrects the prior model, where Throughline hosted its own chat/AI (`converse`). That path is retired here.

---

## 2. The corrected model (recap)

- **Left pane = read-only live transcript viewer** rendered from the user's Claude Code JSONL — Throughline mirrors the user's real terminal activity (interactive PTY embedding is the later SP-B). No AI is hosted here.
- **Background sync agent** watches the JSONL + `git diff` and keeps `spec.md`/flow current. Its input is the user's *real* work, not a Throughline conversation.
- **Right pane = doc / flow / live preview** (already built; reused unchanged).

---

## 3. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Who codes | The user, in their own terminal (their own Claude Code) |
| Throughline's role | Observe + keep living docs + show preview (no hosted AI chat) |
| Sync signal | Claude Code transcript JSONL + `git diff` (NOT ANSI terminal scraping) |
| Sync trigger | Debounced-on-activity: ~10s of quiet after JSONL/code change → one sync |
| Left pane (this SP) | Read-only transcript viewer (interactive PTY is SP-B) |

---

## 4. Architecture

### Components

1. **Activity Reader** (`src/core/activity-reader.ts`) — pure-ish reader over the user's real work.
   - **Transcript:** locate the project's Claude Code dir at `~/.claude/projects/<encoded-cwd>/`, where `<encoded-cwd>` is the cwd with path separators (and other non-alphanumerics) replaced by `-` (e.g. `/Users/u/Developer/Thorughline` → `-Users-u-Developer-Thorughline`). Pick the most-recently-modified `*.jsonl` as the active session; **tail** new lines since the last synced byte offset. Parse each JSONL entry into `{role, text}` for user/assistant messages, skipping tool-call noise (optionally summarizing tool actions in one line). The JSONL is Claude Code's internal format — a known coupling; verify against the installed Claude Code version (like the Agent SDK coupling), and degrade gracefully if a line doesn't parse.
   - **Code:** `git diff HEAD` (uncommitted working-tree changes), bounded/truncated to a token budget. If not a git repo, skip the diff (transcript-only sync).
   - **State:** returns a `newState` capturing `{ sessionFile, byteOffset }` so the next read sees only new transcript lines; the orchestrator persists it in memory.
   - Returns `{ transcriptText, gitDiff, hasNew, newState }`. `hasNew=false` when neither transcript nor diff changed since last sync.

2. **Sync prompt** (`src/domain/sync-prompt.ts`) — `buildSyncPrompt(currentSpecMd, transcriptExcerpt, gitDiff)`: instructs the agent to reconcile `spec.md` with reality — mark implemented features `- [x]`, add newly-built behavior, **preserve existing `<!-- id: ... -->` anchors**, move resolved items out of `🟡 미정`, keep the hybrid spine. Output the full updated markdown only.

3. **`applySpecUpdate`** (`src/core/apply-spec-update.ts`) — extracted shared helper: given `(store, rawMd, previousMd)` → `validateSpec`; if invalid return `{ ok:false, errors }`; else `ensureFeatureIds` → `changedLineNumbers(previousMd, md)` → `store.write(md)` → return `{ ok:true, result:{md, changedLines} }`. **Both** the (retiring) scribe path and the new sync engine use it (DRY). `ScribeEngine` is refactored to call it so its tests stay green.

4. **Sync Engine** (`src/core/sync-engine.ts`) — orchestrates the loop. `start()` watches the JSONL dir + the repo (ignoring `.git`, `node_modules`, `dist`, `spec.md`, `docs/`, `.superpowers/`) → debounce (~10s) → `runSync()`. `runSync()`: read activity; if `!hasNew` return; `raw = runner.complete(buildSyncPrompt(spec, transcript, diff))`; `applySpecUpdate`; on success emit `'updated'` (→ broadcast `spec-updated`) and advance state; on invalid emit `'rejected'` and keep the file. `stop()` unwatches. Reuses `complete()` (the user's Claude Code), `validateSpec`, `ensureFeatureIds`, `changedLineNumbers`, the broadcaster.

5. **Transcript viewer (left pane)** — the server tails the active JSONL and broadcasts parsed entries; the frontend renders them **read-only**.
   - Backend: a `GET /api/transcript` returns the current parsed transcript; SSE `/api/events` also emits `transcript-updated` (new entries) so the view stays live.
   - Frontend: `TranscriptView.tsx` replaces `ChatPane` — a read-only, auto-scrolling list of user/assistant turns. No composer.

### Workspace wiring (refactor of `Session`)
`Session` is reframed as the workspace: it holds the `SpecStore`, the `SyncEngine`, and the `Broadcaster`; it starts/stops the sync engine and exposes `readSpec()`, `readTranscript()`, `generateFlow()` (kept). **Removed:** `sendUserMessage`/`converse`, the conversation transcript, and the debounced *scribe* loop.

### Data flow
User's Claude Code works → JSONL grows / code changes → watcher debounces (~10s quiet) → SyncEngine reads activity (transcript delta + `git diff`) → `complete(syncPrompt)` → `applySpecUpdate` → `spec-updated` over SSE → doc view updates, flow auto-refreshes (existing), preview shows the user's dev server (existing).

---

## 5. What is removed / changed from the current build

- **Removed:** `POST /api/chat`, `Session.sendUserMessage` + the `converse` flow, `ChatPane` (composer). The conversation→spec scribe is retired (no Throughline conversation in model B).
- **Refactored:** `ScribeEngine`'s tail extracted into `applySpecUpdate`; `Session` → workspace wiring around `SyncEngine`.
- **Reused unchanged:** `spec-doc`/`spec-structure`/`spec-diff`, `SpecStore` (+ watch), `Broadcaster`, `ClaudeCodeRunner` (now used by sync, not chat), `/api/events`, `/api/flow`, `SpecPane`/`FlowView`/`PreviewView`, `ViewToolbar`/`ResizableDivider`/`RightPane`, the multi-view layout.
- **Note:** `ClaudeCodeRunner.converse` may remain in the codebase unused for now (harmless) or be removed; the plan will decide. `scribe`/`buildScribePrompt` similarly become unused once the conversation path is gone.

---

## 6. Error handling

- **No JSONL yet** (no Claude Code session in this project) → transcript viewer shows an empty/onboarding state; sync proceeds from `git diff` alone (or no-ops until there's activity).
- **Sync failure/timeout** (`complete` throws) → keep the last good `spec.md`, emit `'rejected'`, retry on the next activity burst. `runSync` never throws.
- **Malformed agent output** (fails `validateSpec`) → reject; file untouched.
- **Not a git repo** → transcript-only sync (skip diff).
- **JSONL parse error on a line** → skip that line, continue (don't crash the reader).
- **Debounce/coalesce** → rapid activity collapses to one sync.

---

## 7. Testing

- **Unit (TDD):** Activity Reader — encoded-path computation, JSONL parsing (fixtures with user/assistant/tool lines), tail-by-offset, `hasNew` logic; `buildSyncPrompt`; `applySpecUpdate` (valid → write+ids+changedLines; invalid → no write).
- **Integration (TDD, fake runner + temp dirs):** Sync Engine `runSync` — given a fixture transcript + a temp git repo diff, produces an updated `spec.md` and emits `updated`; invalid output → `rejected`, file untouched; `!hasNew` → no call.
- **Manual smoke:** run the app; in a separate terminal, drive Claude Code on a toy project (make an edit / have a short coding exchange); confirm the doc view's spec updates live within ~10s, the flow refreshes, and the transcript viewer mirrors the session.

---

## 8. Scope & build order

One spec. **Backend first:** `applySpecUpdate` (refactor) → Activity Reader → `sync-prompt` → Sync Engine → workspace/Session refactor + `/api/transcript` + SSE `transcript-updated` + remove `/api/chat`. **Then frontend:** `TranscriptView` replaces `ChatPane`, wire into `App`.

**Out of scope (later sub-projects):** SP-B embedded interactive terminal (PTY mirror); multi-CLI transcript formats (Codex/Gemini); the autonomous-agent ("agents do the coding") direction; reverse-proxy preview; precise per-line highlight.

---

## 9. Known couplings & risks

- **Claude Code JSONL format** is internal and may change across versions — isolate all of it in the Activity Reader; verify against the installed version; degrade gracefully. This is the main risk; the rest reuses proven engine pieces.
- **Token cost** is bounded by the debounce (sync only at quiet points) and by truncating the transcript delta + `git diff` to a budget.
- **Two writers to `spec.md`?** No — in model B only the sync engine writes it (the conversation scribe is gone), so there's no writer contention.
