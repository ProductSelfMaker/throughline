// src/domain/product-doc-prompt.test.ts
import { describe, it, expect } from 'vitest';
import { buildCodeMapPrompt, buildReduceMergePrompt, buildProductDocPrompt } from './product-doc-prompt';

describe('buildCodeMapPrompt', () => {
  it('embeds the code and asks for user-facing behavior, not code internals', () => {
    const p = buildCodeMapPrompt('src/App.tsx', '<button>저장</button>');
    expect(p).toContain('<button>저장</button>');
    expect(p).toContain('사용자에게 보이는');     // product perspective
    expect(p).toContain('구현 방식');             // explicitly excludes implementation
  });
});

describe('buildReduceMergePrompt', () => {
  it('merges summaries without losing detail', () => {
    const p = buildReduceMergePrompt('- 기능 A\n- 기능 B');
    expect(p).toContain('- 기능 A');
    expect(p).toContain('디테일');
  });
});

describe('buildProductDocPrompt', () => {
  it('synthesizes the house structure from the feature summary + context', () => {
    const p = buildProductDocPrompt('- 저장 버튼: 클릭 시 저장', {
      manifest: '{"name":"demo"}',
      readme: '# Demo',
      decisions: '- 옵저버 모델',
      activity: '사용자: 저장 추가',
      truncated: true,
    });
    expect(p).toContain('- 저장 버튼: 클릭 시 저장'); // feature summary
    expect(p).toContain('## 개요');
    expect(p).toContain('## 열린 질문');
    expect(p).toContain('아주 아주 디테일');           // detail demand
    expect(p).toContain('분량 제한');                  // truncation note included
    expect(p).toContain('# Demo');                     // README context
    expect(p).toContain('옵저버 모델');                // decisions context
  });
});
