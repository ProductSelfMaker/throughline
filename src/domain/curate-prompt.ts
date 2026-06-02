// src/domain/curate-prompt.ts
import { SPINE_HEADINGS } from './types';

export function buildCuratePrompt(
  currentPrd: string,
  instruction: string,
  gitDiff: string,
): string {
  return [
    '너는 사용자에게 서비스를 설명하는 제품 문서(doc.md)를 관리하는 스크라이브다. 아래 "지시"에 따라 문서를 고쳐라.',
    `"## 개요"와 "## 열린 질문"은 항상 유지하고, 기능/페이지는 "## <이름>" 섹션으로 둔다. (스파인: ${SPINE_HEADINGS.join(' , ')})`,
    '사용자 관점의 동작·정책·요소·상태를 적고, 작업 로그는 쓰지 않는다. 지시와 무관한 내용은 건드리지 마라.',
    '',
    '지시:',
    '"""',
    instruction,
    '"""',
    '',
    '현재 문서:',
    '"""',
    currentPrd,
    '"""',
    '',
    '참고 코드 변경(git diff):',
    '"""',
    gitDiff || '(없음)',
    '"""',
    '',
    '갱신된 문서 마크다운 "전체"만 출력하라. 설명·코드펜스(```) 없이.',
  ].join('\n');
}
