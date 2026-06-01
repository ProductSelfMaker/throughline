// src/server/app.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from '../core/spec-store';
import { ActivityReader } from '../core/activity-reader';
import { FakeAgentRunner } from '../agent/fake-runner';
import { Session } from './session';
import { createApp } from './app';

let dir: string;
let home: string;
let session: Session | undefined;
const CWD = '/Users/u/Developer/Demo';
beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'tl-'));
  home = await mkdtemp(join(tmpdir(), 'tl-home-'));
  await mkdir(join(home, '.claude', 'projects', '-Users-u-Developer-Demo'), { recursive: true });
});
afterEach(async () => {
  session?.stop();
  await rm(dir, { recursive: true, force: true });
  await rm(home, { recursive: true, force: true });
});

describe('GET /api/flow', () => {
  it('returns { mermaid } from the session', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    await store.write('## ✅ 핵심 기능\n- [ ] 소셜 로그인\n');
    const reader = new ActivityReader(CWD, { home, runGitDiff: async () => '' });
    session = new Session({ store, runner: new FakeAgentRunner({ completeReply: 'flowchart TD\n A-->B' }), reader, cwd: dir });
    const res = await createApp(session).request('/api/flow');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ mermaid: 'flowchart TD\n A-->B' });
  });

  it('returns { error } 500 when generation throws', async () => {
    const reader = new ActivityReader(CWD, { home, runGitDiff: async () => '' });
    const runner = { converse: async () => '', scribe: async () => '', complete: async () => { throw new Error('model down'); } };
    session = new Session({ store: new SpecStore(join(dir, 'spec.md')), runner, reader, cwd: dir });
    const res = await createApp(session).request('/api/flow');
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'model down' });
  });
});
