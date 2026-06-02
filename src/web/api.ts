// src/web/api.ts
export type SpecUpdate = { md: string; changedLines: number[] };
export type Msg = { role: 'user' | 'assistant'; content: string };
export type ChatEvent =
  | { type: 'text'; text: string }
  | { type: 'tool'; name: string; target: string }
  | { type: 'done' };

/** Subscribe to live spec updates over SSE. */
export function subscribeSpec(onSpec: (u: SpecUpdate) => void): () => void {
  const es = new EventSource('/api/events');
  es.addEventListener('spec-updated', (e) => onSpec(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}

export async function fetchTranscript(): Promise<Msg[]> {
  const res = await fetch('/api/transcript');
  const data = (await res.json()) as { transcript?: Msg[] };
  return data.transcript ?? [];
}

/** Send a chat message; receive streamed text/tool/done events (NDJSON). */
export async function sendChat(message: string, onEvent: (e: ChatEvent) => void): Promise<void> {
  const res = await fetch('/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message }),
  });
  if (!res.body) return;
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim();
      buf = buf.slice(i + 1);
      if (line) {
        try { onEvent(JSON.parse(line) as ChatEvent); } catch { /* ignore */ }
      }
    }
  }
}

/** Fetch a freshly generated mermaid user-flow for the current spec. */
export async function fetchFlow(): Promise<string> {
  const res = await fetch('/api/flow');
  const data = (await res.json()) as { mermaid?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `flow request failed (${res.status})`);
  return data.mermaid ?? '';
}
