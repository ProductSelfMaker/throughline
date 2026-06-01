// src/core/transcript.test.ts
import { describe, it, expect } from 'vitest';
import { encodeProjectDir, parseEntries } from './transcript';

describe('encodeProjectDir', () => {
  it('replaces every non-alphanumeric char in the cwd with a dash', () => {
    expect(encodeProjectDir('/Users/u/Developer/Thorughline')).toBe(
      '-Users-u-Developer-Thorughline',
    );
  });
});

describe('parseEntries', () => {
  it('keeps user string prompts and assistant text blocks, skips noise', () => {
    const lines = [
      JSON.stringify({ type: 'user', message: { role: 'user', content: '로그인 만들어줘' } }),
      JSON.stringify({
        type: 'assistant',
        message: {
          role: 'assistant',
          content: [
            { type: 'thinking', thinking: '...' },
            { type: 'text', text: '로그인 컴포넌트 추가했어요' },
            { type: 'tool_use', name: 'Edit', input: {} },
          ],
        },
      }),
      JSON.stringify({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', content: 'ok' }] } }),
      JSON.stringify({ type: 'assistant', isSidechain: true, message: { role: 'assistant', content: [{ type: 'text', text: '서브에이전트' }] } }),
      JSON.stringify({ type: 'system', subtype: 'hook' }),
      'not json',
    ].join('\n');

    expect(parseEntries(lines)).toEqual([
      { role: 'user', text: '로그인 만들어줘' },
      { role: 'assistant', text: '로그인 컴포넌트 추가했어요' },
    ]);
  });
});
