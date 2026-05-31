# Throughline — Living-Spec Engine Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the headless core that turns a planning conversation into a self-maintaining `spec.md` (the "Crystallize" beat), demoable via a CLI.

**Architecture:** Pure domain functions (parse/validate/diff/prompt) sit under a `ScribeEngine` that orchestrates a pluggable `AgentRunner` (real = Claude Code via the Agent SDK; fake = deterministic test double) and a file-backed `SpecStore`. Everything except the real Claude Code runner is unit-testable with no network or auth.

**Tech Stack:** TypeScript (ESM), Vitest, tsx, chokidar (file watch), `diff` (line diff), `@anthropic-ai/claude-agent-sdk`.

**This plan is Plan 1 of 2.** Plan 2 (browser app: Hono server + SSE + Vite/React split-screen UI + debounced live loop + launcher) builds on the engine delivered here.

---

## File Structure

```
throughline/
  package.json
  tsconfig.json
  vitest.config.ts
  .gitignore
  src/
    domain/
      types.ts            # shared types + constants (SPINE_HEADINGS, DEFAULT_SPEC)
      spec-doc.ts         # parse features/questions/headings, deterministic feature ids
      spec-doc.test.ts
      spec-structure.ts   # validateSpec() — hybrid spine rules
      spec-structure.test.ts
      spec-diff.ts        # changedLineNumbers() — line-level change set
      spec-diff.test.ts
      scribe-prompt.ts    # buildScribePrompt() — instructions for the scribe agent
      scribe-prompt.test.ts
    agent/
      fake-runner.ts      # deterministic AgentRunner test double
      fake-runner.test.ts
      claude-code-runner.ts  # real AgentRunner via Agent SDK (manual smoke)
    core/
      spec-store.ts       # read/write spec.md + chokidar watch
      spec-store.test.ts
      scribe-engine.ts    # orchestrates store + runner: runNow()
      scribe-engine.test.ts
    cli/
      scribe-cli.ts       # demo CLI: feed transcript.json -> update spec.md
```

Each file has one responsibility. Domain files are pure (no I/O). `core/` does I/O. `agent/` isolates the LLM behind an interface so the whole engine is testable with the fake.

---

## Task 0: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`

- [ ] **Step 1: Create `package.json`**

```json
{
  "name": "throughline",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "scribe": "tsx src/cli/scribe-cli.ts"
  },
  "dependencies": {
    "@anthropic-ai/claude-agent-sdk": "^0.1.0",
    "chokidar": "^4.0.1",
    "diff": "^7.0.0"
  },
  "devDependencies": {
    "@types/diff": "^7.0.0",
    "@types/node": "^22.10.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.0.0"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
});
```

- [ ] **Step 4: Create `.gitignore`**

```
node_modules/
dist/
*.local
.superpowers/
```

- [ ] **Step 5: Install, init git, commit**

```bash
npm install
git init
git add -A
git commit -m "chore: scaffold throughline project"
```

Expected: install completes; `git log --oneline` shows one commit.

---

## Task 1: Shared types & constants

**Files:**
- Create: `src/domain/types.ts`

Pure type/constant declarations — no behavior, so no test. Later tasks depend on these exact names.

- [ ] **Step 1: Create `src/domain/types.ts`**

```ts
export interface FeatureItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ParsedSpec {
  features: FeatureItem[];
  openQuestions: string[];
  headings: string[];
}

export interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export interface ValidationResult {
  ok: boolean;
  errors: string[];
}

export interface ScribeResult {
  md: string;
  changedLines: number[];
}

export interface AgentRunner {
  /** Streams a planning reply token-by-token; resolves with the full assistant text. */
  converse(
    transcript: Message[],
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<string>;
  /** One-shot: given the current spec + transcript, returns the full updated spec markdown. */
  scribe(
    currentSpecMarkdown: string,
    transcript: Message[],
    signal?: AbortSignal,
  ): Promise<string>;
}

/** The three fixed "spine" sections that must always be present (hybrid structure). */
export const SPINE_HEADINGS = [
  '## 🎯 요약',
  '## ✅ 핵심 기능',
  '## 🟡 미정 / 열린 질문',
] as const;

/** Scaffold used when no spec.md exists yet. */
export const DEFAULT_SPEC = `---
title: Untitled
updated:
---

## 🎯 요약

## ✅ 핵심 기능

## 🟡 미정 / 열린 질문
`;
```

- [ ] **Step 2: Commit**

```bash
git add src/domain/types.ts
git commit -m "feat: shared types and spine constants"
```

---

## Task 2: spec-doc — parse & feature ids

**Files:**
- Create: `src/domain/spec-doc.ts`
- Test: `src/domain/spec-doc.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/spec-doc.test.ts
import { describe, it, expect } from 'vitest';
import {
  getHeadings,
  parseFeatures,
  parseOpenQuestions,
  ensureFeatureIds,
  featureId,
} from './spec-doc';

const SPEC = `---
title: Demo
---

## 🎯 요약
한 줄 요약입니다.

## ✅ 핵심 기능
- [ ] 소셜 로그인
- [x] 대시보드 <!-- id: feat-keep -->

## 🟡 미정 / 열린 질문
- 결제 수단은?
- 무료 한도는?

## 인증
구글/애플 지원.
`;

describe('getHeadings', () => {
  it('returns every ## heading, trimmed', () => {
    expect(getHeadings(SPEC)).toEqual([
      '## 🎯 요약',
      '## ✅ 핵심 기능',
      '## 🟡 미정 / 열린 질문',
      '## 인증',
    ]);
  });
});

describe('parseFeatures', () => {
  it('parses checkbox state, text, and existing or derived ids', () => {
    const features = parseFeatures(SPEC);
    expect(features).toEqual([
      { id: featureId('소셜 로그인'), text: '소셜 로그인', done: false },
      { id: 'feat-keep', text: '대시보드', done: true },
    ]);
  });
});

describe('parseOpenQuestions', () => {
  it('parses the 미정 bullets', () => {
    expect(parseOpenQuestions(SPEC)).toEqual(['결제 수단은?', '무료 한도는?']);
  });
});

describe('ensureFeatureIds', () => {
  it('appends a deterministic id to feature lines lacking one, and is idempotent', () => {
    const once = ensureFeatureIds(SPEC);
    expect(once).toContain(`- [ ] 소셜 로그인 <!-- id: ${featureId('소셜 로그인')} -->`);
    expect(once).toContain('- [x] 대시보드 <!-- id: feat-keep -->');
    expect(ensureFeatureIds(once)).toBe(once);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/spec-doc.test.ts`
Expected: FAIL — cannot find module `./spec-doc`.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/spec-doc.ts
import { FeatureItem, ParsedSpec } from './types';

const FEATURE_RE =
  /^- \[( |x|X)\]\s+(.*?)(?:\s*<!--\s*id:\s*([\w-]+)\s*-->)?\s*$/;

function djb2(s: string): number {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h;
}

export function featureId(text: string): string {
  return 'feat-' + djb2(text).toString(36);
}

export function getHeadings(md: string): string[] {
  return md
    .split('\n')
    .filter((l) => /^##\s+/.test(l))
    .map((l) => l.trim());
}

function sectionLines(md: string, heading: string): string[] {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === heading);
  if (start === -1) return [];
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

export function parseFeatures(md: string): FeatureItem[] {
  const items: FeatureItem[] = [];
  for (const line of sectionLines(md, '## ✅ 핵심 기능')) {
    const m = FEATURE_RE.exec(line.trim());
    if (!m) continue;
    const text = m[2].trim();
    items.push({
      done: m[1].toLowerCase() === 'x',
      text,
      id: m[3] ?? featureId(text),
    });
  }
  return items;
}

export function parseOpenQuestions(md: string): string[] {
  return sectionLines(md, '## 🟡 미정 / 열린 질문')
    .map((l) => l.trim())
    .filter((l) => l.startsWith('- '))
    .map((l) => l.slice(2).trim());
}

export function ensureFeatureIds(md: string): string {
  let inFeatures = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^##\s+/.test(line)) {
        inFeatures = line.trim() === '## ✅ 핵심 기능';
        return line;
      }
      if (!inFeatures) return line;
      const m = FEATURE_RE.exec(line.trim());
      if (!m || m[3]) return line; // not a feature line, or already has an id
      const id = featureId(m[2].trim());
      return `${line.replace(/\s*$/, '')} <!-- id: ${id} -->`;
    })
    .join('\n');
}

export function parseSpec(md: string): ParsedSpec {
  return {
    features: parseFeatures(md),
    openQuestions: parseOpenQuestions(md),
    headings: getHeadings(md),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/spec-doc.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/spec-doc.ts src/domain/spec-doc.test.ts
git commit -m "feat: spec-doc parsing and deterministic feature ids"
```

---

## Task 3: spec-structure — validate spine

**Files:**
- Create: `src/domain/spec-structure.ts`
- Test: `src/domain/spec-structure.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/spec-structure.test.ts
import { describe, it, expect } from 'vitest';
import { validateSpec } from './spec-structure';
import { DEFAULT_SPEC } from './types';

describe('validateSpec', () => {
  it('accepts a doc containing all three spine headings', () => {
    expect(validateSpec(DEFAULT_SPEC)).toEqual({ ok: true, errors: [] });
  });

  it('reports each missing spine heading', () => {
    const result = validateSpec('## 🎯 요약\n\nhello\n');
    expect(result.ok).toBe(false);
    expect(result.errors).toEqual([
      'missing spine heading: ## ✅ 핵심 기능',
      'missing spine heading: ## 🟡 미정 / 열린 질문',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/spec-structure.test.ts`
Expected: FAIL — cannot find module `./spec-structure`.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/spec-structure.ts
import { SPINE_HEADINGS, ValidationResult } from './types';
import { getHeadings } from './spec-doc';

export function validateSpec(md: string): ValidationResult {
  const headings = getHeadings(md);
  const errors: string[] = [];
  for (const h of SPINE_HEADINGS) {
    if (!headings.includes(h)) errors.push(`missing spine heading: ${h}`);
  }
  return { ok: errors.length === 0, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/spec-structure.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/spec-structure.ts src/domain/spec-structure.test.ts
git commit -m "feat: validate hybrid spine structure"
```

---

## Task 4: spec-diff — changed line numbers

**Files:**
- Create: `src/domain/spec-diff.ts`
- Test: `src/domain/spec-diff.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/spec-diff.test.ts
import { describe, it, expect } from 'vitest';
import { changedLineNumbers } from './spec-diff';

describe('changedLineNumbers', () => {
  it('flags a single changed line (0-based, in the new text)', () => {
    expect(changedLineNumbers('a\nb\nc\n', 'a\nB\nc\n')).toEqual([1]);
  });

  it('flags all lines when starting from empty', () => {
    expect(changedLineNumbers('', 'x\ny\n')).toEqual([0, 1]);
  });

  it('returns empty when unchanged', () => {
    expect(changedLineNumbers('a\nb\n', 'a\nb\n')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/spec-diff.test.ts`
Expected: FAIL — cannot find module `./spec-diff`.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/spec-diff.ts
import { diffLines } from 'diff';

/** Returns 0-based indices of added/changed lines in `newMd`. */
export function changedLineNumbers(oldMd: string, newMd: string): number[] {
  const changed: number[] = [];
  let lineIdx = 0;
  for (const part of diffLines(oldMd, newMd)) {
    const count = part.count ?? part.value.split('\n').length;
    if (part.added) {
      for (let i = 0; i < count; i++) changed.push(lineIdx + i);
      lineIdx += count;
    } else if (part.removed) {
      // removed lines do not exist in the new text — don't advance
    } else {
      lineIdx += count;
    }
  }
  return changed;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/spec-diff.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/domain/spec-diff.ts src/domain/spec-diff.test.ts
git commit -m "feat: line-level change detection for spec highlights"
```

---

## Task 5: scribe-prompt — build the scribe instructions

**Files:**
- Create: `src/domain/scribe-prompt.ts`
- Test: `src/domain/scribe-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/domain/scribe-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildScribePrompt } from './scribe-prompt';
import { SPINE_HEADINGS, Message } from './types';

describe('buildScribePrompt', () => {
  const transcript: Message[] = [
    { role: 'user', content: '로그인은 소셜만 쓸게' },
    { role: 'assistant', content: '구글/애플 추가했어요' },
  ];

  it('embeds the spine rules, current spec, and transcript, and demands full output', () => {
    const prompt = buildScribePrompt('## 🎯 요약\n기존 요약', transcript);
    for (const h of SPINE_HEADINGS) expect(prompt).toContain(h);
    expect(prompt).toContain('기존 요약');
    expect(prompt).toContain('로그인은 소셜만 쓸게');
    expect(prompt).toContain('구글/애플 추가했어요');
    expect(prompt).toContain('전체');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/domain/scribe-prompt.test.ts`
Expected: FAIL — cannot find module `./scribe-prompt`.

- [ ] **Step 3: Write the implementation**

```ts
// src/domain/scribe-prompt.ts
import { Message, SPINE_HEADINGS } from './types';

export function buildScribePrompt(
  currentSpecMarkdown: string,
  transcript: Message[],
): string {
  const convo = transcript
    .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
    .join('\n');

  return [
    '너는 기획 대화를 "살아있는 기획서"(마크다운)로 응결시키는 스크라이브다.',
    '규칙:',
    `1) 다음 세 고정 섹션은 항상 존재해야 한다(비어 있어도 헤딩은 유지): ${SPINE_HEADINGS.join(' , ')}`,
    '2) "## ✅ 핵심 기능"은 체크박스 목록(- [ ] 또는 - [x])으로 적고, 기존 줄의 <!-- id: ... --> 주석은 절대 바꾸지 말고 그대로 보존한다.',
    '3) 아직 정해지지 않았거나 모순된 것은 "## 🟡 미정 / 열린 질문"에 - 불릿으로 모은다.',
    '4) 대화에서 등장한 그 외 주제는 "## <주제>" 섹션으로 자유롭게 자라게 한다.',
    '5) 사용자의 지시를 기다리지 말고, 대화 내용을 반영해 문서를 능동적으로 갱신한다.',
    '',
    '현재 기획서:',
    '"""',
    currentSpecMarkdown,
    '"""',
    '',
    '최근 대화:',
    '"""',
    convo,
    '"""',
    '',
    '갱신된 기획서 마크다운 "전체"만 출력하라. 설명 문장이나 코드펜스(```) 없이 마크다운 본문만.',
  ].join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/domain/scribe-prompt.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/domain/scribe-prompt.ts src/domain/scribe-prompt.test.ts
git commit -m "feat: scribe prompt builder"
```

---

## Task 6: fake AgentRunner

**Files:**
- Create: `src/agent/fake-runner.ts`
- Test: `src/agent/fake-runner.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/agent/fake-runner.test.ts
import { describe, it, expect } from 'vitest';
import { FakeAgentRunner } from './fake-runner';

describe('FakeAgentRunner', () => {
  it('streams the scripted converse reply char by char and returns the whole thing', async () => {
    const runner = new FakeAgentRunner({ converseReply: 'hi' });
    const tokens: string[] = [];
    const full = await runner.converse([], (t) => tokens.push(t));
    expect(tokens).toEqual(['h', 'i']);
    expect(full).toBe('hi');
  });

  it('returns a scripted scribe reply, supporting a function form', async () => {
    const runner = new FakeAgentRunner({
      scribeReply: (cur) => cur + '\n## ✅ 핵심 기능\n- [ ] 새 기능',
    });
    expect(await runner.scribe('## 🎯 요약', [])).toBe(
      '## 🎯 요약\n## ✅ 핵심 기능\n- [ ] 새 기능',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/agent/fake-runner.test.ts`
Expected: FAIL — cannot find module `./fake-runner`.

- [ ] **Step 3: Write the implementation**

```ts
// src/agent/fake-runner.ts
import { AgentRunner, Message } from '../domain/types';

type ScribeReply = string | ((cur: string, transcript: Message[]) => string);

export class FakeAgentRunner implements AgentRunner {
  constructor(
    private opts: { converseReply?: string; scribeReply?: ScribeReply } = {},
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
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/agent/fake-runner.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent/fake-runner.ts src/agent/fake-runner.test.ts
git commit -m "test: deterministic fake AgentRunner"
```

---

## Task 7: SpecStore — read / write / watch

**Files:**
- Create: `src/core/spec-store.ts`
- Test: `src/core/spec-store.test.ts`

Note: `read`/`write` are unit-tested with a temp dir. `watch` wraps chokidar and is verified manually in Task 10 (filesystem-watch timing is flaky to assert reliably in unit tests).

- [ ] **Step 1: Write the failing test**

```ts
// src/core/spec-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from './spec-store';
import { DEFAULT_SPEC } from '../domain/types';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'throughline-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('SpecStore', () => {
  it('returns DEFAULT_SPEC when the file does not exist', async () => {
    const store = new SpecStore(join(dir, 'nope', 'spec.md'));
    expect(await store.read()).toBe(DEFAULT_SPEC);
  });

  it('writes (creating parent dirs) then reads back the same content', async () => {
    const store = new SpecStore(join(dir, 'nested', 'spec.md'));
    await store.write('## 🎯 요약\nhello\n');
    expect(await store.read()).toBe('## 🎯 요약\nhello\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/spec-store.test.ts`
Expected: FAIL — cannot find module `./spec-store`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/spec-store.ts
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname } from 'node:path';
import chokidar, { type FSWatcher } from 'chokidar';
import { DEFAULT_SPEC } from '../domain/types';

export class SpecStore {
  constructor(private filePath: string) {}

  async read(): Promise<string> {
    if (!existsSync(this.filePath)) return DEFAULT_SPEC;
    return readFile(this.filePath, 'utf8');
  }

  async write(md: string): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, md, 'utf8');
  }

  /** Calls onChange(newContent) when the file is modified externally. Returns an unsubscribe fn. */
  watch(onChange: (md: string) => void): () => void {
    const w: FSWatcher = chokidar.watch(this.filePath, { ignoreInitial: true });
    w.on('change', async () => onChange(await this.read()));
    return () => void w.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/spec-store.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/spec-store.ts src/core/spec-store.test.ts
git commit -m "feat: file-backed SpecStore with watch"
```

---

## Task 8: ScribeEngine — orchestration

**Files:**
- Create: `src/core/scribe-engine.ts`
- Test: `src/core/scribe-engine.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/core/scribe-engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from './spec-store';
import { ScribeEngine } from './scribe-engine';
import { FakeAgentRunner } from '../agent/fake-runner';
import { ScribeResult } from '../domain/types';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'throughline-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const VALID = `## 🎯 요약
소셜 로그인 앱

## ✅ 핵심 기능
- [ ] 소셜 로그인

## 🟡 미정 / 열린 질문
- 결제 수단은?
`;

describe('ScribeEngine.runNow', () => {
  it('writes the new spec (with feature ids), returns the change set, and emits "updated"', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    const engine = new ScribeEngine(store, new FakeAgentRunner({ scribeReply: VALID }));

    let emitted: ScribeResult | undefined;
    engine.on('updated', (r: ScribeResult) => (emitted = r));

    const result = await engine.runNow([{ role: 'user', content: '소셜 로그인만' }]);

    expect(result).not.toBeNull();
    expect(result!.changedLines.length).toBeGreaterThan(0);
    const onDisk = await store.read();
    expect(onDisk).toContain('- [ ] 소셜 로그인 <!-- id: feat-');
    expect(onDisk).toBe(result!.md);
    expect(emitted).toEqual(result);
  });

  it('returns null, emits "rejected", and leaves the file untouched when the spec is invalid', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    await store.write('## 🎯 요약\n원본\n');
    const engine = new ScribeEngine(
      store,
      new FakeAgentRunner({ scribeReply: '미정 섹션 없는 깨진 문서' }),
    );

    let rejected = false;
    engine.on('rejected', () => (rejected = true));

    const result = await engine.runNow([{ role: 'user', content: 'x' }]);

    expect(result).toBeNull();
    expect(rejected).toBe(true);
    expect(await store.read()).toBe('## 🎯 요약\n원본\n');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/scribe-engine.test.ts`
Expected: FAIL — cannot find module `./scribe-engine`.

- [ ] **Step 3: Write the implementation**

```ts
// src/core/scribe-engine.ts
import { EventEmitter } from 'node:events';
import { AgentRunner, Message, ScribeResult } from '../domain/types';
import { validateSpec } from '../domain/spec-structure';
import { ensureFeatureIds } from '../domain/spec-doc';
import { changedLineNumbers } from '../domain/spec-diff';
import { SpecStore } from './spec-store';

/** Emits 'updated' (ScribeResult) on success, 'rejected' (string[]) when the agent output is invalid. */
export class ScribeEngine extends EventEmitter {
  constructor(
    private store: SpecStore,
    private runner: AgentRunner,
  ) {
    super();
  }

  async runNow(transcript: Message[], signal?: AbortSignal): Promise<ScribeResult | null> {
    const current = await this.store.read();
    const raw = await this.runner.scribe(current, transcript, signal);

    const validation = validateSpec(raw);
    if (!validation.ok) {
      this.emit('rejected', validation.errors);
      return null;
    }

    const md = ensureFeatureIds(raw);
    const changedLines = changedLineNumbers(current, md);
    await this.store.write(md);

    const result: ScribeResult = { md, changedLines };
    this.emit('updated', result);
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/core/scribe-engine.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/core/scribe-engine.ts src/core/scribe-engine.test.ts
git commit -m "feat: ScribeEngine orchestrates validation, ids, diff, and write"
```

---

## Task 9: ClaudeCodeRunner — real Agent SDK adapter

**Files:**
- Create: `src/agent/claude-code-runner.ts`

This is the only module that talks to the real LLM. It uses the user's existing Claude Code credentials via the Agent SDK — no separate API key, no inference cost to the operator. It is verified by **manual smoke test** (Task 10), not by unit tests, because it requires real auth and is non-deterministic.

> **Verification note for the implementer:** the exact message shape from `query()` can vary by `@anthropic-ai/claude-agent-sdk` version. After writing this file, run the smoke test in Task 10; if assistant text isn't captured, log one raw message (`console.error(JSON.stringify(msg))`) and adjust the `msg.type === 'assistant'` / `block.type === 'text'` access to match the installed version's types.

- [ ] **Step 1: Write the implementation**

```ts
// src/agent/claude-code-runner.ts
import { query } from '@anthropic-ai/claude-agent-sdk';
import { AgentRunner, Message } from '../domain/types';
import { buildScribePrompt } from '../domain/scribe-prompt';

function transcriptToPrompt(transcript: Message[]): string {
  return transcript
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');
}

function abortControllerFor(signal?: AbortSignal): AbortController | undefined {
  if (!signal) return undefined;
  const controller = new AbortController();
  if (signal.aborted) controller.abort();
  else signal.addEventListener('abort', () => controller.abort());
  return controller;
}

/** Strips a single ```...``` fence if the model wrapped the whole answer in one. */
function stripCodeFence(text: string): string {
  const trimmed = text.trim();
  const fence = /^```[a-z]*\n([\s\S]*?)\n```$/i.exec(trimmed);
  return fence ? fence[1] : trimmed;
}

async function collectAssistantText(
  prompt: string,
  cwd: string | undefined,
  onToken: ((t: string) => void) | undefined,
  signal?: AbortSignal,
): Promise<string> {
  let full = '';
  for await (const msg of query({
    prompt,
    options: { cwd, abortController: abortControllerFor(signal) },
  })) {
    if (msg.type === 'assistant') {
      for (const block of msg.message.content) {
        if (block.type === 'text') {
          full += block.text;
          onToken?.(block.text);
        }
      }
    }
  }
  return full;
}

export class ClaudeCodeRunner implements AgentRunner {
  constructor(private options: { cwd?: string } = {}) {}

  converse(
    transcript: Message[],
    onToken: (t: string) => void,
    signal?: AbortSignal,
  ): Promise<string> {
    return collectAssistantText(
      transcriptToPrompt(transcript),
      this.options.cwd,
      onToken,
      signal,
    );
  }

  async scribe(
    currentSpecMarkdown: string,
    transcript: Message[],
    signal?: AbortSignal,
  ): Promise<string> {
    const text = await collectAssistantText(
      buildScribePrompt(currentSpecMarkdown, transcript),
      this.options.cwd,
      undefined,
      signal,
    );
    return stripCodeFence(text);
  }
}
```

- [ ] **Step 2: Type-check (no unit test for this module)**

Run: `npx tsc --noEmit`
Expected: no type errors. (If the SDK's types differ, apply the verification note above.)

- [ ] **Step 3: Commit**

```bash
git add src/agent/claude-code-runner.ts
git commit -m "feat: Claude Code AgentRunner via Agent SDK"
```

---

## Task 10: scribe CLI + end-to-end smoke

**Files:**
- Create: `src/cli/scribe-cli.ts`

This is the demoable deliverable: feed a conversation, watch `spec.md` write itself.

- [ ] **Step 1: Write the CLI**

```ts
// src/cli/scribe-cli.ts
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { SpecStore } from '../core/spec-store';
import { ScribeEngine } from '../core/scribe-engine';
import { ClaudeCodeRunner } from '../agent/claude-code-runner';
import { Message } from '../domain/types';

const { values } = parseArgs({
  options: {
    spec: { type: 'string' },
    transcript: { type: 'string' },
  },
});

if (!values.spec || !values.transcript) {
  console.error('usage: npm run scribe -- --spec <spec.md> --transcript <transcript.json>');
  process.exit(1);
}

const transcript = JSON.parse(await readFile(values.transcript, 'utf8')) as Message[];
const engine = new ScribeEngine(
  new SpecStore(values.spec),
  new ClaudeCodeRunner({ cwd: process.cwd() }),
);

const result = await engine.runNow(transcript);
if (!result) {
  console.error('scribe rejected: agent output failed structure validation');
  process.exit(2);
}
console.log(`updated ${values.spec} — ${result.changedLines.length} changed line(s)`);
```

- [ ] **Step 2: Create a sample transcript for the smoke test**

```bash
cat > /tmp/throughline-transcript.json <<'JSON'
[
  { "role": "user", "content": "AI 미팅 노트 앱을 만들거야. 로그인은 소셜만." },
  { "role": "assistant", "content": "구글/애플 소셜 로그인으로 잡을게요. 녹음/요약 기능도 필요할까요?" },
  { "role": "user", "content": "응 실시간 요약 필요해. 결제는 아직 모르겠어." }
]
JSON
```

- [ ] **Step 3: Run the end-to-end smoke test (requires Claude Code installed & authenticated)**

Run:
```bash
rm -f /tmp/throughline-spec.md
npm run scribe -- --spec /tmp/throughline-spec.md --transcript /tmp/throughline-transcript.json
```
Expected: prints `updated /tmp/throughline-spec.md — N changed line(s)`.

Then inspect the result:
```bash
cat /tmp/throughline-spec.md
```
Expected: contains `## 🎯 요약`, `## ✅ 핵심 기능` with checkbox items carrying `<!-- id: feat-... -->`, a `## 🟡 미정 / 열린 질문` listing the undecided payment, and at least one emergent `## <주제>` section. This confirms `watch`/runner/engine wiring against the real SDK.

- [ ] **Step 4: Run the full unit suite**

Run: `npm test`
Expected: all tests PASS (spec-doc, spec-structure, spec-diff, scribe-prompt, fake-runner, spec-store, scribe-engine).

- [ ] **Step 5: Commit**

```bash
git add src/cli/scribe-cli.ts
git commit -m "feat: scribe CLI demo + e2e smoke"
```

---

## Self-Review (completed by plan author)

**Spec coverage (Plan-1 portion of the design spec):**
- Crystallize hero (conversation → living spec) → Tasks 5, 8, 9, 10 ✓
- Hybrid structure (fixed spine + emergent + 미정) → enforced in `buildScribePrompt` (Task 5) and `validateSpec` (Task 3) ✓
- Feature anchors for future Build progress → `ensureFeatureIds` (Task 2) ✓
- `spec.md` as the single source of truth on disk → `SpecStore` (Task 7) ✓
- "Uses your CLI AI, inference cost 0" → `ClaudeCodeRunner` via Agent SDK (Task 9) ✓
- Change highlighting data → `changedLineNumbers` (Task 4), surfaced via `ScribeResult` (Task 8) ✓
- Error handling: never corrupt the file on bad output → reject path in Task 8 (test asserts file untouched) ✓
- Adapter interface for future CLIs → `AgentRunner` interface (Task 1) with fake + real impls ✓

**Deferred to Plan 2 (browser app):** split-screen UI, SSE transport, debounced live loop on each turn, external-edit `watch` wiring into the UI, `converse` streaming to the browser, launcher/`npx throughline`.

**Placeholder scan:** no TBD/TODO/"add error handling" steps; every code step contains complete code. ✓

**Type consistency:** `AgentRunner.converse/scribe`, `ScribeResult {md, changedLines}`, `FeatureItem {id,text,done}`, `SPINE_HEADINGS`, `DEFAULT_SPEC` used identically across Tasks 1–10. ✓
