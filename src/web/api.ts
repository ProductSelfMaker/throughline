// src/web/api.ts
export type SpecUpdate = { md: string; changedLines: number[] };
export type TranscriptEntry = { role: 'user' | 'assistant'; text: string };

/** Subscribe to live spec + transcript updates over SSE. Returns an unsubscribe fn. */
export function subscribeEvents(handlers: {
  onSpec?: (u: SpecUpdate) => void;
  onTranscript?: (entries: TranscriptEntry[]) => void;
}): () => void {
  const es = new EventSource('/api/events');
  if (handlers.onSpec)
    es.addEventListener('spec-updated', (e) => handlers.onSpec!(JSON.parse((e as MessageEvent).data)));
  if (handlers.onTranscript)
    es.addEventListener('transcript-updated', (e) => handlers.onTranscript!(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}

export async function fetchTranscript(): Promise<TranscriptEntry[]> {
  const res = await fetch('/api/transcript');
  const data = (await res.json()) as { entries?: TranscriptEntry[] };
  return data.entries ?? [];
}

/** Fetch a freshly generated mermaid user-flow for the current spec. */
export async function fetchFlow(): Promise<string> {
  const res = await fetch('/api/flow');
  const data = (await res.json()) as { mermaid?: string; error?: string };
  if (!res.ok || data.error) throw new Error(data.error ?? `flow request failed (${res.status})`);
  return data.mermaid ?? '';
}
