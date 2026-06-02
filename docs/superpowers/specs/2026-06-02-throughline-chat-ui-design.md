# Throughline — Chat UI + Persistent Conversation (SP-C) Design Spec

- **Status:** Draft (approved in brainstorming)
- **Date:** 2026-06-02
- **Context:** The raw embedded terminal (SP-B) was not the UX the user wanted. SP-C replaces the left pane with a **Claude/Gemini-style chat UI** whose engine is the user's **own local Claude Code** (Agent SDK), and persists the conversation durably. See memory `throughline-core-model`, `verify-dev-ui-in-browser`.

---

## 1. Overview

The left pane becomes a clean **chat UI** (Claude-style, light grayscale). The user types; their **own Claude Code** (driven via the Agent SDK in the project cwd) answers, streaming markdown + tool-activity chips, and edits code as part of answering. The conversation is **persisted to disk** so everything survives restart and future features can build on a durable record. The sync agent now reads the hosted conversation (+ `git diff`) to keep `spec.md`/flow live. The right pane (doc / flow / preview) is unchanged.

This is the settled model: **Throughline provides the chat front-end; the AI is the user's Claude Code** (not a separate AI). The raw terminal (SP-B) and the JSONL activity reader (SP-A) are removed.

---

## 2. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Left pane | Claude-style chat UI (style A), **light grayscale only** (white/grey/black) |
| Chat engine | The user's local Claude Code via Agent SDK (`converse`); code edits happen as it answers |
| Response rendering | Full-width markdown (lists, inline code, code blocks + copy), `✦ CLAUDE` label, streaming "작성 중…", tool actions as grey chips (`🔧 Edit src/Login.tsx ✓`) |
| Conversation persistence | **Keep all**, append-only `.throughline/conversation.jsonl`, loaded on startup |
| Restart behavior | **Everything persists** — on close & reopen, documents and conversation are intact |
| Catch-up on a new session | No separate feature — the chat's Claude Code (in cwd) can read the persisted `spec.md` + conversation log + code on request |
| Sync source | The hosted conversation (from the store) + `git diff` → reuse `buildSyncPrompt` + `applySpecUpdate` |
| Removed | SP-B terminal (xterm/node-pty/ws); SP-A activity reader (JSONL) |

---

## 3. Architecture

### Frontend
- **`ChatPane.tsx`** (replaces `Terminal.tsx`): light-grayscale Claude-style chat. Renders the transcript — user turns as right-aligned grey boxes; assistant turns as `✦ CLAUDE` + `react-markdown` (code blocks get a copy affordance) interleaved with grey **tool chips**; a streaming indicator while the assistant is mid-turn; a bottom composer (rounded input + dark send button). Sends via `sendChat` and renders streamed `text`/`tool` events.
- `api.ts`: `sendChat(message, onEvent)` — POST `/api/chat`, read the streamed body, dispatch `{type:'text', text}` / `{type:'tool', name, target}` / `{type:'done'}`.

### Backend
- **`ClaudeCodeRunner.converse` extended**: today it streams only assistant **text** via `onToken`. Change its callback to an `onEvent` that emits both text deltas and **tool-use** events (`{type:'tool', name, target}` derived from `tool_use` blocks — e.g. name `Edit`, target the file path/first arg). The Agent SDK already yields these structured blocks; we surface them.
- **`ConversationStore`** (`src/server/conversation-store.ts`): append-only JSONL at `<cwd>/.throughline/conversation.jsonl`. `append(msg)`, `load(): Message[]` (tolerant parse, skip bad lines), creating `.throughline/` if missing. Keep-all (no trimming). This is the durable source of truth for the conversation.
- **`POST /api/chat`** (re-added, streaming): body `{message}`. Append the user message to the store + in-memory transcript, run `runner.converse(transcript, onEvent)` streaming `text`/`tool` to the client, append the final assistant message to the store + transcript, then schedule a debounced sync.
- **`GET /api/transcript`** (re-added): returns the loaded transcript so the chat restores history on load.
- **Session reshape**: holds the transcript (seeded from `ConversationStore.load()` at construction), the `ConversationStore`, `runner`, `store` (spec), `broadcaster`, `debouncer`. `sendUserMessage` (above) + a debounced `sync()` that runs `runner.complete(buildSyncPrompt(currentSpec, transcriptText, gitDiff))` → `applySpecUpdate` → broadcast `spec-updated`. A small `git diff HEAD` helper (bounded) provides the code-change signal (reused idea from SP-A, without the JSONL reader).

### Persistence guarantee (restart)
On reopen the server loads `ConversationStore` → chat history + transcript restored; `spec.md` is already a file → doc restored; the flow view re-derives from the persisted spec; preview URL + split width are in `localStorage`. Net: **close and reopen leaves documents and conversation intact.** `.throughline/` is gitignored (local state).

### Catch-up on a new session (no separate feature)
Because `converse` runs the user's Claude Code with `cwd` = the project, the AI can `Read` `spec.md`, `.throughline/conversation.jsonl`, and the code on request. So in a fresh chat the user can simply type "read spec.md and the past conversation and catch up," and it works. The only design obligation is that these artifacts are present in cwd and AI-readable — which they are.

### Removed
- `Terminal.tsx`, `terminal-session.ts`, `terminal-ws.ts`, `node-pty-factory.ts`, the `/ws/terminal` route + server WS wiring; deps `node-pty`, `@hono/node-ws`, `@xterm/xterm`, `@xterm/addon-fit`; the `scripts/fix-node-pty.mjs` postinstall + `.npmrc`; the `/ws` dev proxy.
- `activity-reader.ts`, `transcript.ts`, `sync-engine.ts`'s ActivityReader dependency (the sync now uses the hosted transcript). `scribe-engine.ts`/`scribe`/`buildScribePrompt` may be deleted if fully unused after this change (the plan decides).
- **Reused:** `apply-spec-update.ts`, `sync-prompt.ts` (`buildSyncPrompt`), `spec-doc`/`spec-structure`/`spec-diff`, `SpecStore`, `Broadcaster`, `Debouncer`, `ClaudeCodeRunner` (converse + complete), the doc/flow/preview views, `ViewToolbar`/`ResizableDivider`/`RightPane`, the multi-view layout.

### Data flow
type → `/api/chat` → append user msg (store + transcript) → `runner.converse` streams text+tool → ChatPane renders + append assistant msg (store + transcript) → debounced `sync()` (transcript + `git diff` → `buildSyncPrompt` → `applySpecUpdate`) → `spec-updated` SSE → doc/flow live; preview shows the dev server.

---

## 4. Error handling

- **SDK error/timeout mid-turn** → emit an error event; ChatPane shows an error bubble with a retry; the partial assistant text (if any) is kept; the transcript/store stay consistent (only append a completed assistant message).
- **Sync failure/invalid output** → keep the last good `spec.md` (`applySpecUpdate` rejects without writing).
- **ConversationStore unreadable line** → skip it on load; never crash.
- **Empty input** → ignored. **Code-block copy failure** → silently ignored.
- **Not a git repo** → sync proceeds from the conversation alone (empty diff).

---

## 5. Testing

- **Unit (TDD):** `ConversationStore` append/load round-trip + bad-line tolerance (temp dir); `converse` tool-event emission (feed fake SDK messages with `tool_use` blocks → assert `{type:'tool', name, target}` emitted); `Session.sync` (fake runner + temp store) reuses the SP-A sync tests' shape.
- **Integration (TDD, fake runner):** `POST /api/chat` streams `text`/`tool`/`done` and appends to the store; `GET /api/transcript` returns the persisted transcript.
- **Browser smoke (Playwright, headless):** load the dev UI, send a message, assert a streamed assistant bubble renders and a tool chip appears (with a fake or real runner), and that **reloading restores the conversation** — actually loaded in a browser (per `verify-dev-ui-in-browser`). The real-Claude-Code single-turn smoke is controller-run.

---

## 6. Scope & build order

One spec. **Backend first:** `ConversationStore` → `converse` tool events → `Session` reshape (transcript seed + sendUserMessage + debounced sync via `buildSyncPrompt`) → re-add `POST /api/chat` (stream) + `GET /api/transcript`. **Then frontend:** `ChatPane` (grayscale, markdown, tool chips, streaming) replacing `Terminal`. **Then cleanup:** remove the terminal stack + deps + the activity reader.

**Out of scope (later):** multi-CLI engines; conversation search/branching; retention trimming knob; preview reverse-proxy; precise per-line highlight; the autonomous-agent direction.

---

## 7. Known couplings & risks

- **Agent SDK message shape for tool_use** — verify the `tool_use` block fields (`name`, `input`) against the installed `@anthropic-ai/claude-agent-sdk`, same discipline as before.
- **Re-introducing a Throughline-hosted conversation** — this is intentional and now matches the user's confirmed model (chat front-end over their Claude Code); it is not a regression to a "separate AI."
- **Removing node-pty/@hono/node-ws/xterm** simplifies the dependency surface and removes the native-module install step.
