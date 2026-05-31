// src/server/broadcaster.ts
export type BroadcastListener = (event: string, data: unknown) => void;

/** Tiny pub/sub used to fan engine/file events out to all connected SSE clients. */
export class Broadcaster {
  private listeners = new Set<BroadcastListener>();

  subscribe(listener: BroadcastListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  broadcast(event: string, data: unknown): void {
    for (const listener of this.listeners) listener(event, data);
  }

  get size(): number {
    return this.listeners.size;
  }
}
