# Throughline — Browser App Implementation Plan (Plan 2 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the hero UX — a local browser app where you chat with your Claude Code on the left and a `spec.md` writes itself live on the right.

**Architecture:** A long-running local Node server (Hono) holds a singleton `Session` (transcript + `SpecStore` + `ScribeEngine` from Plan 1 + a debouncer + an SSE broadcaster). `POST /api/chat` streams a `converse` reply and, after a debounce, runs the scribe; `GET /api/events` (SSE) pushes `spec-updated` events to the browser. A Vite/React frontend renders a split screen: `ChatPane` (streaming chat) and `SpecPane` (live markdown + update flash).

**Tech Stack:** Plan 1 engine (unchanged) + Hono, `@hono/node-server`, React, Vite, `react-markdown`, `remark-gfm`, `open`. Tests: Vitest (server units + integration with the Plan 1 `FakeAgentRunner`). Frontend verified by manual smoke (consistent with Plan 1).

**Builds on Plan 1** (`docs/superpowers/plans/2026-05-31-throughline-living-spec-engine.md`), already merged to `main`. Reuses `src/domain/types.ts` (`Message`, `AgentRunner`, `ScribeResult`), `src/core/spec-store.ts`, `src/core/scribe-engine.ts`, `src/agent/{fake-runner,claude-code-runner}.ts`.

---

## File Structure

```
throughline/
  vite.config.ts                 # Vite (root=src/web, proxy /api → server, build→dist)
  bin/throughline.mjs            # launcher: build web + start server + open browser
  src/
    server/
      debouncer.ts               # debounce/coalesce scheduler (the live loop's heartbeat)
      debouncer.test.ts
      broadcaster.ts             # SSE subscriber registry
      broadcaster.test.ts
      session.ts                 # singleton wiring: transcript, store, engine, debouncer, broadcaster
      session.test.ts
      app.ts                     # Hono routes: /api/chat (stream), /api/events (SSE)
      app.test.ts
      server.ts                  # entrypoint: build Session from cwd, start node-server, serve dist
    web/
      index.html
      main.tsx
      App.tsx                    # split layout, subscribes to /api/events
      ChatPane.tsx               # streaming chat
      SpecPane.tsx               # live markdown render + update flash
      api.ts                     # browser client: subscribeSpec (EventSource), sendChat (fetch stream)
      styles.css
```

Server logic (`debouncer`, `broadcaster`, `session`, `app`) is TDD'd with the fake runner. `server.ts`, the frontend, and the launcher are verified by manual smoke.

---

## Task 1: Add deps + Vite/React scaffold

**Files:**
- Modify: `package.json` (deps + scripts), `tsconfig.json` (DOM lib + JSX)
- Create: `vite.config.ts`, `src/web/index.html`, `src/web/main.tsx`, `src/web/App.tsx` (temporary stub), `src/web/styles.css`

- [ ] **Step 1: Install new dependencies**

```bash
npm install hono @hono/node-server react react-dom react-markdown remark-gfm open
npm install -D vite @vitejs/plugin-react @types/react @types/react-dom concurrently
```
If any `^` range fails to resolve, install that package with `@latest` and note the version. Goal: a clean install.

- [ ] **Step 2: Add scripts to `package.json`**

Merge these into the existing `"scripts"` block (keep `test`, `test:watch`, `scribe`):

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "scribe": "tsx src/cli/scribe-cli.ts",
    "server": "tsx src/server/server.ts",
    "dev:web": "vite",
    "dev": "concurrently -k -n server,web \"cross-env OPEN=0 npm:server\" \"npm:dev:web\"",
    "build:web": "vite build",
    "start": "npm run build:web && tsx src/server/server.ts"
  }
}
```
Note: to avoid adding `cross-env`, instead write the `dev` script as `concurrently -k -n server,web \"OPEN=0 npm:server\" \"npm:dev:web\"` (macOS/Linux inline env works in the shell concurrently spawns). Use the inline form.

- [ ] **Step 3: Update `tsconfig.json` for DOM + JSX**

Replace `tsconfig.json` with:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  root: 'src/web',
  plugins: [react()],
  server: { port: 5173, proxy: { '/api': 'http://localhost:5174' } },
  build: { outDir: '../../dist', emptyOutDir: true },
});
```

- [ ] **Step 5: Create the web entry files**

`src/web/index.html`:
```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Throughline</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/main.tsx"></script>
  </body>
</html>
```

`src/web/main.tsx`:
```tsx
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

createRoot(document.getElementById('root')!).render(<App />);
```

`src/web/App.tsx` (temporary stub — replaced in Task 10):
```tsx
export function App() {
  return <div className="app">Throughline</div>;
}
```

`src/web/styles.css`:
```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, system-ui, sans-serif; }
.app { display: flex; height: 100vh; }
```

- [ ] **Step 6: Verify build + typecheck**

Run: `npm run build:web`
Expected: Vite builds to `dist/` with no errors.
Run: `npx tsc --noEmit`
Expected: clean (no errors).
Run: `npm test`
Expected: the existing 18 tests still pass.

- [ ] **Step 7: Commit**

```bash
echo "dist/" >> .gitignore
git add -A
git commit -m "chore: add Hono+Vite+React stack and web scaffold"
```

---

## Task 2: Debouncer

**Files:**
- Create: `src/server/debouncer.ts`, `src/server/debouncer.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/debouncer.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Debouncer } from './debouncer';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('Debouncer', () => {
  it('runs the function once after the delay', () => {
    const fn = vi.fn();
    const d = new Debouncer(1000);
    d.schedule(fn);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(999);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces rapid schedules into a single trailing call', () => {
    const fn = vi.fn();
    const d = new Debouncer(1000);
    d.schedule(fn);
    vi.advanceTimersByTime(500);
    d.schedule(fn);
    vi.advanceTimersByTime(500);
    expect(fn).not.toHaveBeenCalled(); // timer was reset at 500ms
    vi.advanceTimersByTime(500);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('flush() runs the pending function immediately and cancels the timer', () => {
    const fn = vi.fn();
    const d = new Debouncer(1000);
    d.schedule(fn);
    d.flush();
    expect(fn).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1000);
    expect(fn).toHaveBeenCalledTimes(1); // not called again
  });

  it('cancel() drops the pending function', () => {
    const fn = vi.fn();
    const d = new Debouncer(1000);
    d.schedule(fn);
    d.cancel();
    vi.advanceTimersByTime(1000);
    expect(fn).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it and confirm FAIL** — `npx vitest run src/server/debouncer.test.ts` (cannot find module).

- [ ] **Step 3: Implement**

```ts
// src/server/debouncer.ts
type Task = () => void | Promise<void>;

/** Coalesces rapid schedule() calls into a single trailing run after `delayMs`. */
export class Debouncer {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private pending: Task | null = null;

  constructor(private delayMs: number) {}

  schedule(task: Task): void {
    this.pending = task;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.delayMs);
  }

  flush(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const task = this.pending;
    this.pending = null;
    if (task) void task();
  }

  cancel(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.pending = null;
  }
}
```

- [ ] **Step 4: Run and confirm 4/4 PASS** — `npx vitest run src/server/debouncer.test.ts`; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/server/debouncer.ts src/server/debouncer.test.ts
git commit -m "feat: debouncer for the live scribe loop"
```

---

## Task 3: Broadcaster

**Files:**
- Create: `src/server/broadcaster.ts`, `src/server/broadcaster.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/broadcaster.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Broadcaster } from './broadcaster';

describe('Broadcaster', () => {
  it('delivers events to all subscribers', () => {
    const b = new Broadcaster();
    const a = vi.fn();
    const c = vi.fn();
    b.subscribe(a);
    b.subscribe(c);
    b.broadcast('spec-updated', { md: 'x', changedLines: [1] });
    expect(a).toHaveBeenCalledWith('spec-updated', { md: 'x', changedLines: [1] });
    expect(c).toHaveBeenCalledWith('spec-updated', { md: 'x', changedLines: [1] });
  });

  it('stops delivering after unsubscribe', () => {
    const b = new Broadcaster();
    const a = vi.fn();
    const unsub = b.subscribe(a);
    unsub();
    b.broadcast('ping', null);
    expect(a).not.toHaveBeenCalled();
    expect(b.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run and confirm FAIL** — `npx vitest run src/server/broadcaster.test.ts`.

- [ ] **Step 3: Implement**

```ts
// src/server/broadcaster.ts
export type BroadcastListener = (event: string, data: unknown) => void;

/** Tiny pub/sub used to fan engine/file events out to all connected SSE clients. */
export class Broadcaster {
  private listeners = new Set<BroadcastListener>();

  subscribe(listener: BroadcastListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(event: string, data: unknown): void {
    for (const listener of this.listeners) listener(event, data);
  }

  get size(): number {
    return this.listeners.size;
  }
}
```

- [ ] **Step 4: Run and confirm 2/2 PASS**; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/server/broadcaster.ts src/server/broadcaster.test.ts
git commit -m "feat: SSE broadcaster"
```

---

## Task 4: Session

**Files:**
- Create: `src/server/session.ts`, `src/server/session.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/session.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from '../core/spec-store';
import { FakeAgentRunner } from '../agent/fake-runner';
import { Session } from './session';

let dir: string;
let session: Session;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'throughline-'));
});
afterEach(async () => {
  session?.close();
  await rm(dir, { recursive: true, force: true });
});

const VALID = `## 🎯 요약
앱

## ✅ 핵심 기능
- [ ] 소셜 로그인

## 🟡 미정 / 열린 질문
- 결제?
`;

describe('Session', () => {
  it('streams converse tokens, records the transcript, and on flush scribes + broadcasts', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    const runner = new FakeAgentRunner({ converseReply: 'hello', scribeReply: VALID });
    session = new Session({ store, runner, debounceMs: 1000 });

    const events: { event: string; data: unknown }[] = [];
    session.broadcaster.subscribe((event, data) => events.push({ event, data }));

    const updated = new Promise<void>((resolve) =>
      session.engine.once('updated', () => resolve()),
    );

    const tokens: string[] = [];
    const reply = await session.sendUserMessage('hi', (t) => tokens.push(t));

    expect(reply).toBe('hello');
    expect(tokens.join('')).toBe('hello');
    expect(session.transcript).toEqual([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: 'hello' },
    ]);

    session.flush();
    await updated;

    expect(await store.read()).toContain('- [ ] 소셜 로그인 <!-- id: feat-');
    expect(events.some((e) => e.event === 'spec-updated')).toBe(true);
  });
});
```

- [ ] **Step 2: Run and confirm FAIL** — `npx vitest run src/server/session.test.ts`.

- [ ] **Step 3: Implement**

```ts
// src/server/session.ts
import { Message, AgentRunner, ScribeResult } from '../domain/types';
import { SpecStore } from '../core/spec-store';
import { ScribeEngine } from '../core/scribe-engine';
import { Debouncer } from './debouncer';
import { Broadcaster } from './broadcaster';

export interface SessionDeps {
  store: SpecStore;
  runner: AgentRunner;
  debounceMs?: number;
}

/**
 * The in-memory state of one Throughline editing session: the conversation,
 * the scribe engine, the debounced live loop, and the broadcaster that fans
 * spec updates out to connected browsers.
 */
export class Session {
  readonly transcript: Message[] = [];
  readonly engine: ScribeEngine;
  readonly broadcaster = new Broadcaster();

  private store: SpecStore;
  private runner: AgentRunner;
  private debouncer: Debouncer;
  private unwatch: () => void;
  private lastMd: string | null = null;

  constructor(deps: SessionDeps) {
    this.store = deps.store;
    this.runner = deps.runner;
    this.engine = new ScribeEngine(deps.store, deps.runner);
    this.debouncer = new Debouncer(deps.debounceMs ?? 1500);

    this.engine.on('updated', (r: ScribeResult) => {
      this.lastMd = r.md;
      this.broadcaster.broadcast('spec-updated', r);
    });

    // Reflect EXTERNAL edits (user editing spec.md in their own editor).
    // Skip the echo of our own scribe writes by comparing against lastMd.
    this.unwatch = this.store.watch((md) => {
      if (md === this.lastMd) return;
      this.broadcaster.broadcast('spec-updated', { md, changedLines: [] });
    });
  }

  readSpec(): Promise<string> {
    return this.store.read();
  }

  /** Append a user turn, stream the assistant reply, then schedule a debounced scribe. */
  async sendUserMessage(content: string, onToken: (t: string) => void): Promise<string> {
    this.transcript.push({ role: 'user', content });
    const reply = await this.runner.converse(this.transcript, onToken);
    this.transcript.push({ role: 'assistant', content: reply });
    this.debouncer.schedule(() => this.engine.runNow(this.transcript));
    return reply;
  }

  /** Run any pending scribe immediately (used at shutdown and in tests). */
  flush(): void {
    this.debouncer.flush();
  }

  close(): void {
    this.debouncer.cancel();
    this.unwatch();
  }
}
```

- [ ] **Step 4: Run and confirm 1/1 PASS**; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/server/session.ts src/server/session.test.ts
git commit -m "feat: Session wires transcript, engine, debounce, and broadcast"
```

---

## Task 5: Hono app routes

**Files:**
- Create: `src/server/app.ts`, `src/server/app.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/server/app.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from '../core/spec-store';
import { FakeAgentRunner } from '../agent/fake-runner';
import { Session } from './session';
import { createApp } from './app';

let dir: string;
let session: Session;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'throughline-'));
});
afterEach(async () => {
  session?.close();
  await rm(dir, { recursive: true, force: true });
});

const VALID = `## 🎯 요약
앱

## ✅ 핵심 기능
- [ ] 소셜 로그인

## 🟡 미정 / 열린 질문
- 결제?
`;

describe('createApp POST /api/chat', () => {
  it('streams the converse reply and triggers a scribe that updates the store', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    const runner = new FakeAgentRunner({ converseReply: 'hi there', scribeReply: VALID });
    session = new Session({ store, runner, debounceMs: 1000 });
    const app = createApp(session);

    const updated = new Promise<void>((resolve) =>
      session.engine.once('updated', () => resolve()),
    );

    const res = await app.request('/api/chat', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: '로그인 소셜만' }),
    });

    expect(res.status).toBe(200);
    expect(await res.text()).toBe('hi there');

    session.flush();
    await updated;
    expect(await store.read()).toContain('## ✅ 핵심 기능');
  });
});
```

- [ ] **Step 2: Run and confirm FAIL** — `npx vitest run src/server/app.test.ts`.

- [ ] **Step 3: Implement**

```ts
// src/server/app.ts
import { Hono } from 'hono';
import { streamText, streamSSE } from 'hono/streaming';
import { Session } from './session';

export function createApp(session: Session): Hono {
  const app = new Hono();

  app.post('/api/chat', async (c) => {
    const body = await c.req.json<{ message?: string }>();
    return streamText(c, async (stream) => {
      await session.sendUserMessage(body.message ?? '', (t) => stream.write(t));
    });
  });

  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      // Send the current spec immediately so a fresh client renders right away.
      const current = await session.readSpec();
      await stream.writeSSE({
        event: 'spec-updated',
        data: JSON.stringify({ md: current, changedLines: [] }),
      });

      const unsub = session.broadcaster.subscribe((event, data) => {
        void stream.writeSSE({ event, data: JSON.stringify(data) });
      });
      stream.onAbort(() => unsub());

      // Hold the connection open; heartbeat keeps proxies from closing it.
      while (!stream.aborted) {
        await stream.sleep(30_000);
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });

  return app;
}
```
> Implementer note: verify the Hono streaming API names against the installed version — `streamText`/`streamSSE` from `hono/streaming`, and on the SSE stream object: `writeSSE`, `onAbort`, `aborted`, `sleep`. If a name differs, read `node_modules/hono/dist/types/helper/streaming/*` and adjust (do not guess). The acceptance gate for this file is the `/api/chat` test passing + `tsc` clean; the SSE endpoint is exercised in the Task 11 manual smoke.

- [ ] **Step 4: Run and confirm 1/1 PASS**; then `npx tsc --noEmit`.

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts src/server/app.test.ts
git commit -m "feat: Hono routes for chat streaming and SSE spec events"
```

---

## Task 6: Server entrypoint

**Files:**
- Create: `src/server/server.ts`

No unit test (it binds a port + spawns the real runner). Verified in Task 11.

- [ ] **Step 1: Implement**

```ts
// src/server/server.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import open from 'open';
import { SpecStore } from '../core/spec-store';
import { ClaudeCodeRunner } from '../agent/claude-code-runner';
import { Session } from './session';
import { createApp } from './app';

const cwd = process.cwd();
const specPath = join(cwd, 'spec.md');

const session = new Session({
  store: new SpecStore(specPath),
  runner: new ClaudeCodeRunner({ cwd }),
});
const app = createApp(session);

// Serve the built frontend when present (production / `npm start`).
if (existsSync(join(cwd, 'dist'))) {
  app.use('/*', serveStatic({ root: './dist' }));
}

const port = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, port }, (info) => {
  const url = `http://localhost:${info.port}`;
  console.log(`Throughline → ${url}  (editing ${specPath})`);
  if (process.env.OPEN !== '0' && existsSync(join(cwd, 'dist'))) void open(url);
});

const shutdown = () => {
  session.flush();
  session.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` (expect clean). Do not start the real server here.

- [ ] **Step 3: Commit**

```bash
git add src/server/server.ts
git commit -m "feat: server entrypoint wiring Session to cwd spec.md"
```

---

## Task 7: Browser API client

**Files:**
- Create: `src/web/api.ts`

Frontend module; verified by the Task 11 manual smoke. Keep it tiny and correct.

- [ ] **Step 1: Implement**

```ts
// src/web/api.ts
export type SpecUpdate = { md: string; changedLines: number[] };

/** Subscribe to live spec updates over SSE. Returns an unsubscribe fn. */
export function subscribeSpec(onUpdate: (u: SpecUpdate) => void): () => void {
  const es = new EventSource('/api/events');
  es.addEventListener('spec-updated', (e) => {
    onUpdate(JSON.parse((e as MessageEvent).data) as SpecUpdate);
  });
  return () => es.close();
}

/** Send a chat message; invoke onToken for each streamed chunk of the reply. */
export async function sendChat(
  message: string,
  onToken: (t: string) => void,
): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onToken(decoder.decode(value, { stream: true }));
  }
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` (expect clean).

- [ ] **Step 3: Commit**

```bash
git add src/web/api.ts
git commit -m "feat: browser API client (SSE + streaming chat)"
```

---

## Task 8: SpecPane

**Files:**
- Create: `src/web/SpecPane.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/web/SpecPane.tsx
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export function SpecPane({
  md,
  changedLines,
}: {
  md: string;
  changedLines: number[];
}) {
  const [flash, setFlash] = useState(false);
  const firstRender = useRef(true);

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    setFlash(true);
    const t = setTimeout(() => setFlash(false), 1200);
    return () => clearTimeout(t);
  }, [md]);

  return (
    <section className={`spec ${flash ? 'flash' : ''}`}>
      <header className="spec-head">
        <span>📄 살아있는 기획서 · spec.md</span>
        {changedLines.length > 0 ? (
          <span className="badge">방금 {changedLines.length}줄 갱신</span>
        ) : null}
      </header>
      <div className="spec-body">
        {md.trim() ? (
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{md}</ReactMarkdown>
        ) : (
          <p className="empty">대화를 시작하면 여기에 기획서가 살아납니다…</p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` (expect clean).

- [ ] **Step 3: Commit**

```bash
git add src/web/SpecPane.tsx
git commit -m "feat: SpecPane live markdown render + update flash"
```

---

## Task 9: ChatPane

**Files:**
- Create: `src/web/ChatPane.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/web/ChatPane.tsx
import { useState, type FormEvent } from 'react';
import { sendChat } from './api';

type Msg = { role: 'user' | 'assistant'; content: string };

export function ChatPane() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setMessages((m) => [
      ...m,
      { role: 'user', content: text },
      { role: 'assistant', content: '' },
    ]);
    setBusy(true);
    try {
      await sendChat(text, (tok) => {
        setMessages((m) => {
          const copy = m.slice();
          const last = copy[copy.length - 1];
          copy[copy.length - 1] = { role: 'assistant', content: last.content + tok };
          return copy;
        });
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="chat">
      <div className="chat-log">
        {messages.length === 0 ? (
          <p className="empty">기획을 말해보세요. 대화가 곧 기획서가 됩니다.</p>
        ) : null}
        {messages.map((m, i) => (
          <div key={i} className={`bubble ${m.role}`}>
            {m.content || '…'}
          </div>
        ))}
      </div>
      <form className="composer" onSubmit={submit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="예: AI 미팅 노트 앱, 로그인은 소셜만…"
          disabled={busy}
        />
        <button disabled={busy}>{busy ? '…' : '보내기'}</button>
      </form>
    </section>
  );
}
```

- [ ] **Step 2: Typecheck** — `npx tsc --noEmit` (expect clean).

- [ ] **Step 3: Commit**

```bash
git add src/web/ChatPane.tsx
git commit -m "feat: ChatPane streaming conversation"
```

---

## Task 10: App layout + styles

**Files:**
- Modify: `src/web/App.tsx` (replace the stub), `src/web/styles.css`

- [ ] **Step 1: Replace `src/web/App.tsx`**

```tsx
// src/web/App.tsx
import { useEffect, useState } from 'react';
import { subscribeSpec } from './api';
import { ChatPane } from './ChatPane';
import { SpecPane } from './SpecPane';

export function App() {
  const [md, setMd] = useState('');
  const [changedLines, setChangedLines] = useState<number[]>([]);

  useEffect(
    () =>
      subscribeSpec((u) => {
        setMd(u.md);
        setChangedLines(u.changedLines);
      }),
    [],
  );

  return (
    <div className="app">
      <ChatPane />
      <SpecPane md={md} changedLines={changedLines} />
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/web/styles.css`**

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, system-ui, "Apple SD Gothic Neo", sans-serif; color: #111; }
.app { display: flex; height: 100vh; }
.empty { color: #94a3b8; }

/* Left: chat */
.chat { flex: 0 0 42%; display: flex; flex-direction: column; background: #eef2f7; border-right: 1px solid #d8dee9; }
.chat-log { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 8px; }
.bubble { max-width: 85%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; line-height: 1.5; }
.bubble.user { align-self: flex-end; background: #dbe4f0; }
.bubble.assistant { align-self: flex-start; background: #fff; border: 1px solid #e2e8f0; }
.composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #d8dee9; background: #f6f8fb; }
.composer input { flex: 1; padding: 10px 12px; border: 1px solid #d8dee9; border-radius: 18px; font-size: 14px; }
.composer button { padding: 0 16px; border: none; border-radius: 18px; background: #2f6df6; color: #fff; font-weight: 600; cursor: pointer; }
.composer button:disabled { opacity: 0.5; cursor: default; }

/* Right: living spec */
.spec { flex: 1; display: flex; flex-direction: column; background: #fff; transition: background 0.4s; }
.spec.flash { background: #f3faf5; }
.spec-head { display: flex; align-items: center; justify-content: space-between; padding: 12px 18px; border-bottom: 1px solid #eef2f7; font-size: 13px; color: #475569; }
.badge { background: #cdebd6; color: #166534; border-radius: 10px; padding: 2px 8px; font-size: 11px; }
.spec-body { flex: 1; overflow-y: auto; padding: 18px 24px; line-height: 1.6; }
.spec-body h2 { font-size: 16px; margin: 18px 0 6px; }
.spec-body ul { padding-left: 20px; }
.spec-body code { background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }
```

- [ ] **Step 3: Verify build + typecheck**

Run: `npm run build:web` (expect clean Vite build).
Run: `npx tsc --noEmit` (expect clean).
Run: `npm test` (expect all prior tests still pass).

- [ ] **Step 4: Commit**

```bash
git add src/web/App.tsx src/web/styles.css
git commit -m "feat: split-screen App layout + styles"
```

---

## Task 11: Launcher + end-to-end manual smoke

**Files:**
- Create: `bin/throughline.mjs`

- [ ] **Step 1: Create `bin/throughline.mjs`**

```js
#!/usr/bin/env node
// Build the web app (if needed) and start the server, which opens the browser.
import { spawn } from 'node:child_process';

const child = spawn('npm', ['start'], { stdio: 'inherit', shell: false });
child.on('exit', (code) => process.exit(code ?? 0));
```

Add a `bin` field to `package.json`:
```json
{
  "bin": { "throughline": "bin/throughline.mjs" }
}
```

- [ ] **Step 2: Full automated check**

Run: `npm test`
Expected: all tests pass (Plan 1's 18 + debouncer 4 + broadcaster 2 + session 1 + app 1 = 26).
Run: `npx tsc --noEmit`
Expected: clean.
Run: `npm run build:web`
Expected: clean build to `dist/`.

- [ ] **Step 3: Manual e2e smoke (requires Claude Code authenticated)**

In one terminal, from the project root:
```bash
rm -f spec.md
npm run dev
```
This starts the Hono server on :5174 and Vite on :5173. Open `http://localhost:5173`.

Verify the full hero loop:
1. The right pane shows the empty-spec placeholder.
2. Type: `AI 미팅 노트 앱 만들거야. 로그인은 소셜만.` → send.
3. The assistant reply streams into the left pane.
4. Within ~1.5s after the reply finishes, the right pane updates: `## 🎯 요약`, `## ✅ 핵심 기능` with checkbox items, `## 🟡 미정 / 열린 질문`. The pane flashes and shows a "방금 N줄 갱신" badge.
5. Send a follow-up (`실시간 요약도 필요해`) → confirm the spec grows/updates live.
6. In a separate editor, edit `spec.md` directly and save → confirm the right pane reflects the external edit (validates the `watch` → broadcast path).

Capture: whether each step worked, any console errors, and the final `spec.md` contents. If a step fails, report it with the error (this is a manual gate; the committed code + automated suite are the hard deliverable).

- [ ] **Step 4: Commit the launcher**

```bash
git add bin/throughline.mjs package.json
git commit -m "feat: throughline launcher + bin"
```

---

## Self-Review (completed by plan author)

**Spec coverage (Plan-2 portion of the design spec):**
- Split screen, chat left / spec right → `App.tsx` + styles (Task 10) ✓
- Conversation drives the user's Claude Code, streamed → `Session.sendUserMessage` + `/api/chat` streamText + `ChatPane` (Tasks 4, 5, 9) ✓
- Debounced live scribe loop on each turn → `Debouncer` + `Session` (Tasks 2, 4) ✓
- Live spec render + change signal → SSE `spec-updated` + `SpecPane` flash/badge (Tasks 3, 5, 7, 8) ✓
- External edits reflected live → `Session` `store.watch` → broadcast, self-write echo suppressed via `lastMd` (Task 4) ✓
- Uses Plan 1 engine unchanged → `ScribeEngine`/`ClaudeCodeRunner`/`SpecStore` imported, not modified ✓
- Launcher → `bin/throughline.mjs` + `npm start` (Task 11) ✓

**Placeholder scan:** no TBD/TODO; every code step has complete code. The two external-API touch points (Hono streaming names, the real SDK) carry explicit "verify against installed version" notes, mirroring how Plan 1 Task 9 was handled successfully.

**Type consistency:** `SpecUpdate {md, changedLines}` (client) mirrors `ScribeResult {md, changedLines}` (engine); `Session` exposes `engine`, `broadcaster`, `transcript`, `readSpec`, `sendUserMessage`, `flush`, `close` — all used consistently across Tasks 4/5/6 and the tests. `Debouncer.schedule/flush/cancel` and `Broadcaster.subscribe/broadcast/size` match their tests.

**Known MVP limitation (documented, not a gap):** `SpecPane` signals updates with a whole-pane flash + changed-line count rather than highlighting the exact changed lines in the rendered markdown (precise per-line highlight on formatted markdown requires line-addressable rendering — deferred). The `changedLines` data is already plumbed end-to-end, so per-line highlighting is a later polish with no architectural change.

**Open questions (resolve during implementation):**
- Confirm Hono SSE stream API surface (`aborted`/`onAbort`/`sleep`) against the installed version (noted in Task 5).
- `spec.md` lives at the cwd root for MVP; a `--spec <path>` flag is a later convenience.
