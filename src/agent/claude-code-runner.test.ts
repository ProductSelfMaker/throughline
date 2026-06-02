// src/agent/claude-code-runner.test.ts
import { describe, it, expect, vi } from 'vitest';

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: () =>
    (async function* () {
      yield {
        type: 'assistant',
        message: { content: [{ type: 'text', text: '추가' }, { type: 'text', text: '했어요' }] },
      };
    })(),
}));

import { ClaudeCodeRunner } from './claude-code-runner';

describe('ClaudeCodeRunner.complete', () => {
  it('concatenates assistant text blocks', async () => {
    const runner = new ClaudeCodeRunner({ cwd: '/tmp' });
    expect(await runner.complete('prompt')).toBe('추가했어요');
  });
});
