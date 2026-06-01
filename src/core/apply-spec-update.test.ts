// src/core/apply-spec-update.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from './spec-store';
import { applySpecUpdate } from './apply-spec-update';

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'throughline-'));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

const VALID = `## 🎯 요약
앱

## ✅ 핵심 기능
- [ ] 소셜 로그인

## 🟡 미정 / 열린 질문
- 결제?
`;

describe('applySpecUpdate', () => {
  it('writes valid markdown with feature ids and returns the change set', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    const out = await applySpecUpdate(store, VALID, '');
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.result.changedLines.length).toBeGreaterThan(0);
    const onDisk = await store.read();
    expect(onDisk).toContain('- [ ] 소셜 로그인 <!-- id: feat-');
    expect(onDisk).toBe(out.result.md);
  });

  it('rejects invalid markdown without writing', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    await store.write('## 🎯 요약\n원본\n');
    const out = await applySpecUpdate(store, '깨진 문서', '## 🎯 요약\n원본\n');
    expect(out.ok).toBe(false);
    if (out.ok) return;
    expect(out.errors.length).toBeGreaterThan(0);
    expect(await store.read()).toBe('## 🎯 요약\n원본\n');
  });
});
