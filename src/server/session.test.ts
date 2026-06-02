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
  constructor(private batch: ActivityBatch, private offsets: Record<string, number> = {}) {}
  async readNew(): Promise<ActivityBatch> { return this.batch; }
  async currentOffsets(): Promise<Record<string, number>> { return this.offsets; }
  watch(): () => void { return () => {}; }
}
const completer = (reply: string) => ({ complete: async () => reply });

let dir: string;
let session: Session | undefined;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-')); });
afterEach(async () => { session?.stop(); await rm(dir, { recursive: true, force: true }); });

describe('Session (observer)', () => {
  it('first run observes from "now": seeds the checkpoint from current offsets, does not ingest history', async () => {
    const store = new SpecStore(join(dir, '.throughline', 'prd.md'));
    const ingest = new IngestStore(dir);
    // readNew would return old activity, but first run must NOT ingest it
    const reader = new FakeReader({ excerpt: '사용자: 옛 활동', advanced: { '/x/s1.jsonl': 999 } }, { '/x/s1.jsonl': 500 });
    session = new Session({ store, runner: completer(PRD), reader, ingest, cwd: dir, gitDiff: async () => '' });
    let broadcasts = 0;
    session.broadcaster.subscribe(() => { broadcasts += 1; });

    await session.init();
    expect(await ingest.load()).toEqual({ '/x/s1.jsonl': 500 }); // seeded from currentOffsets, not advanced
    expect(broadcasts).toBe(0);
  });

  it('with an existing checkpoint, init folds new activity into the PRD and broadcasts', async () => {
    const store = new SpecStore(join(dir, '.throughline', 'prd.md'));
    const ingest = new IngestStore(dir);
    await ingest.save({ '/x/s1.jsonl': 1 }); // non-empty → catch-up path
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
