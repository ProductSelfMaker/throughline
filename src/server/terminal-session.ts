// src/server/terminal-session.ts
export interface Pty {
  write(data: string): void;
  resize(cols: number, rows: number): void;
  onData(cb: (data: string) => void): void;
  onExit(cb: () => void): void;
  kill(): void;
}

const DEFAULT_CAP = 64 * 1024;

/** Wraps a PTY: keeps a bounded scrollback buffer and fans output to subscribers. */
export class TerminalSession {
  private buffer = '';
  private subscribers = new Set<(d: string) => void>();
  private exited = false;

  constructor(private pty: Pty, private cap = DEFAULT_CAP) {
    pty.onData((d) => {
      this.buffer = (this.buffer + d).slice(-this.cap);
      for (const s of this.subscribers) s(d);
    });
    pty.onExit(() => {
      this.exited = true;
    });
  }

  get isExited(): boolean { return this.exited; }
  snapshot(): string { return this.buffer; }

  subscribe(cb: (d: string) => void): () => void {
    this.subscribers.add(cb);
    return () => { this.subscribers.delete(cb); };
  }

  write(data: string): void { this.pty.write(data); }
  resize(cols: number, rows: number): void { this.pty.resize(cols, rows); }
  kill(): void { this.pty.kill(); }
}
