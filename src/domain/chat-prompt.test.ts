import { describe, it, expect } from 'vitest';
import { buildChatPrompt, extractDocEdit } from './chat-prompt';

describe('buildChatPrompt', () => {
  it('embeds the conversation, the doc, and asks to converse / clarify / edit-only-when-clear', () => {
    const p = buildChatPrompt(
      [{ role: 'user', text: '저장 정책 설명해줘' }, { role: 'assistant', text: '자동 저장입니다.' }, { role: 'user', text: '리스크 섹션 추가해' }],
      '## Overview\n현재 문서',
      'diff --git a/x',
    );
    expect(p).toContain('저장 정책 설명해줘');     // history embedded
    expect(p).toContain('리스크 섹션 추가해');
    expect(p).toContain('현재 문서');               // current doc
    expect(p).toContain('x');                        // diff
    expect(p.toLowerCase()).toContain('clarifying'); // ask a clarifying question when ambiguous
    expect(p).toContain('DOC');                       // the doc-edit block contract
  });
});

describe('extractDocEdit', () => {
  it('splits a reply from a trailing DOC block', () => {
    const raw = 'Added a Risks section.\n<!--DOC\n## Overview\nX\n\n## Risks\n- r\n\n## Open Questions\n- q\nDOC-->';
    const { reply, doc } = extractDocEdit(raw);
    expect(reply).toBe('Added a Risks section.');
    expect(doc).toContain('## Risks');
  });

  it('returns doc=null when there is no edit (a plain reply / clarifying question)', () => {
    const { reply, doc } = extractDocEdit('Did you mean the Billing page or the Cart page?');
    expect(reply).toBe('Did you mean the Billing page or the Cart page?');
    expect(doc).toBeNull();
  });
});
