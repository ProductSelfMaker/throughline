// src/domain/scribe-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildScribePrompt } from './scribe-prompt';
import { SPINE_HEADINGS, Message } from './types';

describe('buildScribePrompt', () => {
  const transcript: Message[] = [
    { role: 'user', content: '로그인은 소셜만 쓸게' },
    { role: 'assistant', content: '구글/애플 추가했어요' },
  ];

  it('embeds the spine, current doc, and transcript, and demands full output', () => {
    const prompt = buildScribePrompt('## 개요\n기존', transcript);
    for (const h of SPINE_HEADINGS) expect(prompt).toContain(h);
    expect(prompt).toContain('기존');
    expect(prompt).toContain('로그인은 소셜만 쓸게');
    expect(prompt).toContain('구글/애플 추가했어요');
    expect(prompt).toContain('전체');
  });
});
