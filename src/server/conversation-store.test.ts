// src/server/conversation-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConversationStore } from './conversation-store';

let dir: string;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-')); });
afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

describe('ConversationStore', () => {
  it('appends and loads messages (creating .throughline)', async () => {
    const s = new ConversationStore(dir);
    await s.append({ role: 'user', content: '안녕' });
    await s.append({ role: 'assistant', content: '네' });
    expect(await s.load()).toEqual([
      { role: 'user', content: '안녕' },
      { role: 'assistant', content: '네' },
    ]);
  });

  it('returns [] when nothing saved, and skips malformed lines', async () => {
    expect(await new ConversationStore(dir).load()).toEqual([]);
    await mkdir(join(dir, '.throughline'), { recursive: true });
    await writeFile(
      join(dir, '.throughline', 'conversation.jsonl'),
      '{"role":"user","content":"hi"}\nnot json\n{"role":"x"}\n',
    );
    expect(await new ConversationStore(dir).load()).toEqual([{ role: 'user', content: 'hi' }]);
  });
});
