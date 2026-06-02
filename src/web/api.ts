// src/web/api.ts
export type SpecUpdate = { md: string; changedLines: number[] };

/** Subscribe to live PRD updates over SSE. */
export function subscribeSpec(onSpec: (u: SpecUpdate) => void): () => void {
  const es = new EventSource('/api/events');
  es.addEventListener('spec-updated', (e) => onSpec(JSON.parse((e as MessageEvent).data)));
  return () => es.close();
}

/** Send a curation instruction to the scribe (it edits the PRD; changes arrive via SSE). */
export async function curate(instruction: string): Promise<void> {
  const res = await fetch('/api/curate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ instruction }),
  });
  if (!res.ok) throw new Error(`curate failed (${res.status})`);
}

/** Reset & re-organize: rebuild the PRD from a bounded window of recent activity. */
export async function rebuild(): Promise<void> {
  const res = await fetch('/api/rebuild', { method: 'POST' });
  if (!res.ok) throw new Error(`rebuild failed (${res.status})`);
}
