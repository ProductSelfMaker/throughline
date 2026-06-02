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
    '너는 대화를 *사용자에게 서비스를 설명하는 제품 문서*(마크다운)로 응결시키는 스크라이브다.',
    '시스템 내부가 아니라 사용자 관점에서 각 기능/페이지가 무엇이고 어떻게 동작하는지(정책·요소·상태)를 적는다. 작업 로그는 쓰지 않는다.',
    '규칙:',
    `1) "## 개요"와 "## 열린 질문"은 항상 존재해야 한다. (스파인: ${SPINE_HEADINGS.join(' , ')})`,
    '2) 기능/페이지마다 "## <이름>" 섹션을 만들고 무엇/동작·정책/요소/상태를 적는다.',
    '3) 아직 정해지지 않은 것은 "## 열린 질문"에 - 불릿으로 모은다.',
    '4) 사용자의 지시를 기다리지 말고, 대화 내용을 반영해 문서를 능동적으로 갱신한다.',
    '',
    '현재 문서:',
    '"""',
    currentSpecMarkdown,
    '"""',
    '',
    '최근 대화:',
    '"""',
    convo,
    '"""',
    '',
    '갱신된 문서 마크다운 "전체"만 출력하라. 설명 문장이나 코드펜스(```) 없이 마크다운 본문만.',
  ].join('\n');
}
