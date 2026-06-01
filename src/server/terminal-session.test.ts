// src/server/terminal-session.test.ts
import { describe, it, expect } from 'vitest';
import { TerminalSession, type Pty } from './terminal-session';

class FakePty implements Pty {
  written: string[] = [];
  resized: Array<[number, number]> = [];
  killed = false;
  private dataCb?: (d: string) => void;
  private exitCb?: () => void;
  write(d: string) { this.written.push(d); }
  resize(c: number, r: number) { this.resized.push([c, r]); }
  onData(cb: (d: string) => void) { this.dataCb = cb; }
  onExit(cb: () => void) { this.exitCb = cb; }
  kill() { this.killed = true; }
  emit(d: string) { this.dataCb?.(d); }   // test helper
  exit() { this.exitCb?.(); }              // test helper
}

describe('TerminalSession', () => {
  it('buffers output, caps the buffer, and snapshot() returns recent bytes', () => {
    const pty = new FakePty();
    const s = new TerminalSession(pty, 10); // cap=10 for the test
    pty.emit('abcdef');
    pty.emit('ghij');
    expect(s.snapshot()).toBe('abcdefghij');
    pty.emit('KLM'); // pushes over cap=10 → keep last 10
    expect(s.snapshot()).toBe('defghijKLM');
  });

  it('fans new data out to subscribers and stops after unsubscribe', () => {
    const pty = new FakePty();
    const s = new TerminalSession(pty);
    const got: string[] = [];
    const unsub = s.subscribe((d) => got.push(d));
    pty.emit('x');
    unsub();
    pty.emit('y');
    expect(got).toEqual(['x']);
  });

  it('forwards write/resize/kill to the pty and tracks exit', () => {
    const pty = new FakePty();
    const s = new TerminalSession(pty);
    s.write('ls\r');
    s.resize(100, 30);
    expect(pty.written).toEqual(['ls\r']);
    expect(pty.resized).toEqual([[100, 30]]);
    expect(s.isExited).toBe(false);
    pty.exit();
    expect(s.isExited).toBe(true);
    s.kill();
    expect(pty.killed).toBe(true);
  });

  it('notifies onExit subscribers and stops after unsubscribe', () => {
    const pty = new FakePty();
    const s = new TerminalSession(pty);
    let count = 0;
    const off = s.onExit(() => { count++; });
    off();
    pty.exit();
    expect(count).toBe(0);
    const s2 = new TerminalSession(new FakePty());
    // a fresh session whose exit IS observed:
    const pty2 = new FakePty();
    const s3 = new TerminalSession(pty2);
    let fired = false;
    s3.onExit(() => { fired = true; });
    pty2.exit();
    expect(fired).toBe(true);
    expect(s3.isExited).toBe(true);
    void s2;
  });
});
