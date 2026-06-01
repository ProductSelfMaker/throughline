// src/server/terminal-ws.test.ts
import { describe, it, expect } from 'vitest';
import { handleTerminalMessage } from './terminal-ws';
import { TerminalSession, type Pty } from './terminal-session';

class FakePty implements Pty {
  written: string[] = []; resized: Array<[number, number]> = [];
  write(d: string){ this.written.push(d); } resize(c: number,r: number){ this.resized.push([c,r]); }
  onData(){} onExit(){} kill(){}
}

describe('handleTerminalMessage', () => {
  it('routes input to write and resize to resize; ignores junk', () => {
    const pty = new FakePty();
    const s = new TerminalSession(pty);
    handleTerminalMessage(s, JSON.stringify({ type: 'input', data: 'ls\r' }));
    handleTerminalMessage(s, JSON.stringify({ type: 'resize', cols: 120, rows: 40 }));
    handleTerminalMessage(s, 'not json');
    handleTerminalMessage(s, JSON.stringify({ type: 'bogus' }));
    expect(pty.written).toEqual(['ls\r']);
    expect(pty.resized).toEqual([[120, 40]]);
  });
});
