# Throughline — Multi-View Workspace + Live Preview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the fixed chat｜spec split into a chat-first workspace where a top-right toolbar summons a resizable right pane showing one of three views — 📄 document, 🔀 AI-generated user-flow (mermaid), 👁 live preview (iframe of the user's dev server).

**Architecture:** Add a generic `complete(prompt)` to `AgentRunner`, a `flow-prompt` builder, `Session.generateFlow()`, and `GET /api/flow`. On the frontend, refactor `App` to manage `activeView` + resizable split, add `ViewToolbar`/`ResizableDivider`/`RightPane`/`FlowView`/`PreviewView`, and reuse `SpecPane` as the document view.

**Tech Stack:** Existing engine + Hono/Vite/React, plus `mermaid` for client-side flow rendering.

**Builds on:** the merged MVP (`docs/superpowers/specs/2026-06-01-throughline-multiview-workspace-design.md`). Reuses `Message`/`AgentRunner` (`src/domain/types.ts`), `FakeAgentRunner`, `ClaudeCodeRunner`, `Session`, `createApp`, `SpecPane`, `api.ts`.

---

## File Structure

```
src/
  domain/
    flow-prompt.ts          # NEW: buildFlowPrompt(specMd)
    flow-prompt.test.ts     # NEW
    types.ts                # MODIFY: add complete() to AgentRunner
  agent/
    fake-runner.ts          # MODIFY: add complete()
    fake-runner.test.ts     # MODIFY: test complete()
    claude-code-runner.ts   # MODIFY: add complete()
  core/
    scribe-engine.test.ts   # MODIFY: throwingRunner gets a complete() stub (interface grew)
  server/
    session.ts              # MODIFY: add generateFlow()
    session.test.ts         # MODIFY: test generateFlow()
    app.ts                  # MODIFY: add GET /api/flow
    app.test.ts             # MODIFY: test /api/flow (ok + error)
  web/
    api.ts                  # MODIFY: add fetchFlow()
    ViewToolbar.tsx         # NEW
    ResizableDivider.tsx    # NEW
    RightPane.tsx           # NEW
    FlowView.tsx            # NEW
    PreviewView.tsx         # NEW
    App.tsx                 # MODIFY: view state + split
    styles.css              # MODIFY: full rewrite for the new layout
package.json                # MODIFY: add mermaid
```

`SpecPane.tsx`, `ChatPane.tsx` are unchanged (reused).

---

## Task 1: Add generic `complete()` to AgentRunner

Adding a method to the `AgentRunner` interface forces every implementation to provide it. Two implementations exist (`FakeAgentRunner`, `ClaudeCodeRunner`) plus one inline stub in `scribe-engine.test.ts` — all must be updated in this task or `tsc` breaks.

**Files:**
- Modify: `src/domain/types.ts`, `src/agent/fake-runner.ts`, `src/agent/claude-code-runner.ts`, `src/core/scribe-engine.test.ts`
- Test: `src/agent/fake-runner.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/agent/fake-runner.test.ts` (inside the existing `describe('FakeAgentRunner', () => { ... })`, before its closing `});`):

```ts
  it('returns a scripted complete() reply, supporting a function form', async () => {
    const runner = new FakeAgentRunner({ completeReply: 'flowchart TD\n  A-->B' });
    expect(await runner.complete('any prompt')).toBe('flowchart TD\n  A-->B');

    const dynamic = new FakeAgentRunner({ completeReply: (p) => `len:${p.length}` });
    expect(await dynamic.complete('abc')).toBe('len:3');
  });
```

- [ ] **Step 2: Run it and confirm FAIL** — `npx vitest run src/agent/fake-runner.test.ts` → fails (no `complete` / `completeReply`).

- [ ] **Step 3a: Add to the interface** — in `src/domain/types.ts`, inside `export interface AgentRunner { ... }`, after the `scribe(...)` member, add:

```ts
  /** Generic one-shot completion for a prompt (used for derived artifacts like the user-flow diagram). */
  complete(prompt: string, signal?: AbortSignal): Promise<string>;
```

- [ ] **Step 3b: Implement in the fake** — in `src/agent/fake-runner.ts`, replace the file with:

```ts
// src/agent/fake-runner.ts
import { AgentRunner, Message } from '../domain/types';

type ScribeReply = string | ((cur: string, transcript: Message[]) => string);
type CompleteReply = string | ((prompt: string) => string);

export class FakeAgentRunner implements AgentRunner {
  constructor(
    private opts: {
      converseReply?: string;
      scribeReply?: ScribeReply;
      completeReply?: CompleteReply;
    } = {},
  ) {}

  async converse(
    _transcript: Message[],
    onToken: (t: string) => void,
  ): Promise<string> {
    const reply = this.opts.converseReply ?? 'ok';
    for (const ch of reply) onToken(ch);
    return reply;
  }

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

- [ ] **Step 3c: Implement in the real runner** — in `src/agent/claude-code-runner.ts`, add this method inside the `ClaudeCodeRunner` class (after `scribe`), reusing the existing `collectAssistantText` and `stripCodeFence` helpers already in that file:

```ts
  async complete(prompt: string, signal?: AbortSignal): Promise<string> {
    const text = await collectAssistantText(prompt, this.options.cwd, undefined, signal);
    return stripCodeFence(text);
  }
```

- [ ] **Step 3d: Fix the inline stub** — in `src/core/scribe-engine.test.ts`, the `throwingRunner` object literal is typed as `AgentRunner` and now lacks `complete`. Find:

```ts
    const throwingRunner = {
      converse: async () => '',
      scribe: async () => {
        throw new Error('network down');
      },
    };
```
and replace with:

```ts
    const throwingRunner = {
      converse: async () => '',
      scribe: async () => {
        throw new Error('network down');
      },
      complete: async () => '',
    };
```

- [ ] **Step 4: Run tests + typecheck** — `npx vitest run` (all pass, fake-runner now 3 tests) and `npx tsc --noEmit` (clean — confirms every AgentRunner implementor has `complete`).

- [ ] **Step 5: Commit**

```bash
git add src/domain/types.ts src/agent/fake-runner.ts src/agent/fake-runner.test.ts src/agent/claude-code-runner.ts src/core/scribe-engine.test.ts
git commit -m "feat: add generic complete() to AgentRunner"
```

---

## Task 2: Flow prompt builder

**Files:**
- Create: `src/domain/flow-prompt.ts`, `src/domain/flow-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/flow-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildFlowPrompt } from './flow-prompt';

describe('buildFlowPrompt', () => {
  it('embeds the spec and demands mermaid-only flowchart output', () => {
    const prompt = buildFlowPrompt('## ✅ 핵심 기능\n- [ ] 소셜 로그인');
    expect(prompt).toContain('## ✅ 핵심 기능');
    expect(prompt).toContain('소셜 로그인');
    expect(prompt).toContain('flowchart TD');
    expect(prompt).toContain('mermaid');
    expect(prompt).toContain('코드만'); // "오직 mermaid 코드만"
  });
});
```

- [ ] **Step 2: Run and confirm FAIL** — `npx vitest run src/domain/flow-prompt.test.ts`.

- [ ] **Step 3: Implement**

```ts
// src/domain/flow-prompt.ts
export function buildFlowPrompt(specMd: string): string {
  return [
    '아래 기획서를 바탕으로 제품의 핵심 유저 플로우를 mermaid flowchart로 그려라.',
    '규칙:',
    '1) 출력은 오직 mermaid 코드만. 설명 문장, 코드펜스(```), 그 외 텍스트는 절대 넣지 않는다.',
    '2) 첫 줄은 "flowchart TD" 로 시작한다.',
    '3) 노드 라벨은 한국어로 짧게. 화면/단계 전환을 화살표(-->)로 잇는다.',
    '4) 아직 정해지지 않은 부분은 무리해서 만들지 말고, 알려진 흐름만 그린다.',
    '',
    '기획서:',
    '"""',
    specMd,
    '"""',
  ].join('\n');
}
```

- [ ] **Step 4: Run and confirm 1/1 PASS**; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/domain/flow-prompt.ts src/domain/flow-prompt.test.ts
git commit -m "feat: user-flow mermaid prompt builder"
```

---

## Task 3: Session.generateFlow()

**Files:**
- Modify: `src/server/session.ts`, `src/server/session.test.ts`

- [ ] **Step 1: Write the failing test** — append inside the existing `describe('Session', () => { ... })` in `src/server/session.test.ts`, before its closing `});`:

```ts
  it('generateFlow returns the runner completion for the current spec', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    await store.write('## ✅ 핵심 기능\n- [ ] 소셜 로그인\n');
    const runner = new FakeAgentRunner({
      completeReply: (prompt) =>
        prompt.includes('소셜 로그인') ? 'flowchart TD\n  로그인-->홈' : 'EMPTY',
    });
    session = new Session({ store, runner });

    expect(await session.generateFlow()).toBe('flowchart TD\n  로그인-->홈');
  });
```

- [ ] **Step 2: Run and confirm FAIL** — `npx vitest run src/server/session.test.ts` (no `generateFlow`).

- [ ] **Step 3: Implement** — in `src/server/session.ts`:

  a. Add the import near the other domain imports at the top:
```ts
import { buildFlowPrompt } from '../domain/flow-prompt';
```
  b. Add this method to the `Session` class, right after the existing `readSpec()` method:
```ts
  /** Generate a fresh mermaid user-flow from the current spec (one-shot AI call). */
  async generateFlow(signal?: AbortSignal): Promise<string> {
    const spec = await this.readSpec();
    return this.runner.complete(buildFlowPrompt(spec), signal);
  }
```

- [ ] **Step 4: Run and confirm PASS** — `npx vitest run src/server/session.test.ts`; `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/server/session.ts src/server/session.test.ts
git commit -m "feat: Session.generateFlow from current spec"
```

---

## Task 4: GET /api/flow

**Files:**
- Modify: `src/server/app.ts`, `src/server/app.test.ts`

- [ ] **Step 1: Write the failing test** — append to `src/server/app.test.ts`. Add a new `describe` block after the existing one (it reuses the same imports + `dir`/`session` setup already at the top of the file):

```ts
describe('createApp GET /api/flow', () => {
  it('returns { mermaid } from the session', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    await store.write('## ✅ 핵심 기능\n- [ ] 소셜 로그인\n');
    const runner = new FakeAgentRunner({ completeReply: 'flowchart TD\n  A-->B' });
    session = new Session({ store, runner });
    const app = createApp(session);

    const res = await app.request('/api/flow');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mermaid: 'flowchart TD\n  A-->B' });
  });

  it('returns { error } with 500 when generation throws', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    const runner = {
      converse: async () => '',
      scribe: async () => '',
      complete: async () => {
        throw new Error('model down');
      },
    };
    session = new Session({ store, runner });
    const app = createApp(session);

    const res = await app.request('/api/flow');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'model down' });
  });
});
```

- [ ] **Step 2: Run and confirm FAIL** — `npx vitest run src/server/app.test.ts`.

- [ ] **Step 3: Implement** — in `src/server/app.ts`, add this route inside `createApp`, after the `app.get('/api/events', ...)` block and before `return app;`:

```ts
  app.get('/api/flow', async (c) => {
    try {
      const mermaid = await session.generateFlow();
      return c.json({ mermaid });
    } catch (err) {
      return c.json({ error: (err as Error)?.message ?? String(err) }, 500);
    }
  });
```

- [ ] **Step 4: Run and confirm PASS** — `npx vitest run src/server/app.test.ts`; `npx tsc --noEmit` clean; `npm test` (full suite green).

- [ ] **Step 5: Commit**

```bash
git add src/server/app.ts src/server/app.test.ts
git commit -m "feat: GET /api/flow endpoint"
```

---

## Task 5: Frontend deps + fetchFlow client

**Files:**
- Modify: `package.json` (add `mermaid`), `src/web/api.ts`

- [ ] **Step 1: Install mermaid**

```bash
npm install mermaid
```
If the latest `mermaid` requires a peer that conflicts, install a 11.x version explicitly and note it.

- [ ] **Step 2: Add `fetchFlow` to `src/web/api.ts`** — append at the end of the file:

```ts
/** Fetch a freshly generated mermaid user-flow for the current spec. */
export async function fetchFlow(): Promise<string> {
  const res = await fetch('/api/flow');
  const data = (await res.json()) as { mermaid?: string; error?: string };
  if (!res.ok || data.error) {
    throw new Error(data.error ?? `flow request failed (${res.status})`);
  }
  return data.mermaid ?? '';
}
```

- [ ] **Step 3: Verify** — `npx tsc --noEmit` clean; `npm run build:web` clean.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src/web/api.ts
git commit -m "feat: add mermaid + fetchFlow client"
```

---

## Task 6: ViewToolbar

**Files:**
- Create: `src/web/ViewToolbar.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/web/ViewToolbar.tsx
export type ViewId = 'doc' | 'flow' | 'preview';

const VIEWS: { id: ViewId; icon: string; label: string }[] = [
  { id: 'doc', icon: '📄', label: '문서' },
  { id: 'flow', icon: '🔀', label: '플로우' },
  { id: 'preview', icon: '👁', label: '프리뷰' },
];

export function ViewToolbar({
  active,
  onToggle,
}: {
  active: ViewId | null;
  onToggle: (v: ViewId) => void;
}) {
  return (
    <div className="view-toolbar">
      {VIEWS.map((v) => (
        <button
          key={v.id}
          className={`view-btn ${active === v.id ? 'active' : ''}`}
          onClick={() => onToggle(v.id)}
        >
          <span aria-hidden>{v.icon}</span> {v.label}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run build:web` clean.

- [ ] **Step 3: Commit**

```bash
git add src/web/ViewToolbar.tsx
git commit -m "feat: ViewToolbar (top-right view switcher)"
```

---

## Task 7: ResizableDivider

**Files:**
- Create: `src/web/ResizableDivider.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/web/ResizableDivider.tsx
import { useEffect, useRef } from 'react';

/** A vertical drag handle. Reports the desired RIGHT-pane width as a percentage of the window. */
export function ResizableDivider({
  onResize,
}: {
  onResize: (rightPercent: number) => void;
}) {
  const dragging = useRef(false);

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return;
      const rightPercent = ((window.innerWidth - e.clientX) / window.innerWidth) * 100;
      onResize(rightPercent);
    }
    function onUp() {
      dragging.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [onResize]);

  return (
    <div
      className="divider"
      onMouseDown={() => {
        dragging.current = true;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
      }}
    />
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run build:web` clean.

- [ ] **Step 3: Commit**

```bash
git add src/web/ResizableDivider.tsx
git commit -m "feat: ResizableDivider"
```

---

## Task 8: PreviewView

**Files:**
- Create: `src/web/PreviewView.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/web/PreviewView.tsx
import { useState, type FormEvent } from 'react';

const URL_KEY = 'throughline.previewUrl';

export function PreviewView() {
  const [url, setUrl] = useState(() => localStorage.getItem(URL_KEY) ?? '');
  const [draft, setDraft] = useState(url);
  const [reloadKey, setReloadKey] = useState(0);

  function load(e: FormEvent) {
    e.preventDefault();
    const next = draft.trim();
    setUrl(next);
    localStorage.setItem(URL_KEY, next);
    setReloadKey((k) => k + 1);
  }

  return (
    <section className="preview">
      <form className="url-bar" onSubmit={load}>
        <span aria-hidden>👁</span>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="http://localhost:3000"
        />
        <button type="submit">열기</button>
        {url ? (
          <button type="button" title="새로고침" onClick={() => setReloadKey((k) => k + 1)}>
            ⟳
          </button>
        ) : null}
      </form>
      <div className="preview-body">
        {url ? (
          <iframe key={reloadKey} src={url} title="preview" className="preview-frame" />
        ) : (
          <p className="empty">
            로컬 개발 서버 주소를 입력하면 여기서 바로 보여요 (예: http://localhost:3000).
            <br />
            일부 앱은 임베드를 차단할 수 있어요 — 프록시 지원은 다음 단계입니다.
          </p>
        )}
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run build:web` clean.

- [ ] **Step 3: Commit**

```bash
git add src/web/PreviewView.tsx
git commit -m "feat: PreviewView (iframe live preview)"
```

---

## Task 9: FlowView

**Files:**
- Create: `src/web/FlowView.tsx`

> Implementer note: verify the mermaid API against the installed version. In mermaid v10/v11, `mermaid.initialize(config)` and `await mermaid.render(id, code)` returning `{ svg }` is correct. If the installed version differs, read `node_modules/mermaid/dist/mermaid.d.ts` and adjust (do not guess).

- [ ] **Step 1: Implement**

```tsx
// src/web/FlowView.tsx
import { useEffect, useRef, useState } from 'react';
import mermaid from 'mermaid';
import { fetchFlow } from './api';

mermaid.initialize({ startOnLoad: false, theme: 'neutral' });

export function FlowView({ specRevision }: { specRevision: number }) {
  const [svg, setSvg] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const renderId = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchFlow()
      .then(async (code) => {
        if (cancelled) return;
        try {
          const out = await mermaid.render(`flow-${renderId.current++}`, code.trim());
          if (cancelled) return;
          setSvg(out.svg);
          setLoading(false);
        } catch {
          if (cancelled) return;
          setError(`다이어그램 파싱에 실패했어요. 원문:\n\n${code}`);
          setLoading(false);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError((e as Error).message || '플로우 생성에 실패했어요.');
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [specRevision, retry]);

  return (
    <section className="flow">
      <header className="view-head">
        <span>🔀 유저 플로우</span>
        {loading ? <span className="badge">생성 중…</span> : null}
      </header>
      <div className="flow-body">
        {error ? (
          <div className="flow-error">
            <p>
              플로우를 만들지 못했어요.{' '}
              <button onClick={() => setRetry((r) => r + 1)}>다시 시도</button>
            </p>
            <pre>{error}</pre>
          </div>
        ) : null}
        <div className="mermaid-host" dangerouslySetInnerHTML={{ __html: svg }} />
      </div>
    </section>
  );
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run build:web` clean. (If the mermaid render signature differs, apply the note above.)

- [ ] **Step 3: Commit**

```bash
git add src/web/FlowView.tsx
git commit -m "feat: FlowView (mermaid render + auto-refresh while open)"
```

---

## Task 10: RightPane

**Files:**
- Create: `src/web/RightPane.tsx`

- [ ] **Step 1: Implement**

```tsx
// src/web/RightPane.tsx
import { SpecPane } from './SpecPane';
import { FlowView } from './FlowView';
import { PreviewView } from './PreviewView';
import type { ViewId } from './ViewToolbar';

export function RightPane({
  activeView,
  md,
  changedLines,
  specRevision,
}: {
  activeView: ViewId;
  md: string;
  changedLines: number[];
  specRevision: number;
}) {
  if (activeView === 'doc') return <SpecPane md={md} changedLines={changedLines} />;
  if (activeView === 'flow') return <FlowView specRevision={specRevision} />;
  return <PreviewView />;
}
```

- [ ] **Step 2: Verify** — `npx tsc --noEmit` clean; `npm run build:web` clean.

- [ ] **Step 3: Commit**

```bash
git add src/web/RightPane.tsx
git commit -m "feat: RightPane view switch"
```

---

## Task 11: App rewrite + styles + manual smoke

**Files:**
- Modify: `src/web/App.tsx`, `src/web/styles.css`

- [ ] **Step 1: Replace `src/web/App.tsx`** with:

```tsx
// src/web/App.tsx
import { useCallback, useEffect, useState } from 'react';
import { subscribeSpec } from './api';
import { ChatPane } from './ChatPane';
import { ViewToolbar, type ViewId } from './ViewToolbar';
import { ResizableDivider } from './ResizableDivider';
import { RightPane } from './RightPane';

const SPLIT_KEY = 'throughline.splitWidth';

function initialSplit(): number {
  const saved = Number(localStorage.getItem(SPLIT_KEY));
  return saved >= 20 && saved <= 80 ? saved : 50;
}

export function App() {
  const [md, setMd] = useState('');
  const [changedLines, setChangedLines] = useState<number[]>([]);
  const [specRevision, setSpecRevision] = useState(0);
  const [activeView, setActiveView] = useState<ViewId | null>(null);
  const [splitWidth, setSplitWidth] = useState(initialSplit);

  useEffect(
    () =>
      subscribeSpec((u) => {
        setMd(u.md);
        setChangedLines(u.changedLines);
        setSpecRevision((r) => r + 1);
      }),
    [],
  );

  const toggle = useCallback((view: ViewId) => {
    setActiveView((cur) => (cur === view ? null : view));
  }, []);

  const onResize = useCallback((rightPercent: number) => {
    const clamped = Math.min(80, Math.max(20, rightPercent));
    setSplitWidth(clamped);
    localStorage.setItem(SPLIT_KEY, String(clamped));
  }, []);

  const open = activeView !== null;

  return (
    <div className="app">
      <div className="chat-col" style={open ? { flexBasis: `${100 - splitWidth}%` } : { flex: 1 }}>
        <ChatPane />
      </div>
      {open ? (
        <>
          <ResizableDivider onResize={onResize} />
          <div className="view-col" style={{ flexBasis: `${splitWidth}%` }}>
            <RightPane
              activeView={activeView}
              md={md}
              changedLines={changedLines}
              specRevision={specRevision}
            />
          </div>
        </>
      ) : null}
      <ViewToolbar active={activeView} onToggle={toggle} />
    </div>
  );
}
```

- [ ] **Step 2: Replace `src/web/styles.css`** with:

```css
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, system-ui, "Apple SD Gothic Neo", sans-serif; color: #111; }
.app { display: flex; height: 100vh; position: relative; }
.empty { color: #94a3b8; }

/* columns */
.chat-col { display: flex; min-width: 0; height: 100%; }
.view-col { display: flex; min-width: 0; height: 100%; border-left: 1px solid #e2e8f0; }

/* top-right floating view toolbar */
.view-toolbar { position: absolute; top: 8px; right: 12px; display: flex; gap: 6px; z-index: 10; }
.view-btn { display: flex; align-items: center; gap: 4px; padding: 4px 10px; font-size: 12px; border: 1px solid #d8dee9; border-radius: 16px; background: rgba(255,255,255,0.92); color: #475569; cursor: pointer; }
.view-btn.active { border-color: #2f6df6; background: #eaf1ff; color: #2f6df6; font-weight: 700; }

/* resize divider */
.divider { flex: 0 0 6px; background: #e2e8f0; cursor: col-resize; }
.divider:hover { background: #cbd5e1; }

/* left: chat fills its column */
.chat { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #eef2f7; }
.chat-log { flex: 1; overflow-y: auto; padding: 16px; padding-top: 46px; display: flex; flex-direction: column; gap: 8px; }
.bubble { max-width: 85%; padding: 8px 12px; border-radius: 12px; white-space: pre-wrap; line-height: 1.5; }
.bubble.user { align-self: flex-end; background: #dbe4f0; }
.bubble.assistant { align-self: flex-start; background: #fff; border: 1px solid #e2e8f0; }
.composer { display: flex; gap: 8px; padding: 12px; border-top: 1px solid #d8dee9; background: #f6f8fb; }
.composer input { flex: 1; padding: 10px 12px; border: 1px solid #d8dee9; border-radius: 18px; font-size: 14px; }
.composer button { padding: 0 16px; border: none; border-radius: 18px; background: #2f6df6; color: #fff; font-weight: 600; cursor: pointer; }
.composer button:disabled { opacity: 0.5; cursor: default; }

/* right views fill the view column */
.spec, .flow, .preview { flex: 1; min-width: 0; display: flex; flex-direction: column; background: #fff; }
.spec { transition: background 0.4s; }
.spec.flash { background: #f3faf5; }
.spec-head, .view-head { display: flex; align-items: center; gap: 8px; padding: 12px 18px; padding-right: 230px; border-bottom: 1px solid #eef2f7; font-size: 13px; color: #475569; }
.badge { background: #cdebd6; color: #166534; border-radius: 10px; padding: 2px 8px; font-size: 11px; }
.spec-body, .flow-body, .preview-body { flex: 1; overflow: auto; min-height: 0; }
.spec-body { padding: 18px 24px; line-height: 1.6; }
.spec-body h2 { font-size: 16px; margin: 18px 0 6px; }
.spec-body ul { padding-left: 20px; }
.spec-body code { background: #f1f5f9; padding: 1px 4px; border-radius: 4px; }

/* flow */
.flow-body { padding: 16px; }
.mermaid-host svg { max-width: 100%; height: auto; }
.flow-error { color: #b91c1c; font-size: 12px; margin-bottom: 10px; }
.flow-error button { margin-left: 6px; }
.flow-error pre { white-space: pre-wrap; background: #fef2f2; padding: 8px; border-radius: 6px; }

/* preview */
.url-bar { display: flex; gap: 6px; align-items: center; padding: 8px 12px; border-bottom: 1px solid #eef2f7; background: #fbfcfe; }
.url-bar input { flex: 1; padding: 5px 10px; border: 1px solid #d8dee9; border-radius: 10px; font-size: 13px; }
.url-bar button { padding: 4px 10px; border: 1px solid #d8dee9; border-radius: 10px; background: #fff; cursor: pointer; }
.preview-body { display: flex; }
.preview-frame { flex: 1; border: 0; width: 100%; height: 100%; }
.preview-body .empty { padding: 24px; line-height: 1.6; }
```

- [ ] **Step 3: Automated checks**
- `npx tsc --noEmit` → clean.
- `npm run build:web` → clean.
- `npm test` → all prior tests pass (Plan-3 backend added: fake-runner +1, flow-prompt 1, session +1, app +2).

- [ ] **Step 4: Manual smoke (requires Claude Code; needs a second local dev server for preview)**

```bash
npm run dev    # server :5174 + Vite :5173
```
Open `http://localhost:5173` and verify:
1. Default: chat fills the screen; top-right shows `📄 문서 · 🔀 플로우 · 👁 프리뷰`.
2. Have a short planning chat so `spec.md` fills in.
3. Click `📄` → right pane opens with the living spec; drag the divider → it resizes; reload the page → the width persists.
4. Click `🔀` → "생성 중…" then a mermaid flow renders. Send another chat message → while the flow view is open, it regenerates after the spec updates.
5. Click `👁` → enter the URL of any other local dev server (e.g. start a throwaway `npx vite` elsewhere on :3001 and use `http://localhost:3001`) → it renders in the iframe; `⟳` reloads it.
6. Click the active button again → right pane collapses back to full-screen chat.

Capture which steps worked and any console errors. A failed manual step is reported, not committed over.

- [ ] **Step 5: Commit**

```bash
git add src/web/App.tsx src/web/styles.css
git commit -m "feat: multi-view workspace layout (toolbar + resizable split + views)"
```

---

## Self-Review (completed by plan author)

**Spec coverage:**
- UX model (chat-first, top-right toolbar, one view, resizable+persist) → Tasks 6, 7, 11 ✓
- 📄 문서 = existing SpecPane → Task 10 reuses it ✓
- 🔀 flow = AI mermaid, auto-refresh **while open** → `generateFlow` (Task 3) + `/api/flow` (Task 4) + `FlowView` re-fetch on `specRevision` while mounted (Tasks 9, 11) ✓
- 👁 preview = iframe-direct + URL persist + reload → Task 8 ✓
- Backend: generic `complete` → Task 1; flow prompt → Task 2 ✓
- Error handling: preview empty/blocked note, flow failure keeps last + retry, mermaid parse error shows raw, resize clamp → Tasks 8, 9, 11 ✓
- Testing: flow-prompt, fake complete, generateFlow, /api/flow (ok+error) all TDD; frontend manual → Tasks 1–4, 11 ✓

**Placeholder scan:** none — every step has complete code.

**Type consistency:** `complete(prompt, signal?)` identical in interface (Task 1), fake, real runner, and the `throwingRunner`/inline stubs (Tasks 1, 4). `ViewId = 'doc'|'flow'|'preview'` defined in `ViewToolbar` (Task 6) and imported by `RightPane` (Task 10) and `App` (Task 11). `fetchFlow(): Promise<string>` (Task 5) consumed by `FlowView` (Task 9). `generateFlow` (Task 3) called by `/api/flow` (Task 4). `RightPane` props (`activeView,md,changedLines,specRevision`) match `App`'s usage (Tasks 10, 11).

**Deferred (per spec §7):** reverse-proxy preview, multiple simultaneous views, the coder+sync multi-agent loop (its own future spec).
