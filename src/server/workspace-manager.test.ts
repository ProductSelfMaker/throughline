import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { WorkspaceManager } from './workspace-manager';
import type { Session } from './session';
import type { ActivityReader } from '../domain/types';

/** A minimal Session stub recording the manager's calls. */
function stubSession() {
  const calls = { init: 0, notify: 0, fresh: 0 };
  const s = {
    calls,
    init: async () => { calls.init += 1; },
    notifyActivity: () => { calls.notify += 1; },
    startFresh: async () => { calls.fresh += 1; },
    readSpec: async () => '## Overview\n',
    readDecisions: async () => [],
    flush: () => {},
    stop: () => {},
  };
  return s as unknown as Session & { calls: typeof calls };
}

let dir: string;
let mgr: WorkspaceManager | undefined;
beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'tl-ws-')); });
afterEach(async () => { mgr?.stop(); await rm(dir, { recursive: true, force: true }); });

describe('WorkspaceManager', () => {
  it('creates a default workspace, creates/selects more, and routes activity to the active one', async () => {
    const made: Record<string, ReturnType<typeof stubSession>> = {};
    let watchCb: () => void = () => {};
    const reader = { watch: (cb: () => void) => { watchCb = cb; return () => {}; } } as unknown as ActivityReader;
    mgr = new WorkspaceManager({
      cwd: dir,
      reader,
      makeSession: ({ id }) => { const s = stubSession(); made[id] = s; return s; },
    });
    await mgr.init();

    expect(mgr.list().map((w) => w.id)).toEqual(['default']);
    expect(mgr.activeInfo()).toEqual({ id: 'default', name: 'Default', isDefault: true });

    watchCb();                                   // activity routes to the active (default)
    expect(made['default'].calls.notify).toBe(1);

    const w = await mgr.create('Feature X');     // create a new workspace
    expect(w.isDefault).toBe(false);
    expect(w.name).toBe('Feature X');
    expect(made[w.id].calls.fresh).toBe(1);      // new workspace captures from now

    const changed = new Promise<string>((res) => mgr!.broadcaster.subscribe((ev, d) => { if (ev === 'workspace-changed') res((d as { id: string }).id); }));
    expect(await mgr.select(w.id)).toBe(true);
    expect(mgr.activeInfo().id).toBe(w.id);
    expect(await changed).toBe(w.id);            // SSE 'workspace-changed' emitted
    expect(made[w.id].calls.fresh).toBe(2);      // capture-from-now again on activation

    watchCb();                                   // activity now routes to the new workspace
    expect(made[w.id].calls.notify).toBe(1);
    expect(made['default'].calls.notify).toBe(1); // default unchanged
  });

  it('persists the registry across reloads', async () => {
    const reader = { watch: () => () => {} } as unknown as ActivityReader;
    const make = () => stubSession();
    mgr = new WorkspaceManager({ cwd: dir, reader, makeSession: make });
    await mgr.init();
    const w = await mgr.create('Beta');
    await mgr.select(w.id);
    mgr.stop();

    const mgr2 = new WorkspaceManager({ cwd: dir, reader, makeSession: make });
    await mgr2.init();
    expect(mgr2.list().map((x) => x.name)).toEqual(['Default', 'Beta']);
    expect(mgr2.activeInfo().id).toBe(w.id); // active persisted
    mgr2.stop();
  });
});
