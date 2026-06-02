// src/agent/session-log-reader.ts
import { readdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import chokidar from 'chokidar';
import { ActivityBatch, ActivityReader } from '../domain/types';

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
  constructor(opts: { cwd: string; home?: string }) {
    this.dir = join(opts.home ?? homedir(), '.claude', 'projects', encodeProjectDir(opts.cwd));
  }

  private async sessionFiles(): Promise<string[]> {
    if (!existsSync(this.dir)) return [];
    const names = await readdir(this.dir);
    return names
      .filter((n) => n.endsWith('.jsonl') && !n.startsWith('agent-'))
      .map((n) => join(this.dir, n));
  }

  async readNew(checkpoint: Record<string, number>): Promise<ActivityBatch> {
    const files = await this.sessionFiles();
    const parts: string[] = [];
    const advanced: Record<string, number> = {};
    for (const file of files) {
      const buf = await readFile(file);
      const from = checkpoint[file] ?? 0;
      if (buf.length <= from) continue;
      const chunk = buf.subarray(from).toString('utf8');
      const lastNl = chunk.lastIndexOf('\n');
      if (lastNl === -1) continue; // no complete line yet
      const complete = chunk.slice(0, lastNl);
      const text = extractActivity(complete.split('\n'));
      if (text) parts.push(text);
      advanced[file] = from + Buffer.byteLength(complete, 'utf8') + 1; // +1 for the consumed '\n'
    }
    return { excerpt: parts.join('\n'), advanced };
  }

  watch(onActivity: () => void): () => void {
    const w = chokidar.watch(this.dir, { ignoreInitial: true, depth: 0 });
    w.on('add', onActivity).on('change', onActivity);
    return () => void w.close();
  }
}
