# Throughline — Design Spec

- **Status:** Draft (approved in brainstorming, pending written-spec review)
- **Date:** 2026-05-31
- **Working name:** Throughline
- **Slogan:** TBD (deferred — to be defined in a dedicated naming pass once product voice is set)

---

## 1. Overview

Throughline is a **local, open-source planning tool** for people building products with AI. You hold a planning conversation in the browser with *your own* CLI AI (Claude Code), and a `spec.md` file on the right **writes itself in real time** — without you ever telling it to "document this." As the conversation evolves, the document grows, reorganizes, and surfaces what is still undecided.

The defining promise: **the spec never goes stale.** It is a living source of truth that stays in sync with your thinking, and (on the roadmap) with your code.

### Core insight: the living document *is* a file on disk
The right-hand document is literally a `spec.md` markdown file in the project directory. This is deliberate:
- It satisfies the "local + open source" constraint — it is just a file, git-friendly, diffable.
- It is the **single source of truth**. Later, the Build phase's Claude Code reads this same file to implement — so a single throughline runs from idea → spec → code.

---

## 2. Target user & positioning

- **Who:** Indie hackers, founders, and engineers who build products *with* AI coding agents.
- **Positioning:** "The spec that never goes stale." Counter to dead PRDs / stale Notion docs that drift the moment coding starts.
- **Hot keywords it rides:** spec-driven development, living spec, context engineering, agentic / BYO-agent.
- **Economic model (the paperclip parallel):** Heavy LLM inference is paid by the user's *own* subscription (Claude Max, etc.) running locally. Throughline does not sell inference; it sells the **control plane** — orchestration, collaboration, sync, and history.

---

## 3. The 4-beat loop

1. **Converse** — Plan by talking to your Claude Code in the browser.
2. **Crystallize** — ★ *MVP hero.* The conversation condenses into a structured, living `spec.md`, unprompted. Undecided items surface as `🟡 미정`.
3. **Build** *(roadmap)* — Claude Code implements from `spec.md`; each feature lights up `진행중/완료`.
4. **Sync** *(roadmap)* — Code changes flow back into the doc; the spec stays current both directions.

**MVP delivers beats 1–2 fully.** Beats 3–4 are explicitly out of MVP scope (see §8).

---

## 4. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| MVP hero | Converse → Living spec (Crystallize) |
| Screen layout | **A. Split** — conversation (left) ｜ `spec.md` (right) |
| Document structure | **C. Hybrid** — fixed spine (`🎯 요약 · ✅ 핵심 기능 · 🟡 미정`) + emergent sections |
| CLI target | **Claude Code only** (adapter interface left open for future CLIs) |
| Source of truth | A single `spec.md` markdown file on disk |
| Business model | Open-core: free local single-player (OSS) / paid team cloud |

---

## 5. Architecture (MVP)

```
[Browser]                         [Local Node app]
  Left:  ChatPane  ──user msg──▶   Web server / session
         (streaming)               │
  Right: SpecPane                  ├─ Agent runner (Claude Code adapter)
         (live md render   ◀────┐  │     • converse(transcript) -> token stream
          + change highlight)   │  │     • scribe(specMd, transcript) -> new specMd
                                │  │       (runs via Agent SDK on the user's own
        ▲  spec-updated event   │  │        Claude Code creds — inference cost = 0)
        │  (SSE/WebSocket)      │  │
        │                       │  ├─ Scribe engine (debounced orchestration,
        │                       │  │    structure rules, diff/highlight, 미정 tracking)
        │                       │  │
        └── file watch ◀────────┴──┴─ Spec store ──▶ [ spec.md ] (disk, source of truth)
```

### Components (each an isolatable unit)

1. **CLI launcher** (`throughline`) — boots the local server and opens `localhost` in the browser. What it does: start/stop the app. Depends on: web server.
2. **Web server / session** — serves the UI, holds the per-project session (transcript + spec path), exposes the transport. Depends on: agent runner, scribe engine, spec store.
3. **Agent runner (Claude Code adapter)** — wraps the **Claude Agent SDK** to drive the user's local Claude Code with their existing auth. Two operations: `converse()` (streaming planning dialogue) and `scribe()` (one-shot spec update). Exposes an **adapter interface** so other CLIs can be added later; only the Claude Code implementation ships in MVP.
4. **Scribe engine** — owns *when* to update (debounced after an assistant turn settles) and *how* the doc is shaped (hybrid spine + emergent rules), computes the change set for highlighting, and maintains the `🟡 미정` list. Depends on: agent runner, spec store.
5. **Spec store** — reads/writes `spec.md`, watches the file for external edits, emits change events. The only component that touches disk for the spec. Depends on: filesystem.
6. **Frontend** — `ChatPane` (left, streaming conversation) + `SpecPane` (right, live markdown render with highlight-on-change). Depends on: transport.
7. **Transport** — SSE or WebSocket carrying two event types: `chat-token` and `spec-updated`.

### Data flow (one turn)
1. User sends a message → server → `agentRunner.converse()` streams tokens to `ChatPane`.
2. Assistant turn settles → after a short idle **debounce (~1.5s)**, scribe engine calls `agentRunner.scribe(currentSpecMd, recentTranscript)`.
3. Scribe validates the returned doc against structure rules; if valid, `specStore.write()` saves it.
4. Spec store's file watch fires → server emits `spec-updated` (with a line-level diff) → `SpecPane` re-renders and highlights changed lines.

### `spec.md` format
- **Front-matter:** `title`, `updated`.
- **Fixed spine (always present, may be empty/`미정`):**
  - `## 🎯 요약` — one-paragraph summary
  - `## ✅ 핵심 기능` — checkbox list; **each item carries a stable anchor** (e.g. `<!-- id: feat-auth -->`) so a future Build phase can map progress to it
  - `## 🟡 미정 / 열린 질문` — open questions & detected contradictions, maintained by the scribe
- **Emergent sections:** `## <topic>` blocks that appear as topics come up in conversation.

### Stack (default, to confirm in the implementation plan)
- Single Node process: **Next.js (App Router)** serving UI + route handlers, launched via `npx throughline`.
- Integration via the **Claude Agent SDK (TypeScript)** using the user's local Claude Code credentials.
- *Alternative considered:* Vite + minimal server (Hono/Express). Decide during planning; the component boundaries above are framework-agnostic.

---

## 6. Error handling

- **Claude Code missing / not authenticated** → onboarding screen with setup steps; no crash.
- **Agent error or timeout during scribe** → keep the last good `spec.md`, show a non-blocking toast, retry on next turn. **The spec file is never left in a corrupt state.**
- **Scribe returns malformed structure** → validate; reject the patch and keep the previous version (log for debugging).
- **External edits** (user edits `spec.md` in their own editor) → file watch picks them up; the scribe treats external edits as *authoritative input* and merges forward rather than overwriting.
- **Debounce / coalescing** → rapid turns coalesce into one scribe pass to avoid thrashing the file.

---

## 7. Testing strategy

- **Unit:** structure rules (given transcript + spec → expected sections / `미정` entries, using a *stubbed* agent runner), diff/highlight computation, `spec.md` parse↔serialize round-trip, adapter-interface contract against a mock agent.
- **Integration:** full Converse → debounce → scribe → file write → `spec-updated` event, with a deterministic stub agent runner.
- **Manual / smoke:** one real Claude Code session end-to-end.
- **Note:** scribe wording is LLM-generated and non-deterministic — tests cover the **plumbing and structure rules**, not the model's prose. Golden/eval-style tests for scribe quality can come later.

---

## 8. MVP scope (YAGNI)

**In:** split screen · conversation driving the user's Claude Code · live scribe → `spec.md` · hybrid structure · change highlighting · `미정` tracking · single-file persistence.

**Out (roadmap):** Build execution + progress lights · code→doc reverse sync · multiplayer / cloud · multi-CLI support.

---

## 9. Business model

| Tier | What | Role |
|---|---|---|
| **Free (OSS, forever)** | Local single-player Throughline | Adoption / virality engine; embodies the "local + open source" positioning |
| **Paid (team cloud, per-seat)** | Real-time co-planning (multiplayer) · cloud sync + **version history** (who decided what, when) · web access anywhere · org template library · *(Phase 2)* Build progress dashboard | Clear reason for teams to pay: collaboration, history, control plane |

- **Why it holds:** individuals are free → viral; teams pay for collaboration/history/control-plane value. Same shape as paperclip's "company without people = selling the control plane."
- **Secondary revenue (optional):** spec template / playbook marketplace (take rate), hosted background Build runners (Phase 2+).

---

## 10. Roadmap (post-MVP)

1. **Build** — Claude Code implements from `spec.md`; feature anchors light up `진행중/완료`.
2. **Sync** — code→doc reverse sync; the spec stays current both directions.
3. **Team cloud** — multiplayer, version history, web access (first paid tier).
4. **Multi-CLI** — Codex, Gemini CLI via the adapter interface.

---

## 11. Open questions (resolve in implementation plan)

- Scribe trigger timing — default: idle debounce ~1.5s after an assistant turn completes. (Alt: explicit "consolidate" button.)
- Full-rewrite vs patch of `spec.md` — default: scribe returns the full updated doc; we diff locally for highlighting (simpler, robust). Revisit for very large docs.
- App stack finalization (Next.js vs Vite + server).
- Chat-history persistence across restarts (session file format & location).
