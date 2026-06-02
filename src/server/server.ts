// src/server/server.ts
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { existsSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import open from 'open';
import { SpecStore } from '../core/spec-store';
import { ClaudeCodeRunner } from '../agent/claude-code-runner';
import { ConversationStore } from './conversation-store';
import { Session } from './session';
import { createApp } from './app';

// Absolute path to the built web UI (repo-root/dist), resolved relative to THIS
// file — NOT the launch directory — so Throughline can be started from inside
// any project and still serve its own UI.
const distDir = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'dist');

// Target project directory: the first CLI arg if given, else the current dir —
// so both `throughline ~/proj` and `cd ~/proj && throughline` work. Throughline
// binds its conversation, spec, and the agent's cwd to this directory.
const cwd = process.argv[2] ? resolve(process.argv[2]) : process.cwd();
if (!existsSync(cwd) || !statSync(cwd).isDirectory()) {
  console.error(`Throughline: '${cwd}' is not a directory.`);
  process.exit(1);
}

const specPath = join(cwd, 'spec.md');

const session = new Session({
  store: new SpecStore(specPath),
  runner: new ClaudeCodeRunner({ cwd }),
  conversation: new ConversationStore(cwd),
  cwd,
});
await session.init();

const app = createApp(session);

const hasUI = existsSync(distDir);
if (hasUI) {
  app.use('/*', serveStatic({ root: distDir }));
}

const port = Number(process.env.PORT ?? 5174);
serve({ fetch: app.fetch, port }, (info) => {
  const url = `http://localhost:${info.port}`;
  console.log(`Throughline → ${url}  (working in ${cwd})`);
  if (process.env.OPEN !== '0' && hasUI) void open(url);
});

const shutdown = () => {
  session.stop();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
