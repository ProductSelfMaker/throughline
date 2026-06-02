// src/agent/fake-runner.test.ts
import { describe, it, expect } from 'vitest';
import { FakeAgentRunner } from './fake-runner';

describe('FakeAgentRunner', () => {
  it('converse returns converseReply with no events when chatEvents is omitted', async () => {
    const runner = new FakeAgentRunner({ converseReply: 'hi' });
    const events: any[] = [];
    const full = await runner.converse([], (e) => events.push(e));
    expect(events).toEqual([]);
    expect(full).toBe('hi');
  });

  it('returns a scripted scribe reply, supporting a function form', async () => {
    const runner = new FakeAgentRunner({
      scribeReply: (cur) => cur + '\n## ✅ 핵심 기능\n- [ ] 새 기능',
    });
    expect(await runner.scribe('## 🎯 요약', [])).toBe(
      '## 🎯 요약\n## ✅ 핵심 기능\n- [ ] 새 기능',
    );
  });

  it('returns a scripted complete() reply, supporting a function form', async () => {
    const runner = new FakeAgentRunner({ completeReply: 'flowchart TD\n  A-->B' });
    expect(await runner.complete('any prompt')).toBe('flowchart TD\n  A-->B');

    const dynamic = new FakeAgentRunner({ completeReply: (p) => `len:${p.length}` });
    expect(await dynamic.complete('abc')).toBe('len:3');
  });

  it('converse emits scripted chat events and returns the text', async () => {
    const runner = new FakeAgentRunner({
      chatEvents: [
        { type: 'tool', name: 'Edit', target: 'src/Login.tsx' },
        { type: 'text', text: '로그인 추가했어요' },
      ],
    });
    const events: any[] = [];
    const reply = await runner.converse([{ role: 'user', content: '로그인' }], (e) => events.push(e));
    expect(events).toEqual([
      { type: 'tool', name: 'Edit', target: 'src/Login.tsx' },
      { type: 'text', text: '로그인 추가했어요' },
    ]);
    expect(reply).toBe('로그인 추가했어요');
  });
});
