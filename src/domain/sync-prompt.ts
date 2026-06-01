// src/domain/sync-prompt.ts
import { SPINE_HEADINGS } from './types';

export function buildSyncPrompt(
  currentSpecMarkdown: string,
  transcriptExcerpt: string,
  gitDiff: string,
): string {
  return [
    '너는 사용자가 "실제로 만든 것"을 따라 살아있는 기획서(spec.md)를 최신화하는 스크라이브다.',
    '사용자는 자기 터미널에서 직접 코딩 중이고, 아래는 최근 AI 대화 발췌와 코드 변경(git diff)이다.',
    '규칙:',
    `1) 세 고정 섹션은 항상 유지: ${SPINE_HEADINGS.join(' , ')}`,
    '2) 코드/대화로 구현이 확인된 기능은 "## ✅ 핵심 기능"에서 - [x] 로 체크한다.',
    '3) 새로 만들어진 동작은 기능 목록·해당 섹션에 추가한다.',
    '4) 기존 줄의 <!-- id: ... --> 주석은 절대 바꾸지 말고 그대로 보존한다.',
    '5) 코드로 해결된 항목은 "## 🟡 미정 / 열린 질문"에서 뺀다.',
    '6) 추측으로 없는 기능을 지어내지 말고, 대화·diff에 근거한 것만 반영한다.',
    '',
    '현재 기획서:',
    '"""',
    currentSpecMarkdown,
    '"""',
    '',
    '최근 대화 발췌:',
    '"""',
    transcriptExcerpt || '(없음)',
    '"""',
    '',
    '코드 변경(git diff):',
    '"""',
    gitDiff || '(없음)',
    '"""',
    '',
    '갱신된 기획서 마크다운 "전체"만 출력하라. 설명·코드펜스(```) 없이.',
  ].join('\n');
}
