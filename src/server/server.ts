// src/server/server.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, statSync, copyFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { SpecStore } from '../core/spec-store';
import { IngestStore } from '../core/ingest-store';
import { ClaudeCodeRunner } from '../agent/claude-code-runner';
import { SessionLogReader } from '../agent/session-log-reader';
import { Session } from './session';
import { createApp } from './app';

// Absolute path to the built web UI (repo-root/dist), resolved relative to THIS
// file — not the launch directory — so Throughline can be started from any project.
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

// Target project directory: the first CLI arg if given, else the current dir.
const cwd = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
  console.error(`Throughline: '${cwd}' is not a directory.`);
  process.exit(1);
}

// The accumulating PRD lives in the project's .throughline/ folder.
const prdPath = join(cwd, '.throughline', 'prd.md');
// Migrate a legacy root spec.md into .throughline/prd.md on first run.
const legacy = join(cwd, 'spec.md');
if (!existsSync(prdPath) && existsSync(legacy)) {
  try {
    mkdirSync(dirname(prdPath), { recursive: true });
    copyFileSync(legacy, prdPath);
  } catch {
    // best-effort; SpecStore will scaffold DEFAULT_SPEC otherwise
  }
}

// Run the scribe agent in a neutral dir (not the observed project) so its own
// Claude Code session logs don't land in the watched dir and feed back into the PRD.
const scribeDir = join(cwd, '.throughline', 'agent');
mkdirSync(scribeDir, { recursive: true });

const session = new Session({
  store: new SpecStore(prdPath),
  runner: new ClaudeCodeRunner({ cwd: scribeDir }),
  reader: new SessionLogReader({ cwd }),
  // reads Throughline's own scribe-agent logs → the "overhead" token breakdown
  selfReader: new SessionLogReader({ cwd: scribeDir }),
  ingest: new IngestStore(cwd),
  cwd,
});
await session.init();

const app = createApp(session);

const hasUI = existsSync(distDir);
if (hasUI) {
  app.use('/*', serveStatic({ root: distDir }));
}

// Bind a free port so several projects can each run their own Throughline at once
// (different terminals → different ports). Bind-and-retry: the real listen is the
// test, so simultaneous launches never collide (no probe-then-bind race).
const desiredPort = Number(process.env.PORT ?? 5174);
const MAX_PORT_TRIES = 30;
function startServer(port: number, triesLeft: number): void {
  const server = serve({ fetch: app.fetch, port }, (info) => {
    const url = `http://localhost:${info.port}`;
    if (info.port !== desiredPort) console.log(`Throughline: port ${desiredPort} busy → using ${info.port}`);
    console.log(`Throughline → ${url}  (observing ${cwd})`);
    if (process.env.OPEN !== '0' && hasUI) void open(url);
  });
  server.once('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && triesLeft > 0) {
      startServer(port + 1, triesLeft - 1);
    } else {
      console.error(`Throughline: failed to start — ${err.message}`);
      process.exit(1);
    }
  });
}
startServer(desiredPort, MAX_PORT_TRIES);

const shutdown = () => { session.stop(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
