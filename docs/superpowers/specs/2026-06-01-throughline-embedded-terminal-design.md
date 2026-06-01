# Throughline — Embedded Interactive Terminal (SP-B) Design Spec

- **Status:** Draft (approved in brainstorming, pending written-spec review)
- **Date:** 2026-06-01
- **Context:** Second sub-project of the corrected model (see memory `throughline-core-model`). SP-A made the left pane a *read-only* mirror of the user's real Claude Code activity. SP-B makes the left pane an **interactive terminal** so the user can run their shell — and `claude` — *inside* Throughline. "더 나은 터미널의 확장판."

---

## 1. Overview

The left pane becomes a real terminal: an `xterm.js` front end talking over a WebSocket to a `node-pty` shell spawned in the project cwd. The user runs their own `$SHELL` and launches `claude` (or `git`, anything) right there. The background sync agent is unchanged — it keeps watching the Claude Code transcript JSONL + `git diff` and updates `spec.md`/flow live. So "chatting in the screen" is satisfied by running the user's real Claude Code in the embedded terminal, and the observe-and-document loop keeps working.

This replaces SP-A's read-only `TranscriptView` (the conversation is now visible directly in the terminal when `claude` runs there).

---

## 2. Decisions locked in brainstorming

| Decision | Choice |
|---|---|
| Left pane | Interactive terminal (xterm.js + node-pty), replacing the read-only mirror |
| Terminal startup | Plain shell prompt at `$SHELL` in cwd (user runs `claude`/anything) — not auto-launch |
| Transport | WebSocket (`@hono/node-ws`) |
| PTY lifecycle | One PTY per server; survives browser reload (reattach + replay buffer); not killed on ws close |
| Sync agent | Unchanged — still reads JSONL + `git diff` (`ActivityReader`/`SyncEngine`) |
| Coding model | Still Model B — the user codes; Throughline hosts no AI of its own |

---

## 3. Verified constraint: node-pty on this machine

A feasibility check (this is the user's actual machine, Node v25.9.0 / ABI141) found:
- `node-pty@1.1.0` installs with working prebuilds for `darwin-arm64`.
- **The prebuilt `spawn-helper` ships without the executable bit** (`-rw-r--r--`), so `pty.fork` fails with `posix_spawnp failed`. After `chmod +x` on `node_modules/node-pty/prebuilds/*/spawn-helper`, a spawn smoke (`echo` in a real PTY) **works**.
- **Therefore the plan MUST include a `postinstall` step that sets the exec bit** on the spawn-helper(s). It is a no-op on Windows (conpty, no spawn-helper).

---

## 4. Architecture

```
[Browser: xterm.js + FitAddon]  ⟷  WebSocket /ws/terminal  ⟷  [node-pty: $SHELL in cwd]
    keypress → pty.write   |   pty output → term.write   |   resize → pty.resize
[Background SyncEngine] ← UNCHANGED: watches JSONL + git diff → updates spec.md/flow
```

### Components

**Backend**
- **`TerminalSession`** (`src/server/terminal-session.ts`) — wraps a PTY behind a small interface so the buffer/protocol logic is testable without a real PTY:
  - `interface Pty { write(d: string): void; resize(c: number, r: number): void; onData(cb): void; onExit(cb): void; kill(): void }`
  - `TerminalSession` holds the `Pty`, a **ring buffer** of recent output (≈64 KB) for reconnect replay, and fans `onData` out to subscribers. Methods: `write`, `resize`, `subscribe(cb) → unsub`, `snapshot()` (buffer), `kill()`, `onExit`.
  - A `spawnNodePty(shell, cwd)` factory creates the real `node-pty`-backed `Pty`; tests inject a fake `Pty`.
- **WebSocket route** `/ws/terminal` (via `@hono/node-ws` `upgradeWebSocket`): on open, lazily create-or-reuse the singleton `TerminalSession`, send the replay `snapshot()`, subscribe (pty→ws), and route ws messages: `{type:'input', data}` → `pty.write`, `{type:'resize', cols, rows}` → `pty.resize`. On ws close, unsubscribe but **keep the PTY alive**.
- **`postinstall`** (`scripts/fix-node-pty.mjs`) — chmod +x any `node-pty/prebuilds/*/spawn-helper`; no-op if absent.
- Deps: `node-pty`, `@hono/node-ws`.

**Frontend**
- **`Terminal.tsx`** (`src/web/Terminal.tsx`) — `@xterm/xterm` `Terminal` + `@xterm/addon-fit`; opens a `WebSocket` to `/ws/terminal`; `term.onData → ws {input}`; `ws message → term.write`; on mount/resize, `fit()` then send `{resize, cols, rows}`. Replaces `TranscriptView` as the left pane.
- Deps: `@xterm/xterm`, `@xterm/addon-fit` (+ import `@xterm/xterm/css/xterm.css`).

**Server wiring** (`server.ts`) — `createNodeWebSocket({ app })` → `injectWebSocket(server)` so WS shares the node-server port.

### Removed (cleanup, now dead)
The read-only viewer is redundant (conversation shows in the terminal): remove `TranscriptView.tsx`, `GET /api/transcript`, the `transcript-updated` broadcast in `Session`, and the client `fetchTranscript` + `onTranscript`. **Keep `ActivityReader`/`SyncEngine`/`Session` watching** — running `claude` in the embedded terminal produces the same JSONL the sync reads, so the document-sync loop is unchanged.

### Data flow
User runs `claude` in the embedded terminal → conversation + code happen in cwd → JSONL/code change → (existing) `SyncEngine` debounced sync → `spec.md`/flow update live in the right pane → preview shows the dev server. The terminal and the sync read the same on-disk reality; they don't talk to each other directly.

---

## 5. Error handling

- **ws disconnect (reload):** keep the PTY alive; on reconnect, replay `snapshot()` so scrollback is restored.
- **PTY exits** (user types `exit`): emit an exit notice to the ws; the frontend shows "터미널 종료됨 — 재시작" with a button that reconnects (spawns a fresh PTY).
- **spawn failure** (`posix_spawnp`): surface a clear message; the `postinstall` chmod prevents the known exec-bit cause.
- **resize races:** debounce fit/resize; clamp to ≥1 col/row.
- **Backpressure:** ring buffer bounded (~64 KB) so a chatty process can't grow memory unbounded.

---

## 6. Testing

- **Unit (TDD, fake `Pty`):** `TerminalSession` — ring-buffer accumulation + truncation at cap; `snapshot()` returns recent output; `subscribe`/fan-out; `write`/`resize` forward to the pty; `kill`/exit. The WS message protocol parsing (`input`/`resize`) tested against the session with a fake pty.
- **Real-PTY smoke (not in CI unit run):** spawn a real node-pty (`echo`) and assert output — exercises the actual binary + the chmod fix. Run manually/once.
- **Browser smoke (Playwright, headless):** load the dev UI, assert the terminal mounts, the WebSocket connects, and typing `echo hi\n` echoes back — **actually load the page in a browser** (per memory `verify-dev-ui-in-browser`; do not rely on curl).

---

## 7. Scope & build order

One spec. **Backend first:** `postinstall` chmod + `node-pty` dep → `TerminalSession` (fake-pty unit tests) → real `spawnNodePty` factory + smoke → `/ws/terminal` WebSocket + server wiring. **Then frontend:** `Terminal.tsx` (xterm + ws) replacing `TranscriptView` in `App`. **Then cleanup:** remove the read-only transcript viewer + `/api/transcript` + `transcript-updated`.

**Out of scope (later):** multiple terminal tabs/splits; full scrollback persistence to disk; multi-CLI niceties; the autonomous-agent direction.

---

## 8. Known couplings & risks

- **node-pty native module / spawn-helper exec bit** — handled by the `postinstall` (verified to fix the failure on this machine). Re-verify if the node-pty version changes.
- **WebSocket + @hono/node-ws + @hono/node-server integration** — verify the `injectWebSocket`/`upgradeWebSocket` wiring against installed versions (same "verify external API" discipline used for the Agent SDK, Hono streaming, and mermaid).
- **xterm package names** — use the scoped `@xterm/xterm` + `@xterm/addon-fit` (the unscoped `xterm` is deprecated).
