// src/server/app.ts
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import { homedir } from 'node:os';
import { Session, isJobKind } from './session';

export function createApp(session: Session): Hono {
  const app = new Hono();

  // which project this instance observes (shown in the top row)
  app.get('/api/info', (c) => {
    const cwd = session.projectDir();
    const home = homedir();
    const display = home && cwd.startsWith(home) ? '~' + cwd.slice(home.length) : cwd;
    return c.json({ cwd, display });
  });

  app.post('/api/curate', async (c) => {
    const body = await c.req.json<{ instruction?: string }>();
    const instruction = (body.instruction ?? '').trim();
    if (!instruction) return c.json({ error: 'empty instruction' }, 400);
    await session.curate(instruction);
    return c.json({ ok: true });
  });

  // Start a per-page rebuild (doc | decisions | mockup) as a background job. The work
  // runs detached from this request and completes even if the user leaves the page;
  // progress arrives via the 'job-updated' SSE event.
  app.post('/api/jobs/:kind', (c) => {
    const kind = c.req.param('kind');
    if (!isJobKind(kind)) return c.json({ error: 'unknown job kind' }, 400);
    const started = session.startJob(kind);
    return c.json({ started, running: session.runningJobs() });
  });

  // project = your coding usage; self = Throughline's own usage (same shape)
  app.get('/api/analytics', async (c) => c.json({ project: await session.analytics(), self: await session.overhead() }));

  // history: recent work items (cards) + on-demand detail for one item
  app.get('/api/history', async (c) => {
    const limit = Math.min(Math.max(Number(c.req.query('limit')) || 100, 1), 300);
    return c.json({ items: await session.workItems(limit) });
  });
  app.get('/api/history/item', async (c) => {
    const file = c.req.query('file') ?? '';
    const start = Number(c.req.query('start'));
    const end = Number(c.req.query('end'));
    if (!file || !Number.isFinite(start) || !Number.isFinite(end)) return c.json({ error: 'bad request' }, 400);
    const detail = await session.workItemDetail(file, start, end);
    return detail ? c.json(detail) : c.json({ error: 'not found' }, 404);
  });

  // stale-while-revalidate: return the cached ledger instantly, extend it in the
  // background if there are new turns (result arrives via 'decisions-updated' SSE).
  app.get('/api/decisions', async (c) => {
    const items = await session.readDecisions();
    const refreshing = await session.refreshDecisionsIfStale();
    return c.json({ items, refreshing });
  });

  // read-only: the latest mockup html. Generation is a background job (POST /api/jobs/mockup).
  app.get('/api/mockup', async (c) => c.json({ html: await session.readMockup() }));

  app.get('/api/events', (c) => {
    return streamSSE(c, async (stream) => {
      const current = await session.readSpec();
      await stream.writeSSE({ event: 'spec-updated', data: JSON.stringify({ md: current, changedLines: [] }) });
      await stream.writeSSE({ event: 'status', data: JSON.stringify({ working: session.isWorking() }) });
      // replay in-flight jobs so a freshly-connected / reloaded client restores busy state
      await stream.writeSSE({ event: 'jobs', data: JSON.stringify({ running: session.runningJobs() }) });
      const unsub = session.broadcaster.subscribe((event, data) => {
        // never let a write to a closed stream become an unhandled rejection (crashes Node)
        stream.writeSSE({ event, data: JSON.stringify(data) }).catch(() => {});
      });
      stream.onAbort(() => unsub());
      if (stream.aborted) { unsub(); return; }
      while (!stream.aborted) {
        await stream.sleep(30_000);
        if (!stream.aborted) await stream.writeSSE({ event: 'ping', data: '' });
      }
    });
  });

  app.get('/api/flow', async (c) => {
    try {
      const mermaid = await session.generateFlow(c.req.raw.signal);
      return c.json({ mermaid });
    } catch (err) {
      return c.json({ error: (err as Error)?.message ?? String(err) }, 500);
    }
  });

  return app;
}
