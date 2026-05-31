// src/domain/scribe-prompt.ts
import { Message, SPINE_HEADINGS } from './types';

export function buildScribePrompt(
  currentSpecMarkdown: string,
  transcript: Message[],
): string {
  const convo = transcript
    .map((m) => `${m.role === 'user' ? '사용자' : 'AI'}: ${m.content}`)
    .join('\n');

  return [
    '너는 기획 대화를 "살아있는 기획서"(마크다운)로 응결시키는 스크라이브다.',
    '규칙:',
    `1) 다음 세 고정 섹션은 항상 존재해야 한다(비어 있어도 헤딩은 유지): ${SPINE_HEADINGS.join(' , ')}`,
    '2) "## ✅ 핵심 기능"은 체크박스 목록(- [ ] 또는 - [x])으로 적고, 기존 줄의 <!-- id: ... --> 주석은 절대 바꾸지 말고 그대로 보존한다.',
    '3) 아직 정해지지 않았거나 모순된 것은 "## 🟡 미정 / 열린 질문"에 - 불릿으로 모은다.',
    '4) 대화에서 등장한 그 외 주제는 "## <주제>" 섹션으로 자유롭게 자라게 한다.',
    '5) 사용자의 지시를 기다리지 말고, 대화 내용을 반영해 문서를 능동적으로 갱신한다.',
    '',
    '현재 기획서:',
    '"""',
    currentSpecMarkdown,
    '"""',
    '',
    '최근 대화:',
    '"""',
    convo,
    '"""',
    '',
    '갱신된 기획서 마크다운 "전체"만 출력하라. 설명 문장이나 코드펜스(```) 없이 마크다운 본문만.',
  ].join('\n');
}
