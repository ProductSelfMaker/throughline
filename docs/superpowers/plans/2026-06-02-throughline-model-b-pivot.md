# Throughline Model-B Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Throughline from a chat app into an observer that reads the user's Claude Code session logs (+ git diff) and maintains an accumulating PRD in `<project>/.throughline/prd.md`, with a scribe-steering chat.

**Architecture:** A `SessionLogReader` tails the project's Claude Code session JSONL (excluding subagents) from a byte-offset checkpoint; `Session` debounces new activity and runs the existing scribe/`applySpecUpdate` pipeline to grow the persisted PRD, broadcasting over SSE. The coding chat (`/api/chat`, `ChatPane`, `runner.converse`, `ConversationStore`) is removed; a `/api/curate` endpoint + `ScribeChat` UI let the user steer the doc. The frontend flips to doc-centric.

**Tech Stack:** TypeScript, Node, Hono, Vite + React 19, vitest, chokidar, Claude Agent SDK.

**Spec:** `docs/superpowers/specs/2026-06-02-throughline-model-b-pivot-design.md`

**Conventions:** run tests with `npm test` (vitest), typecheck with `npx tsc --noEmit`, web build with `npm run build:web`. Frontend has no unit tests — its tasks verify via tsc + build + a headless browser smoke (per the `verify-dev-ui-in-browser` memory: actually load the dev server and check `#root`).

---

## File Structure

**Create:**
- `src/agent/session-log-reader.ts` — locate + tail Claude Code session JSONL → activity excerpt + advanced offsets.
- `src/core/ingest-store.ts` — load/save `.throughline/ingest-state.json` checkpoint.
- `src/domain/curate-prompt.ts` — prompt for scribe-chat curation commands.
- `src/web/ScribeChat.tsx` — curation composer (posts to `/api/curate`).
- `src/web/MainView.tsx` — the primary region (doc/flow/preview + scribe dock); replaces `RightPane.tsx`.
- tests alongside the new domain/core/agent modules.

**Modify:**
- `src/domain/types.ts` — add `ActivityBatch` + `ActivityReader`; remove `converse` from `AgentRunner` and remove `ChatEvent`.
- `src/server/session.ts` — observer engine (ingest/curate/watch) instead of chat.
- `src/server/app.ts` — drop `/api/chat` + `/api/transcript`; add `/api/curate`.
- `src/server/server.ts` — wire reader/ingest + `.throughline/prd.md` + migration; drop `ConversationStore`.
- `src/agent/claude-code-runner.ts` — drop `converse`; collect text only.
- `src/agent/fake-runner.ts` — drop `converse`/chat options.
- `src/web/api.ts` — drop chat fns; add `curate`.
- `src/web/App.tsx` — doc-centric layout (no chat, no divider).
- `src/web/styles.css` — main/scribe layout.

**Delete:**
- `src/web/ChatPane.tsx`, `src/web/RightPane.tsx`, `src/web/ResizableDivider.tsx`
- `src/server/conversation-store.ts` + `src/server/conversation-store.test.ts`
- `src/agent/claude-code-runner.test.ts` is rewritten (not deleted).

---

## Task 1: Curation prompt (additive)

**Files:**
- Create: `src/domain/curate-prompt.ts`
- Test: `src/domain/curate-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/curate-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildCuratePrompt } from './curate-prompt';
import { SPINE_HEADINGS } from './types';

describe('buildCuratePrompt', () => {
  it('embeds the instruction, current PRD, spine, diff, and demands full output', () => {
    const p = buildCuratePrompt('## 📌 개요\n기존', '리스크 섹션 추가해', 'diff --git a/x');
    expect(p).toContain('리스크 섹션 추가해');
    expect(p).toContain('기존');
    for (const h of SPINE_HEADINGS) expect(p).toContain(h);
    expect(p).toContain('x'); // diff embedded
    expect(p).toContain('전체');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- curate-prompt`
Expected: FAIL — cannot find `./curate-prompt`.

- [ ] **Step 3: Implement**

```ts
// src/domain/curate-prompt.ts
import { SPINE_HEADINGS } from './types';

export function buildCuratePrompt(
  currentPrd: string,
  instruction: string,
  gitDiff: string,
): string {
  return [
    '너는 살아있는 PRD(prd.md)를 관리하는 스크라이브다. 아래 "지시"에 따라 PRD를 고쳐라.',
    `고정 섹션은 항상 유지: ${SPINE_HEADINGS.join(' , ')}. 그 외 주제는 "## <주제>"로 자유롭게.`,
    '기존 줄의 <!-- id: ... --> 주석은 보존한다. 지시와 무관한 내용은 건드리지 마라.',
    '',
    '지시:',
    '"""',
    instruction,
    '"""',
    '',
    '현재 PRD:',
    '"""',
    currentPrd,
    '"""',
    '',
    '참고 코드 변경(git diff):',
    '"""',
    gitDiff || '(없음)',
    '"""',
    '',
    '갱신된 PRD 마크다운 "전체"만 출력하라. 설명·코드펜스(```) 없이.',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- curate-prompt`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/curate-prompt.ts src/domain/curate-prompt.test.ts
git commit -m "feat(domain): buildCuratePrompt for scribe-chat curation"
```

---

## Task 2: Activity types + `ActivityReader` interface (additive)

**Files:**
- Modify: `src/domain/types.ts` (add only; removals happen in Task 6)

- [ ] **Step 1: Add the types** (append near the other interfaces, above the constants)

```ts
/** A batch of new agent activity since the last checkpoint. */
export interface ActivityBatch {
  /** Scribe-ready excerpt: "사용자: …" / "AI: …" / "[도구] name target" lines. */
  excerpt: string;
  /** session file (absolute path) -> new byte offset to persist. */
  advanced: Record<string, number>;
}

/** Reads new agent activity for a project and watches for more. */
export interface ActivityReader {
  readNew(checkpoint: Record<string, number>): Promise<ActivityBatch>;
  watch(onActivity: () => void): () => void;
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: TSC CLEAN (additive only).

- [ ] **Step 3: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat(domain): ActivityBatch + ActivityReader types"
```

---

## Task 3: `SessionLogReader`

**Files:**
- Create: `src/agent/session-log-reader.ts`
- Test: `src/agent/session-log-reader.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/agent/session-log-reader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SessionLogReader, encodeProjectDir, extractActivity } from './session-log-reader';

const CWD = '/Users/x/proj';

function line(obj: unknown): string { return JSON.stringify(obj) + '\n'; }
const userLine = (t: string) => line({ type: 'user', message: { role: 'user', content: t } });
const asstLine = (t: string, tool?: { name: string; input: unknown }) =>
  line({ type: 'assistant', message: { role: 'assistant', content: [
    ...(t ? [{ type: 'text', text: t }] : []),
    ...(tool ? [{ type: 'tool_use', name: tool.name, input: tool.input }] : []),
  ] } });

let home: string;
let sessionDir: string;
beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'tl-home-'));
  sessionDir = join(home, '.claude', 'projects', encodeProjectDir(CWD));
  await mkdir(sessionDir, { recursive: true });
});
afterEach(async () => { await rm(home, { recursive: true, force: true }); });

describe('encodeProjectDir', () => {
  it('maps a cwd to Claude Code\'s dashed project dir name', () => {
    expect(encodeProjectDir('/Users/x/proj')).toBe('-Users-x-proj');
  });
});

describe('extractActivity', () => {
  it('renders user/assistant text and tool_use, skips other line types', () => {
    const lines = [
      JSON.stringify({ type: 'mode', mode: 'x' }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: '로그인 만들어' } }),
      JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [
        { type: 'text', text: '했어요' },
        { type: 'tool_use', name: 'Write', input: { file_path: 'src/Login.tsx' } },
      ] } }),
    ];
    expect(extractActivity(lines)).toBe('사용자: 로그인 만들어\nAI: 했어요\n[도구] Write src/Login.tsx');
  });
});

describe('SessionLogReader', () => {
  it('reads new lines, advances offsets, and excludes agent-* subagent logs', async () => {
    await writeFile(join(sessionDir, 's1.jsonl'), userLine('안녕') + asstLine('네'));
    await writeFile(join(sessionDir, 'agent-abc.jsonl'), userLine('서브에이전트'));
    const reader = new SessionLogReader({ cwd: CWD, home });

    const first = await reader.readNew({});
    expect(first.excerpt).toContain('사용자: 안녕');
    expect(first.excerpt).toContain('AI: 네');
    expect(first.excerpt).not.toContain('서브에이전트');
    expect(first.advanced[join(sessionDir, 's1.jsonl')]).toBeGreaterThan(0);

    // re-reading from the advanced checkpoint yields nothing new
    const second = await reader.readNew(first.advanced);
    expect(second.excerpt).toBe('');
  });

  it('does not consume a partial trailing line (no newline yet)', async () => {
    const f = join(sessionDir, 's2.jsonl');
    await writeFile(f, userLine('완성된 줄') + '{"type":"user","message":{"role":"user","content":"미완성'); // no trailing \n
    const reader = new SessionLogReader({ cwd: CWD, home });
    const out = await reader.readNew({});
    expect(out.excerpt).toBe('사용자: 완성된 줄');
    // advanced stops at the end of the complete line, so the partial is retried later
    await writeFile(f, userLine('완성된 줄') + userLine('미완성→완성'));
    const out2 = await reader.readNew(out.advanced);
    expect(out2.excerpt).toBe('사용자: 미완성→완성');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- session-log-reader`
Expected: FAIL — cannot find `./session-log-reader`.

- [ ] **Step 3: Implement**

```ts
// src/agent/session-log-reader.ts
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chokidar from 'chokidar';
import { ActivityBatch, ActivityReader } from '../domain/types';

/** Claude Code stores per-project sessions under ~/.claude/projects/<dashed cwd>/. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

function toolTarget(input: unknown): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const v = o.file_path ?? o.path ?? o.command ?? o.pattern ?? o.url;
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  }
  return '';
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: 'text'; text: string } =>
        !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
      .map((b) => b.text)
      .join('');
  }
  return '';
}

/** Render a window of JSONL lines into a scribe-friendly excerpt. */
export function extractActivity(lines: string[]): string {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    let o: { type?: string; message?: { role?: string; content?: unknown } };
    try { o = JSON.parse(t); } catch { continue; }
    const role = o.message?.role;
    if (o.type === 'user' && role === 'user') {
      const text = textFromContent(o.message?.content).trim();
      if (text) out.push('사용자: ' + text);
    } else if (o.type === 'assistant' && role === 'assistant') {
      const content = o.message?.content;
      const text = textFromContent(content).trim();
      if (text) out.push('AI: ' + text);
      if (Array.isArray(content)) {
        for (const b of content as Array<{ type?: string; name?: string; input?: unknown }>) {
          if (b && b.type === 'tool_use') out.push(`[도구] ${b.name ?? ''} ${toolTarget(b.input)}`.trim());
        }
      }
    }
  }
  return out.join('\n');
}

export class SessionLogReader implements ActivityReader {
  private dir: string;
  constructor(opts: { cwd: string; home?: string }) {
    this.dir = join(opts.home ?? homedir(), '.claude', 'projects', encodeProjectDir(opts.cwd));
  }

  private async sessionFiles(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    const names = await readdir(this.dir);
    return names
      .filter((n) => n.endsWith('.jsonl') && !n.startsWith('agent-'))
      .map((n) => join(this.dir, n));
  }

  async readNew(checkpoint: Record<string, number>): Promise<ActivityBatch> {
    const files = await this.sessionFiles();
    const parts: string[] = [];
    const advanced: Record<string, number> = {};
    for (const file of files) {
      const buf = await readFile(file);
      const from = checkpoint[file] ?? 0;
      if (buf.length <= from) continue;
      const chunk = buf.subarray(from).toString('utf8');
      const lastNl = chunk.lastIndexOf('\n');
      if (lastNl === -1) continue; // no complete line yet
      const complete = chunk.slice(0, lastNl);
      const text = extractActivity(complete.split('\n'));
      if (text) parts.push(text);
      advanced[file] = from + Buffer.byteLength(complete, 'utf8') + 1; // +1 for the consumed '\n'
    }
    return { excerpt: parts.join('\n'), advanced };
  }

  watch(onActivity: () => void): () => void {
    const w = chokidar.watch(this.dir, { ignoreInitial: true, depth: 0 });
    w.on('add', onActivity).on('change', onActivity);
    return () => void w.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- session-log-reader`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/session-log-reader.ts src/agent/session-log-reader.test.ts
git commit -m "feat(agent): SessionLogReader — tail Claude Code session JSONL"
```

---

## Task 4: `IngestStore` checkpoint

**Files:**
- Create: `src/core/ingest-store.ts`
- Test: `src/core/ingest-store.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/ingest-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { IngestStore } from './ingest-store';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('IngestStore', () => {
  it('returns {} when no state file exists', async () => {
    expect(await new IngestStore(dir).load()).toEqual({});
  });

  it('saves and loads the per-session offsets (creating .throughline)', async () => {
    const s = new IngestStore(dir);
    await s.save({ '/a/s1.jsonl': 120, '/a/s2.jsonl': 5 });
    expect(await new IngestStore(dir).load()).toEqual({ '/a/s1.jsonl': 120, '/a/s2.jsonl': 5 });
  });

  it('returns {} on corrupt state', async () => {
    await mkdir(join(dir, '.throughline'), { recursive: true });
    await writeFile(join(dir, '.throughline', 'ingest-state.json'), 'not json');
    expect(await new IngestStore(dir).load()).toEqual({});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- ingest-store`
Expected: FAIL — cannot find `./ingest-store`.

- [ ] **Step 3: Implement**

```ts
// src/core/ingest-store.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

interface State { version: 1; sessions: Record<string, number>; }

/** Durable ingestion checkpoint at <cwd>/.throughline/ingest-state.json. */
export class IngestStore {
  private file: string;
  constructor(cwd: string) { this.file = join(cwd, '.throughline', 'ingest-state.json'); }

  async load(): Promise<Record<string, number>> {
    if (!existsSync(this.file)) return {};
    try {
      const s = JSON.parse(await readFile(this.file, 'utf8')) as State;
      return s && typeof s === 'object' && s.sessions ? s.sessions : {};
    } catch {
      return {};
    }
  }

  async save(sessions: Record<string, number>): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    const state: State = { version: 1, sessions };
    await writeFile(this.file, JSON.stringify(state, null, 2), 'utf8');
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- ingest-store`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/ingest-store.ts src/core/ingest-store.test.ts
git commit -m "feat(core): IngestStore — .throughline/ingest-state.json checkpoint"
```

---

## Task 5: `Session` observer engine + app routes + server wiring

This task replaces the chat engine with the observer engine and keeps the build green by updating `session.ts`, `app.ts`, `server.ts`, and the server-side tests together.

**Files:**
- Modify: `src/server/session.ts`, `src/server/app.ts`, `src/server/server.ts`
- Modify (tests): `src/server/session.test.ts`, `src/server/app.test.ts`

- [ ] **Step 1: Rewrite `session.ts`**

```ts
// src/server/session.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ActivityReader } from '../domain/types';
import { SpecStore } from '../core/spec-store';
import { IngestStore } from '../core/ingest-store';
import { Debouncer } from './debouncer';
import { Broadcaster } from './broadcaster';
import { buildFlowPrompt } from '../domain/flow-prompt';
import { buildSyncPrompt } from '../domain/sync-prompt';
import { buildCuratePrompt } from '../domain/curate-prompt';
import { applySpecUpdate } from '../core/apply-spec-update';

const execFileP = promisify(execFile);

async function defaultGitDiff(cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileP('git', ['diff', 'HEAD'], { cwd, maxBuffer: 1024 * 1024 });
    return stdout.length > 8000 ? stdout.slice(0, 8000) + '\n…(truncated)' : stdout;
  } catch {
    return '';
  }
}

// Minimal runner surface this engine needs (one-shot completion only).
interface Completer {
  complete(prompt: string, signal?: AbortSignal): Promise<string>;
}

export interface SessionDeps {
  store: SpecStore;
  runner: Completer;
  reader: ActivityReader;
  ingest: IngestStore;
  cwd: string;
  debounceMs?: number;
  gitDiff?: (cwd: string) => Promise<string>;
}

/** Observer: reads the user's agent session logs and keeps the PRD live. */
export class Session {
  readonly broadcaster = new Broadcaster();

  private store: SpecStore;
  private runner: Completer;
  private reader: ActivityReader;
  private ingest: IngestStore;
  private cwd: string;
  private debouncer: Debouncer;
  private gitDiff: (cwd: string) => Promise<string>;
  private checkpoint: Record<string, number> = {};
  private unwatch?: () => void;

  constructor(deps: SessionDeps) {
    this.store = deps.store;
    this.runner = deps.runner;
    this.reader = deps.reader;
    this.ingest = deps.ingest;
    this.cwd = deps.cwd;
    this.debouncer = new Debouncer(deps.debounceMs ?? 8000);
    this.gitDiff = deps.gitDiff ?? defaultGitDiff;
  }

  /** Load the checkpoint, catch up on any unprocessed activity, then watch. */
  async init(): Promise<void> {
    this.checkpoint = await this.ingest.load();
    await this.ingestNow();
    this.unwatch = this.reader.watch(() => this.debouncer.schedule(() => { void this.ingestNow(); }));
  }

  readSpec(): Promise<string> {
    return this.store.read();
  }

  async generateFlow(signal?: AbortSignal): Promise<string> {
    const spec = await this.readSpec();
    return this.runner.complete(buildFlowPrompt(spec), signal);
  }

  /** Fold new agent activity into the PRD. Advances the checkpoint only on success. */
  private async ingestNow(): Promise<void> {
    try {
      const batch = await this.reader.readNew(this.checkpoint);
      if (!batch.excerpt.trim()) return;
      const current = await this.store.read();
      const diff = await this.gitDiff(this.cwd);
      const raw = await this.runner.complete(buildSyncPrompt(current, batch.excerpt, diff));
      const applied = await applySpecUpdate(this.store, raw, current);
      if (applied.ok) {
        this.checkpoint = { ...this.checkpoint, ...batch.advanced };
        await this.ingest.save(this.checkpoint);
        this.broadcaster.broadcast('spec-updated', applied.result);
      }
    } catch {
      // best-effort; keep the last good PRD and retry the activity next time
    }
  }

  /** Apply a user curation instruction to the PRD immediately. */
  async curate(instruction: string): Promise<void> {
    const text = instruction.trim();
    if (!text) return;
    const current = await this.store.read();
    const diff = await this.gitDiff(this.cwd);
    const raw = await this.runner.complete(buildCuratePrompt(current, text, diff));
    const applied = await applySpecUpdate(this.store, raw, current);
    if (applied.ok) this.broadcaster.broadcast('spec-updated', applied.result);
  }

  /** Run any pending ingest immediately (tests / shutdown). */
  flush(): void {
    this.debouncer.flush();
  }

  stop(): void {
    this.debouncer.cancel();
    this.unwatch?.();
  }
}
```

- [ ] **Step 2: Rewrite `app.ts`** (drop chat/transcript, add curate)

```ts
// src/server/app.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { Session } from './session';

export function createApp(session: Session): Hono {
  const app = new Hono();

  app.post('/api/curate', async (c) => {
    const body = await c.req.json<{ instruction?: string }>();
    const instruction = (body.instruction ?? '').trim();
    if (!instruction) return c.json({ error: 'empty instruction' }, 400);
    await session.curate(instruction);
    return c.json({ ok: true });
  });

  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      const current = await session.readSpec();
      await stream.writeSSE({ event: 'spec-updated', data: JSON.stringify({ md: current, changedLines: [] }) });
      const unsub = session.broadcaster.subscribe((event, data) => {
        void stream.writeSSE({ event, data: JSON.stringify(data) });
      });
      stream.onAbort(() => unsub());
      if (stream.aborted) { unsub(); return; }
      while (!stream.aborted) {
        await stream.sleep(30_000);
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });

  app.get('/api/flow', async (c) => {
    try {
      const mermaid = await session.generateFlow(c.req.raw.signal);
      return c.json({ mermaid });
    } catch (err) {
      return c.json({ error: (err as Error)?.message ?? String(err) }, 500);
    }
  });

  return app;
}
```

- [ ] **Step 3: Rewrite `server.ts`** (wire reader/ingest + `.throughline/prd.md` + migration)

```ts
// src/server/server.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { SpecStore } from '../core/spec-store';
import { IngestStore } from '../core/ingest-store';
import { ClaudeCodeRunner } from '../agent/claude-code-runner';
import { SessionLogReader } from '../agent/session-log-reader';
import { Session } from './session';
import { createApp } from './app';

const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

const cwd = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
  console.error(`Throughline: '${cwd}' is not a directory.`);
  process.exit(1);
}

const prdPath = join(cwd, '.throughline', 'prd.md');
// migrate a legacy root spec.md into .throughline/prd.md on first run
const legacy = join(cwd, 'spec.md');
if (!existsSync(prdPath) && existsSync(legacy)) {
  try { copyFileSync(legacy, prdPath); } catch { /* SpecStore will scaffold instead */ }
}

const session = new Session({
  store: new SpecStore(prdPath),
  runner: new ClaudeCodeRunner({ cwd }),
  reader: new SessionLogReader({ cwd }),
  ingest: new IngestStore(cwd),
  cwd,
});
await session.init();

const app = createApp(session);

const hasUI = existsSync(distDir);
if (hasUI) {
  app.use('/*', serveStatic({ root: distDir }));
}

const port = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, port }, (info) => {
  const url = `http://localhost:${info.port}`;
  console.log(`Throughline → ${url}  (observing ${cwd})`);
  if (process.env.OPEN !== '0' && hasUI) void open(url);
});

const shutdown = () => { session.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
```

> Note: `copyFileSync` into `.throughline/` requires the dir to exist; if `.throughline/` may be absent, the migration is best-effort (wrapped in try/catch) and `SpecStore` scaffolds `DEFAULT_SPEC` otherwise. The first `applySpecUpdate`/`save` creates `.throughline/`. If the migration copy is important, create the dir first with `mkdirSync(dirname(prdPath), { recursive: true })` before the copy.

- [ ] **Step 4: Rewrite `src/server/session.test.ts`** (fake reader + curate)

```ts
// src/server/session.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from '../core/spec-store';
import { IngestStore } from '../core/ingest-store';
import { Session } from './session';
import { ActivityBatch, ActivityReader, ScribeResult } from '../domain/types';

const PRD = `## 📌 개요\n앱\n\n## 🎯 목표\n- 빠름\n\n## ✅ 기능 요구사항\n- [x] 소셜 로그인\n\n## ❓ 미해결 질문\n- 결제?\n`;

class FakeReader implements ActivityReader {
  constructor(private batch: ActivityBatch) {}
  async readNew(): Promise<ActivityBatch> { return this.batch; }
  watch(): () => void { return () => {}; }
}
const completer = (reply: string) => ({ complete: async () => reply });

let dir: string;
let session: Session | undefined;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-')); });
afterEach(async () => { session?.stop(); await rm(dir, { recursive: true, force: true }); });

describe('Session (observer)', () => {
  it('init catches up on activity, writes the PRD, saves the checkpoint, and broadcasts', async () => {
    const store = new SpecStore(join(dir, '.throughline', 'prd.md'));
    const ingest = new IngestStore(dir);
    const reader = new FakeReader({ excerpt: '사용자: 로그인 만들어', advanced: { '/x/s1.jsonl': 42 } });
    session = new Session({ store, runner: completer(PRD), reader, ingest, cwd: dir, gitDiff: async () => 'diff' });

    const updated = new Promise<ScribeResult>((res) =>
      session!.broadcaster.subscribe((ev, d) => { if (ev === 'spec-updated') res(d as ScribeResult); }));

    await session.init();
    await updated;
    expect(await store.read()).toContain('- [x] 소셜 로그인 <!-- id: feat-');
    expect(await ingest.load()).toEqual({ '/x/s1.jsonl': 42 });
  });

  it('curate applies an instruction and broadcasts', async () => {
    const store = new SpecStore(join(dir, '.throughline', 'prd.md'));
    const reader = new FakeReader({ excerpt: '', advanced: {} });
    session = new Session({ store, runner: completer(PRD), reader, ingest: new IngestStore(dir), cwd: dir, gitDiff: async () => '' });
    await session.init();
    const updated = new Promise<ScribeResult>((res) =>
      session!.broadcaster.subscribe((ev, d) => { if (ev === 'spec-updated') res(d as ScribeResult); }));
    await session.curate('리스크 섹션 추가');
    await updated;
    expect(await store.read()).toContain('## ✅ 기능 요구사항');
  });
});
```

- [ ] **Step 5: Rewrite `src/server/app.test.ts`** (curate + flow; chat/transcript gone)

```ts
// src/server/app.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from '../core/spec-store';
import { IngestStore } from '../core/ingest-store';
import { Session } from './session';
import { createApp } from './app';
import { ActivityReader } from '../domain/types';

const idleReader: ActivityReader = { async readNew() { return { excerpt: '', advanced: {} }; }, watch() { return () => {}; } };

let dir: string;
let session: Session | undefined;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-')); });
afterEach(async () => { session?.stop(); await rm(dir, { recursive: true, force: true }); });

function mk(reply = '') {
  return new Session({
    store: new SpecStore(join(dir, '.throughline', 'prd.md')),
    runner: { complete: async () => reply },
    reader: idleReader,
    ingest: new IngestStore(dir),
    cwd: dir,
    gitDiff: async () => '',
  });
}

describe('POST /api/curate', () => {
  it('400s on empty instruction', async () => {
    session = mk();
    const res = await createApp(session).request('/api/curate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: '  ' }),
    });
    expect(res.status).toBe(400);
  });

  it('applies a curation instruction', async () => {
    const PRD = `## 📌 개요\nX\n\n## 🎯 목표\n- a\n\n## ✅ 기능 요구사항\n- [ ] b\n\n## ❓ 미해결 질문\n- c\n`;
    session = mk(PRD);
    const res = await createApp(session).request('/api/curate', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ instruction: '리스크 추가' }),
    });
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('GET /api/flow', () => {
  it('returns { mermaid }', async () => {
    session = mk('flowchart TD\n A-->B');
    const res = await createApp(session).request('/api/flow');
    expect(await res.json()).toEqual({ mermaid: 'flowchart TD\n A-->B' });
  });
});
```

- [ ] **Step 6: Run server tests**

Run: `npm test -- session app`
Expected: PASS. (If `flow` test fails because `stripCodeFence` trims, note the Fake/Completer returns raw text; `generateFlow` uses `runner.complete` which in tests returns the literal — OK.)

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: TSC CLEAN. (`runner.converse`/`ChatPane` still exist but are now unused by the server; removed in Task 6.)

- [ ] **Step 8: Commit**

```bash
git add src/server/session.ts src/server/app.ts src/server/server.ts src/server/session.test.ts src/server/app.test.ts
git commit -m "feat(server): observer engine — ingest session logs into the PRD; /api/curate; .throughline/prd.md"
```

---

## Task 6: Remove the coding-chat plumbing (runner, types, ConversationStore)

**Files:**
- Modify: `src/domain/types.ts` (remove `converse` from `AgentRunner`; remove `ChatEvent`)
- Modify: `src/agent/claude-code-runner.ts`, `src/agent/fake-runner.ts`
- Rewrite: `src/agent/claude-code-runner.test.ts`, `src/agent/fake-runner.test.ts`
- Delete: `src/server/conversation-store.ts`, `src/server/conversation-store.test.ts`

- [ ] **Step 1: Edit `types.ts`** — remove the `ChatEvent` type and the `converse` method from `AgentRunner`. Resulting `AgentRunner`:

```ts
export interface AgentRunner {
  /** One-shot: given the current spec + transcript, returns the full updated spec markdown. */
  scribe(
    currentSpecMarkdown: string,
    transcript: Message[],
    signal?: AbortSignal,
  ): Promise<string>;
  /** Generic one-shot completion for a prompt (sync, curation, flow). */
  complete(prompt: string, signal?: AbortSignal): Promise<string>;
}
```

(Delete the `export type ChatEvent = …` union entirely.)

- [ ] **Step 2: Rewrite `claude-code-runner.ts`** (collect text only, no events)

```ts
// src/agent/claude-code-runner.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner, Message } from '../domain/types';
import { buildScribePrompt } from '../domain/scribe-prompt';

function abortControllerFor(signal?: AbortSignal): AbortController | undefined {
  if (!signal) return undefined;
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', () => controller.abort(), { once: true });
  return controller;
}

function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fence ? fence[1] : trimmed;
}

async function collect(prompt: string, cwd: string | undefined, signal?: AbortSignal): Promise<string> {
  let full = '';
  for await (const msg of query({ prompt, options: { cwd, abortController: abortControllerFor(signal) } })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') full += block.text;
      }
    }
  }
  return full;
}

export class ClaudeCodeRunner implements AgentRunner {
  constructor(private options: { cwd?: string } = {}) {}

  async scribe(currentSpecMarkdown: string, transcript: Message[], signal?: AbortSignal): Promise<string> {
    return stripCodeFence(await collect(buildScribePrompt(currentSpecMarkdown, transcript), this.options.cwd, signal));
  }

  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    return stripCodeFence(await collect(prompt, this.options.cwd, signal));
  }
}
```

- [ ] **Step 3: Rewrite `claude-code-runner.test.ts`** (test `complete`)

```ts
// src/agent/claude-code-runner.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () =>
    (async function* () {
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '추가' }, { type: 'text', text: '했어요' }] },
      };
    })(),
}));

import { ClaudeCodeRunner } from './claude-code-runner';

describe('ClaudeCodeRunner.complete', () => {
  it('concatenates assistant text blocks', async () => {
    const runner = new ClaudeCodeRunner({ cwd: '/tmp' });
    expect(await runner.complete('prompt')).toBe('추가했어요');
  });
});
```

- [ ] **Step 4: Edit `fake-runner.ts`** — remove `converse`, `chatEvents`, `converseReply`. Resulting file:

```ts
// src/agent/fake-runner.ts
import { AgentRunner, Message } from '../domain/types';

type ScribeReply = string | ((cur: string, transcript: Message[]) => string);
type CompleteReply = string | ((prompt: string) => string);

export class FakeAgentRunner implements AgentRunner {
  constructor(private opts: { scribeReply?: ScribeReply; completeReply?: CompleteReply } = {}) {}

  async scribe(cur: string, transcript: Message[]): Promise<string> {
    const r = this.opts.scribeReply ?? cur;
    return typeof r === 'function' ? r(cur, transcript) : r;
  }

  async complete(prompt: string): Promise<string> {
    const r = this.opts.completeReply ?? '';
    return typeof r === 'function' ? r(prompt) : r;
  }
}
```

- [ ] **Step 5: Edit `fake-runner.test.ts`** — delete the two `converse` tests; keep the `scribe` and `complete` tests. The file becomes:

```ts
// src/agent/fake-runner.test.ts
import { describe, it, expect } from 'vitest';
import { FakeAgentRunner } from './fake-runner';

describe('FakeAgentRunner', () => {
  it('returns a scripted scribe reply, supporting a function form', async () => {
    const runner = new FakeAgentRunner({ scribeReply: (cur) => cur + '\n## ✅ 기능 요구사항\n- [ ] 새 기능' });
    expect(await runner.scribe('## 📌 개요', [])).toBe('## 📌 개요\n## ✅ 기능 요구사항\n- [ ] 새 기능');
  });

  it('returns a scripted complete() reply, supporting a function form', async () => {
    expect(await new FakeAgentRunner({ completeReply: 'flowchart TD\n  A-->B' }).complete('x')).toBe('flowchart TD\n  A-->B');
    expect(await new FakeAgentRunner({ completeReply: (p) => `len:${p.length}` }).complete('abc')).toBe('len:3');
  });
});
```

- [ ] **Step 6: Delete ConversationStore**

```bash
git rm src/server/conversation-store.ts src/server/conversation-store.test.ts
```

- [ ] **Step 7: Run the full suite + typecheck**

Run: `npm test && npx tsc --noEmit`
Expected: all PASS, TSC CLEAN. (No file should still import `converse`, `ChatEvent`, or `ConversationStore` — grep to confirm: `grep -rn "converse\|ChatEvent\|ConversationStore" src` returns nothing.)

- [ ] **Step 8: Commit**

```bash
git add -A src/domain/types.ts src/agent
git commit -m "refactor: remove coding-chat plumbing (converse, ChatEvent, ConversationStore)"
```

---

## Task 7: Frontend — doc-centric layout, ScribeChat, remove chat

No frontend unit tests exist; verify with `tsc` + `build:web` + a headless browser smoke.

**Files:**
- Modify: `src/web/api.ts`, `src/web/App.tsx`, `src/web/styles.css`
- Create: `src/web/ScribeChat.tsx`, `src/web/MainView.tsx`
- Delete: `src/web/ChatPane.tsx`, `src/web/RightPane.tsx`, `src/web/ResizableDivider.tsx`

- [ ] **Step 1: Rewrite `api.ts`** (drop chat; add curate)

```ts
// src/web/api.ts
export type SpecUpdate = { md: string; changedLines: number[] };

/** Subscribe to live PRD updates over SSE. */
export function subscribeSpec(onSpec: (u: SpecUpdate) => void): () => void {
  const es = new EventSource('/api/events');
  es.addEventListener('spec-updated', (e) => onSpec(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}

/** Send a curation instruction to the scribe. */
export async function curate(instruction: string): Promise<void> {
  await fetch('/api/curate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instruction }),
  });
}
```

- [ ] **Step 2: Create `ScribeChat.tsx`**

```tsx
// src/web/ScribeChat.tsx
import { useState, type FormEvent, type KeyboardEvent } from 'react';
import { curate } from './api';
import { Icons } from './icons';

export function ScribeChat() {
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    setBusy(true);
    try { await curate(text); } catch { /* SSE will reflect changes; ignore */ } finally { setBusy(false); }
  }
  function onSubmit(e: FormEvent) { e.preventDefault(); void send(); }
  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send(); }
  }

  return (
    <form className="tl-composer tl-scribe" onSubmit={onSubmit}>
      <textarea
        className="tl-composer-input"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="문서를 다듬어 보세요 — 예: 리스크 섹션 추가, 이 요구사항 수정…"
        rows={1}
        disabled={busy}
      />
      <div className="tl-composer-row">
        <span className="sp" />
        <button type="submit" className="tl-send" disabled={busy || !input.trim()} aria-label="보내기">{Icons.send}</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Create `MainView.tsx`** (primary region: head + doc/flow/preview body + scribe dock)

```tsx
// src/web/MainView.tsx
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { PreviewView } from './PreviewView';
import { ScribeChat } from './ScribeChat';
import { Icons } from './icons';
import type { ViewId } from './ViewRail';

function stripFrontmatter(md: string): string {
  const m = /^\s*---\n[\s\S]*?\n---\s*\n?/.exec(md);
  return m ? md.slice(m[0].length) : md;
}

export function MainView({
  activeView,
  md,
  onToggleSidebar,
}: {
  activeView: ViewId;
  md: string;
  onToggleSidebar: () => void;
}) {
  return (
    <section className="tl-region tl-main">
      <div className="tl-view-head">
        <button className="tl-toggle" type="button" title="사이드바" aria-label="사이드바 토글" onClick={onToggleSidebar}>{Icons.toggle}</button>
        {activeView === 'doc' && <><span className="tl-view-name">{Icons.doc}문서</span><span className="sp" /><span className="tl-sync"><span className="pulse" />자동 동기화됨</span></>}
        {activeView === 'flow' && <><span className="tl-view-name">{Icons.flow}플로우</span><span className="sp" /></>}
        {activeView === 'preview' && <><span className="tl-view-name">{Icons.preview}프리뷰</span><span className="sp" /></>}
      </div>

      {activeView === 'doc' && (
        <>
          <div className="tl-doc">
            <div className="tl-doc-inner">
              <div className="tl-doc-kicker">PRD · 자동 생성</div>
              {md.trim()
                ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(md)}</ReactMarkdown>
                : <p className="tl-doc-empty">터미널에서 작업을 시작하면 PRD가 여기에 자동으로 쌓입니다.</p>}
            </div>
          </div>
          <div className="tl-dock"><ScribeChat /></div>
        </>
      )}
      {activeView === 'flow' && <div className="tl-flow-empty" />}
      {activeView === 'preview' && <PreviewView />}
    </section>
  );
}
```

- [ ] **Step 4: Rewrite `App.tsx`** (no chat, no divider; doc is primary)

```tsx
// src/web/App.tsx
import { useCallback, useEffect, useState } from 'react';
import { subscribeSpec } from './api';
import { Sidebar } from './Sidebar';
import { MainView } from './MainView';
import { ViewRail, type ViewId } from './ViewRail';

const SIDEBAR_KEY = 'throughline.sidebarOpen';

export function App() {
  const [activeView, setActiveView] = useState<ViewId>('doc');
  const [sidebarOpen, setSidebarOpen] = useState(() => localStorage.getItem(SIDEBAR_KEY) !== '0');
  const [md, setMd] = useState('');

  useEffect(() => subscribeSpec((u) => setMd(u.md)), []);

  const toggleSidebar = useCallback(() => {
    setSidebarOpen((open) => {
      const next = !open;
      localStorage.setItem(SIDEBAR_KEY, next ? '1' : '0');
      return next;
    });
  }, []);

  return (
    <div className="tl" data-variant="cards" data-theme="light">
      {sidebarOpen ? <Sidebar /> : null}
      <MainView activeView={activeView} md={md} onToggleSidebar={toggleSidebar} />
      <ViewRail active={activeView} onToggle={setActiveView} />
    </div>
  );
}
```

> `ViewRail`'s `onToggle: (v: ViewId) => void` is satisfied by `setActiveView`. The rail now always has an active view (no close). `active` is `ViewId` (never null) — `ViewRail`'s prop type already accepts `ViewId | null`, so no change needed there.

- [ ] **Step 5: Update `styles.css`** — add the primary-region + scribe styles (append):

```css
/* model B: doc-centric main region */
.tl-main { flex: 1; min-width: 0; overflow: hidden; }
.tl-main .tl-doc { flex: 1; }
.tl-scribe { margin: 0 auto; }
```

(The `.tl-main` reuses the `.tl-region` card styling. `.tl-doc`, `.tl-dock`, `.tl-composer`, `.tl-view-head`, `.tl-flow-empty`, preview styles already exist from SP-D.)

- [ ] **Step 6: Delete the chat-era components**

```bash
git rm src/web/ChatPane.tsx src/web/RightPane.tsx src/web/ResizableDivider.tsx
```

- [ ] **Step 7: Typecheck + build**

Run: `npx tsc --noEmit && npm run build:web`
Expected: TSC CLEAN; build succeeds. Confirm no dangling imports: `grep -rn "ChatPane\|RightPane\|ResizableDivider\|sendChat\|fetchTranscript" src/web` returns nothing.

- [ ] **Step 8: Commit**

```bash
git add -A src/web
git commit -m "feat(web): doc-centric layout + ScribeChat; remove coding chat UI"
```

---

## Task 8: End-to-end browser smoke

**Files:** none (verification only)

- [ ] **Step 1: Build**

Run: `npm run build:web`
Expected: success.

- [ ] **Step 2: Start the server against a throwaway project on a free port**

```bash
TP=$(mktemp -d)
PORT=5188 OPEN=0 ./node_modules/.bin/tsx src/server/server.ts "$TP" &
SRV=$!
sleep 2
```

- [ ] **Step 3: Headless smoke** (write `/tmp/tl-b.mjs`, run with `node`)

```js
import pkg from './node_modules/playwright/index.js';
const { chromium } = pkg;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
const errs = []; p.on('pageerror', e => errs.push(e.message)); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
await p.goto('http://localhost:5188', { waitUntil: 'domcontentloaded' });
await p.waitForSelector('.tl-main', { timeout: 8000 });
console.log('doc headings:', JSON.stringify(await p.locator('.tl-doc h2').allInnerTexts()));
console.log('scribe input present:', await p.locator('.tl-scribe .tl-composer-input').count() === 1);
console.log('no coding chat:', await p.locator('.tl-thread').count() === 0);
// rail toggles
await p.locator('.tl-rail-btn[aria-label="프리뷰"]').click();
console.log('preview view:', await p.locator('.tl-pv-empty').count() === 1);
console.log('errors:', errs.length, errs.slice(0,3));
await b.close();
```

Run: `node /tmp/tl-b.mjs`
Expected: the 4 PRD headings render (📌 개요 / 🎯 목표 / ✅ 기능 요구사항 / ❓ 미해결 질문), scribe input present, no `.tl-thread`, preview toggles, **0 console errors**.

- [ ] **Step 4: Stop the server + clean up**

```bash
kill $SRV; rm -rf "$TP" /tmp/tl-b.mjs
```

- [ ] **Step 5: Commit (if any verification fixups were needed)** — otherwise nothing to commit.

---

## Self-Review

**Spec coverage:**
- §3 persistence (`.throughline/prd.md` + `ingest-state.json`) → Tasks 4 (IngestStore), 5 (server `prdPath`, migration).
- §4.1 SessionLogReader (encode dir, agent-* exclusion, offset read, partial-line safe, message/tool extraction, watch) → Task 3.
- §4.2 ingestion + checkpoint + accumulation (load PRD, catch-up, advance only on success) → Task 5 (`Session.init`/`ingestNow`).
- §4.3 scribe-chat `/api/curate` → Tasks 1 (prompt), 5 (`Session.curate`, route), 7 (`ScribeChat`).
- §4.4 removals (chat, transcript, converse, ConversationStore) → Tasks 5 (routes), 6 (runner/types/store), 7 (UI).
- §5 doc-centric layout → Task 7.
- §6 data flow (startup/live/curation) → Tasks 5, 7.
- §7 error handling (no dir, malformed line, no activity, scribe failure best-effort, corrupt checkpoint) → Tasks 3 (partial-line, parse skip), 4 (corrupt → {}), 5 (empty excerpt no-op, try/catch keeps last good, advance-on-success).
- §8 testing → tests in Tasks 1–6 + browser smoke Task 8.
- §10 migration (legacy spec.md → prd.md) → Task 5 Step 3.

**Placeholder scan:** none — every step has full code/commands.

**Type consistency:** `ActivityBatch {excerpt, advanced}` and `ActivityReader {readNew, watch}` defined in Task 2, used identically in Tasks 3/5. `Completer {complete}` in Session matches `AgentRunner.complete`. `SpecStore(prdPath)` path consistent (`.throughline/prd.md`). `IngestStore(cwd)` → `.throughline/ingest-state.json` consistent. `ViewId` from `ViewRail` reused in `MainView`. Checkpoint keys = absolute session-file paths in both reader and store.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-06-02-throughline-model-b-pivot.md`. Two execution options:

1. **Subagent-Driven (recommended)** — a fresh subagent per task, with review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints.

Which approach?
