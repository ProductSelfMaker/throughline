// src/domain/curate-prompt.ts
import { SPINE_HEADINGS } from './types';

export function buildCuratePrompt(
  currentPrd: string,
  instruction: string,
  gitDiff: string,
): string {
  return [
    '너는 살아있는 PRD(prd.md)를 관리하는 스크라이브다. 아래 "지시"에 따라 PRD를 고쳐라.',
    `고정 섹션은 항상 유지: ${SPINE_HEADINGS.join(' , ')}. 그 외 주제는 "## <주제>"로 자유롭게.`,
    '기존 줄의 <!-- id: ... --> 주석은 보존한다. 지시와 무관한 내용은 건드리지 마라.',
    '',
    '지시:',
    '"""',
    instruction,
    '"""',
    '',
    '현재 PRD:',
    '"""',
    currentPrd,
    '"""',
    '',
    '참고 코드 변경(git diff):',
    '"""',
    gitDiff || '(없음)',
    '"""',
    '',
    '갱신된 PRD 마크다운 "전체"만 출력하라. 설명·코드펜스(```) 없이.',
  ].join('\n');
}
