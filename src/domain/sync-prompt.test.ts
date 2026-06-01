// src/domain/sync-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildSyncPrompt } from './sync-prompt';
import { SPINE_HEADINGS } from './types';

describe('buildSyncPrompt', () => {
  it('embeds spec, transcript, and diff, and asks to reconcile reality', () => {
    const prompt = buildSyncPrompt('## ✅ 핵심 기능\n- [ ] 소셜 로그인', '사용자: 로그인 만들어줘', 'diff --git a/login.tsx');
    for (const h of SPINE_HEADINGS) expect(prompt).toContain(h);
    expect(prompt).toContain('소셜 로그인');
    expect(prompt).toContain('로그인 만들어줘');
    expect(prompt).toContain('login.tsx');
    expect(prompt).toContain('[x]');
    expect(prompt).toContain('전체');
  });
});
