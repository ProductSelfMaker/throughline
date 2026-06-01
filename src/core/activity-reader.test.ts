// src/core/activity-reader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActivityReader } from './activity-reader';

let home: string;
let projectDir: string;
const CWD = '/Users/u/Developer/Demo'; // → -Users-u-Developer-Demo

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'tl-home-'));
  projectDir = join(home, '.claude', 'projects', '-Users-u-Developer-Demo');
  await mkdir(projectDir, { recursive: true });
});
afterEach(async () => {
  await rm(home, { recursive: true, force: true });
});

function line(role: 'user' | 'assistant', text: string): string {
  return role === 'user'
    ? JSON.stringify({ type: 'user', message: { role: 'user', content: text } })
    : JSON.stringify({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text }] } });
}

describe('ActivityReader', () => {
  it('reads the newest non-agent session delta and the git diff', async () => {
    await writeFile(join(projectDir, 'agent-aaa.jsonl'), line('user', '서브에이전트') + '\n');
    const sess = join(projectDir, 'sess-1.jsonl');
    await writeFile(sess, line('user', '로그인 만들어줘') + '\n');

    const reader = new ActivityReader(CWD, { home, runGitDiff: async () => 'diff --git a/login.tsx b/login.tsx' });

    const first = await reader.readActivity({ sessionFile: null, byteOffset: 0 });
    expect(first.hasNew).toBe(true);
    expect(first.entries).toEqual([{ role: 'user', text: '로그인 만들어줘' }]);
    expect(first.gitDiff).toContain('login.tsx');

    const second = await reader.readActivity(first.newState);
    expect(second.hasNew).toBe(false);

    await writeFile(sess, line('user', '로그인 만들어줘') + '\n' + line('assistant', '추가했어요') + '\n');
    const third = await reader.readActivity(second.newState);
    expect(third.hasNew).toBe(true);
    expect(third.entries).toEqual([{ role: 'assistant', text: '추가했어요' }]);
  });

  it('reports no session when the project dir is empty', async () => {
    const reader = new ActivityReader(CWD, { home, runGitDiff: async () => '' });
    const out = await reader.readActivity({ sessionFile: null, byteOffset: 0 });
    expect(out.hasNew).toBe(false);
    expect(out.entries).toEqual([]);
  });
});
