// src/cli/scribe-cli.ts
import { readFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { SpecStore } from '../core/spec-store';
import { ScribeEngine } from '../core/scribe-engine';
import { ClaudeCodeRunner } from '../agent/claude-code-runner';
import { Message } from '../domain/types';

const { values } = parseArgs({
  options: {
    spec: { type: 'string' },
    transcript: { type: 'string' },
  },
});

if (!values.spec || !values.transcript) {
  console.error('usage: npm run scribe -- --spec <spec.md> --transcript <transcript.json>');
  process.exit(1);
}

const transcript = JSON.parse(await readFile(values.transcript, 'utf8')) as Message[];
const engine = new ScribeEngine(
  new SpecStore(values.spec),
  new ClaudeCodeRunner({ cwd: process.cwd() }),
);

const result = await engine.runNow(transcript);
if (!result) {
  console.error('scribe rejected: agent output failed structure validation');
  process.exit(2);
}
console.log(`updated ${values.spec} — ${result.changedLines.length} changed line(s)`);
