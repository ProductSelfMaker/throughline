// src/core/sync-engine.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from './spec-store';
import { FakeAgentRunner } from '../agent/fake-runner';
import { SyncEngine } from './sync-engine';
import type { ActivityResult, ActivityState } from './activity-reader';
import { ScribeResult } from '../domain/types';

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
- [x] 소셜 로그인

## 🟡 미정 / 열린 질문
- 결제?
`;

function fakeReader(bursts: ActivityResult[]) {
  let i = 0;
  return {
    readActivity: async (_s: ActivityState): Promise<ActivityResult> =>
      bursts[i++] ?? { entries: [], transcriptText: '', gitDiff: '', hasNew: false, newState: { sessionFile: null, byteOffset: 0 } },
  };
}

describe('SyncEngine.syncNow', () => {
  it('reverse-scribes the activity into spec.md and emits updated', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    const runner = new FakeAgentRunner({ completeReply: VALID });
    const reader = fakeReader([
      { entries: [{ role: 'user', text: '로그인 구현' }], transcriptText: '사용자: 로그인 구현', gitDiff: 'diff', hasNew: true, newState: { sessionFile: 's', byteOffset: 10 } },
    ]);
    const engine = new SyncEngine(store, runner, reader as any);

    let emitted: ScribeResult | undefined;
    engine.on('updated', (r: ScribeResult) => (emitted = r));

    const out = await engine.syncNow();
    expect(out).not.toBeNull();
    expect(await store.read()).toContain('- [x] 소셜 로그인 <!-- id: feat-');
    expect(emitted).toEqual(out);
  });

  it('does nothing when there is no new activity', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    const runner = new FakeAgentRunner({ completeReply: VALID });
    const reader = fakeReader([
      { entries: [], transcriptText: '', gitDiff: '', hasNew: false, newState: { sessionFile: null, byteOffset: 0 } },
    ]);
    const engine = new SyncEngine(store, runner, reader as any);
    expect(await engine.syncNow()).toBeNull();
  });
});
