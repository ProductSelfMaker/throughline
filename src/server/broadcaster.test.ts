// src/server/broadcaster.test.ts
import { describe, it, expect, vi } from 'vitest';
import { Broadcaster } from './broadcaster';

describe('Broadcaster', () => {
  it('delivers events to all subscribers', () => {
    const b = new Broadcaster();
    const a = vi.fn();
    const c = vi.fn();
    b.subscribe(a);
    b.subscribe(c);
    b.broadcast('spec-updated', { md: 'x', changedLines: [1] });
    expect(a).toHaveBeenCalledWith('spec-updated', { md: 'x', changedLines: [1] });
    expect(c).toHaveBeenCalledWith('spec-updated', { md: 'x', changedLines: [1] });
  });

  it('stops delivering after unsubscribe', () => {
    const b = new Broadcaster();
    const a = vi.fn();
    const unsub = b.subscribe(a);
    unsub();
    b.broadcast('ping', null);
    expect(a).not.toHaveBeenCalled();
    expect(b.size).toBe(0);
  });
});
