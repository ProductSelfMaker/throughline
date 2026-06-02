// src/agent/fake-runner.test.ts
import { describe, it, expect } from 'vitest';
import { FakeAgentRunner } from './fake-runner';

describe('FakeAgentRunner', () => {
  it('returns a scripted scribe reply, supporting a function form', async () => {
    const runner = new FakeAgentRunner({ scribeReply: (cur) => cur + '\n## ✅ 기능 요구사항\n- [ ] 새 기능' });
    expect(await runner.scribe('## 📌 개요', [])).toBe('## 📌 개요\n## ✅ 기능 요구사항\n- [ ] 새 기능');
  });

  it('returns a scripted complete() reply, supporting a function form', async () => {
    expect(await new FakeAgentRunner({ completeReply: 'flowchart TD\n  A-->B' }).complete('x')).toBe('flowchart TD\n  A-->B');
    expect(await new FakeAgentRunner({ completeReply: (p) => `len:${p.length}` }).complete('abc')).toBe('len:3');
  });
});
