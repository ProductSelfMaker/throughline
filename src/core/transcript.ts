// src/core/transcript.ts
export interface TranscriptEntry {
  role: 'user' | 'assistant';
  text: string;
}

/** Claude Code stores a project's sessions under ~/.claude/projects/<encoded cwd>/. */
export function encodeProjectDir(cwd: string): string {
  return cwd.replace(/[^A-Za-z0-9]/g, '-');
}

/** Parse a chunk of JSONL lines into clean user/assistant turns, skipping noise. */
export function parseEntries(jsonlText: string): TranscriptEntry[] {
  const entries: TranscriptEntry[] = [];
  for (const line of jsonlText.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let obj: any;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      continue; // tolerate partial/corrupt lines
    }
    if (obj?.isSidechain) continue;
    const msg = obj?.message;
    if (obj?.type === 'user' && typeof msg?.content === 'string') {
      const text = msg.content.trim();
      if (text) entries.push({ role: 'user', text });
    } else if (obj?.type === 'assistant' && Array.isArray(msg?.content)) {
      const text = msg.content
        .filter((b: any) => b?.type === 'text' && typeof b.text === 'string')
        .map((b: any) => b.text)
        .join('')
        .trim();
      if (text) entries.push({ role: 'assistant', text });
    }
  }
  return entries;
}
