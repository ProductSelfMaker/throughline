// src/server/server.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import open from 'open';
import { SpecStore } from '../core/spec-store';
import { ClaudeCodeRunner } from '../agent/claude-code-runner';
import { Session } from './session';
import { createApp } from './app';

const cwd = process.cwd();
const specPath = join(cwd, 'spec.md');

const session = new Session({
  store: new SpecStore(specPath),
  runner: new ClaudeCodeRunner({ cwd }),
});
const app = createApp(session);

// Serve the built frontend when present (production / `npm start`).
if (existsSync(join(cwd, 'dist'))) {
  app.use('/*', serveStatic({ root: './dist' }));
}

const port = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, port }, (info) => {
  const url = `http://localhost:${info.port}`;
  console.log(`Throughline → ${url}  (editing ${specPath})`);
  if (process.env.OPEN !== '0' && existsSync(join(cwd, 'dist'))) void open(url);
});

const shutdown = () => {
  session.flush();
  session.close();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
