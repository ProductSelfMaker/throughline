// src/core/apply-spec-update.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from './spec-store';
import { applySpecUpdate } from './apply-spec-update';
import { SPINE_HEADINGS } from '../domain/types';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'throughline-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

const VALID = `## 개요
앱

## 로그인
**무엇** 이메일·비밀번호 인증.

## 열린 질문
- 결제?
`;

describe('applySpecUpdate', () => {
  it('writes markdown and returns the change set', async () => {
    const store = new SpecStore(join(dir, 'doc.md'));
    const out = await applySpecUpdate(store, VALID, '');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.changedLines.length).toBeGreaterThan(0);
    expect(out.result.md).toContain('## 로그인');
    expect(await store.read()).toBe(out.result.md);
  });

  it('self-heals missing spine headings instead of rejecting', async () => {
    const store = new SpecStore(join(dir, 'doc.md'));
    const out = await applySpecUpdate(store, '대충 적은 메모', '');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    for (const h of SPINE_HEADINGS) expect(out.result.md).toContain(h);
    expect(out.result.md).toContain('대충 적은 메모');
    expect(await store.read()).toBe(out.result.md);
  });

  it('rejects empty output without writing', async () => {
    const store = new SpecStore(join(dir, 'doc.md'));
    await store.write('## 개요\n원본\n');
    const out = await applySpecUpdate(store, '   ', '## 개요\n원본\n');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.length).toBeGreaterThan(0);
    expect(await store.read()).toBe('## 개요\n원본\n');
  });
});
