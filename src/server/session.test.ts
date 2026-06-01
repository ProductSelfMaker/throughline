// src/server/session.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SpecStore } from '../core/spec-store';
import { ActivityReader } from '../core/activity-reader';
import { FakeAgentRunner } from '../agent/fake-runner';
import { Session } from './session';

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

describe('Session', () => {
  it('readTranscript returns the parsed active session', async () => {
    const sess = join(home, '.claude', 'projects', '-Users-u-Developer-Demo', 's.jsonl');
    await writeFile(sess, JSON.stringify({ type: 'user', message: { role: 'user', content: '안녕' } }) + '\n');
    const reader = new ActivityReader(CWD, { home, runGitDiff: async () => '' });
    session = new Session({ store: new SpecStore(join(dir, 'spec.md')), runner: new FakeAgentRunner(), reader, cwd: dir });
    expect(await session.readTranscript()).toEqual([{ role: 'user', text: '안녕' }]);
  });

  it('generateFlow delegates to the runner with the flow prompt', async () => {
    const store = new SpecStore(join(dir, 'spec.md'));
    await store.write('## ✅ 핵심 기능\n- [ ] 소셜 로그인\n');
    const runner = new FakeAgentRunner({ completeReply: (p) => (p.includes('소셜 로그인') ? 'flowchart TD\n A-->B' : 'X') });
    const reader = new ActivityReader(CWD, { home, runGitDiff: async () => '' });
    session = new Session({ store, runner, reader, cwd: dir });
    expect(await session.generateFlow()).toBe('flowchart TD\n A-->B');
  });
});
