// src/domain/mockup-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildMockupPrompt } from './mockup-prompt';

describe('buildMockupPrompt', () => {
  it('embeds the doc, real CSS and components, and asks for a body fragment only', () => {
    const p = buildMockupPrompt({
      doc: '## 개요\n로그인 서비스',
      css: '.tl{color:red}',
      components: 'function App(){return <div className="tl"/>}',
    });
    expect(p).toContain('로그인 서비스');           // product doc (data source)
    expect(p).toContain('.tl{color:red}');          // real CSS provided
    expect(p).toContain('className="tl"');          // component source provided
    expect(p).toContain('mock-canvas');             // body-fragment contract
  });

  it('forbids re-writing CSS and inventing screens, and demands interrupt states', () => {
    const p = buildMockupPrompt({ doc: '## 개요', css: '', components: '' });
    expect(p).toContain('CSS를 다시 쓰지'); // do not re-derive CSS
    expect(p).toContain('만들어내지 마라'); // do not invent screens
    expect(p).toContain('모달');            // interrupt/overlay states required
  });
});
