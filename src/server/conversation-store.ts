// src/server/conversation-store.ts
import { appendFile, readFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Message } from '../domain/types';

/** Durable append-only conversation log at <cwd>/.throughline/conversation.jsonl (keep all). */
export class ConversationStore {
  private file: string;
  constructor(cwd: string) {
    this.file = join(cwd, '.throughline', 'conversation.jsonl');
  }

  async append(msg: Message): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
    await appendFile(this.file, JSON.stringify(msg) + '\n', 'utf8');
  }

  async load(): Promise<Message[]> {
    if (!existsSync(this.file)) return [];
    const out: Message[] = [];
    for (const line of (await readFile(this.file, 'utf8')).split('\n')) {
      const t = line.trim();
      if (!t) continue;
      try {
        const m = JSON.parse(t);
        if (m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string') {
          out.push({ role: m.role, content: m.content });
        }
      } catch {
        // skip malformed line
      }
    }
    return out;
  }
}
