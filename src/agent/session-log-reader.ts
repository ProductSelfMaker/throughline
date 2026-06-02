// src/agent/session-log-reader.ts
import { readdir, stat, open } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chokidar from 'chokidar';
import { ActivityBatch, ActivityReader } from '../domain/types';

// Bounds — a long-lived project's session dir can be hundreds of MB across many
// files; never read it all. Read at most a tail window per file per tick, and
// cap the excerpt fed to the scribe.
const DEFAULT_MAX_READ_BYTES = 512 * 1024;
const DEFAULT_MAX_EXCERPT_CHARS = 12_000;

/** Claude Code stores per-project sessions under ~/.claude/projects/<dashed cwd>/. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/\//g, '-');
}

function toolTarget(input: unknown): string {
  if (input && typeof input === 'object') {
    const o = input as Record<string, unknown>;
    const v = o.file_path ?? o.path ?? o.command ?? o.pattern ?? o.url;
    if (typeof v === 'string') return v.length > 60 ? v.slice(0, 60) + '…' : v;
  }
  return '';
}

function textFromContent(content: unknown): string {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter((b): b is { type: 'text'; text: string } =>
        !!b && typeof b === 'object' && (b as { type?: string }).type === 'text')
      .map((b) => b.text)
      .join('');
  }
  return '';
}

/** Render a window of JSONL lines into a scribe-friendly excerpt. */
export function extractActivity(lines: string[]): string {
  const out: string[] = [];
  for (const raw of lines) {
    const t = raw.trim();
    if (!t) continue;
    let o: { type?: string; message?: { role?: string; content?: unknown } };
    try { o = JSON.parse(t); } catch { continue; }
    const role = o.message?.role;
    if (o.type === 'user' && role === 'user') {
      const text = textFromContent(o.message?.content).trim();
      if (text) out.push('사용자: ' + text);
    } else if (o.type === 'assistant' && role === 'assistant') {
      const content = o.message?.content;
      const text = textFromContent(content).trim();
      if (text) out.push('AI: ' + text);
      if (Array.isArray(content)) {
        for (const b of content as Array<{ type?: string; name?: string; input?: unknown }>) {
          if (b && b.type === 'tool_use') out.push(`[도구] ${b.name ?? ''} ${toolTarget(b.input)}`.trim());
        }
      }
    }
  }
  return out.join('\n');
}

export class SessionLogReader implements ActivityReader {
  private dir: string;
  private maxReadBytes: number;
  private maxExcerptChars: number;
  constructor(opts: { cwd: string; home?: string; maxReadBytes?: number; maxExcerptChars?: number }) {
    this.dir = join(opts.home ?? homedir(), '.claude', 'projects', encodeProjectDir(opts.cwd));
    this.maxReadBytes = opts.maxReadBytes ?? DEFAULT_MAX_READ_BYTES;
    this.maxExcerptChars = opts.maxExcerptChars ?? DEFAULT_MAX_EXCERPT_CHARS;
  }

  private async sessionFiles(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    const names = await readdir(this.dir);
    return names
      .filter((n) => n.endsWith('.jsonl') && !n.startsWith('agent-'))
      .map((n) => join(this.dir, n));
  }

  /** Current byte size of every session file — used to "observe from now" on first run. */
  async currentOffsets(): Promise<Record<string, number>> {
    const out: Record<string, number> = {};
    for (const f of await this.sessionFiles()) {
      try { out[f] = (await stat(f)).size; } catch { /* skip */ }
    }
    return out;
  }

  /** Read only the new tail of each session file (bounded), advancing offsets. */
  async readNew(checkpoint: Record<string, number>): Promise<ActivityBatch> {
    const parts: string[] = [];
    const advanced: Record<string, number> = {};
    for (const file of await this.sessionFiles()) {
      let size: number;
      try { size = (await stat(file)).size; } catch { continue; }
      const from = checkpoint[file] ?? 0;
      if (size <= from) continue;

      const readStart = Math.max(from, size - this.maxReadBytes);
      const len = size - readStart;
      const fh = await open(file, 'r');
      try {
        const buf = Buffer.alloc(len);
        await fh.read(buf, 0, len, readStart);
        let chunk = buf.toString('utf8');
        // if we skipped ahead past unread history, drop the partial first line
        if (readStart > from) {
          const nl = chunk.indexOf('\n');
          chunk = nl >= 0 ? chunk.slice(nl + 1) : '';
        }
        const lastNl = chunk.lastIndexOf('\n');
        if (lastNl === -1) {
          // no complete line in the window: skip ahead only if the window is full
          // (a pathologically long line); otherwise wait for the line to finish.
          if (len >= this.maxReadBytes) advanced[file] = size;
          continue;
        }
        const complete = chunk.slice(0, lastNl);
        const trailing = Buffer.byteLength(chunk.slice(lastNl + 1), 'utf8');
        const text = extractActivity(complete.split('\n'));
        if (text) parts.push(text);
        advanced[file] = size - trailing; // preserve a partial trailing line for next tick
      } finally {
        await fh.close();
      }
    }
    let excerpt = parts.join('\n');
    if (excerpt.length > this.maxExcerptChars) excerpt = excerpt.slice(excerpt.length - this.maxExcerptChars);
    return { excerpt, advanced };
  }

  watch(onActivity: () => void): () => void {
    const w = chokidar.watch(this.dir, { ignoreInitial: true, depth: 0 });
    w.on('add', onActivity).on('change', onActivity);
    return () => void w.close();
  }
}
