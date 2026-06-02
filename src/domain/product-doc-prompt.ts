// src/domain/product-doc-prompt.ts
// Code-grounded product doc (the "다시 정리" deep rebuild). map → (merge) → reduce.
// The doc describes the product from the USER's perspective (features/pages,
// behaviors, policies, states) — NOT code architecture or a work log.
import { SPINE_HEADINGS } from './types';

/** MAP: extract user-facing product behavior from one chunk of source code. */
export function buildCodeMapPrompt(chunkLabel: string, code: string): string {
  return [
    '너는 제품 분석가다. 아래는 어떤 제품의 *실제 소스 코드 일부*다.',
    '이 코드에서 *최종 사용자에게 보이는 제품의 기능·화면·동작*을 빠짐없이, 아주 구체적으로 추출하라.',
    '',
    '관점 규칙:',
    '- 코드 구조·구현 방식(함수/클래스/파일/라이브러리)을 설명하지 마라. 오직 *사용자에게 보이는 제품 동작*만.',
    '- 화면/페이지/뷰, 버튼·입력·메뉴 같은 요소, 동작 규칙과 정책, 상태(유휴/로딩/빈/오류/오버레이/모달 등), 사용자가 할 수 있는 행동을 구체적으로.',
    '- 코드에 근거가 있는 것만. 추측이 필요한 부분은 따로 "열린 질문"으로 표시.',
    '',
    `대상 코드: ${chunkLabel}`,
    '"""',
    code,
    '"""',
    '',
    '출력: 발견한 기능/화면별로 묶어서 마크다운 불릿으로. 각 항목에 무엇/동작·정책/요소/상태를 최대한 구체적으로. 근거가 약하면 "(추측)"으로 표기. 설명 문장·코드펜스 없이 불릿만.',
  ].join('\n');
}

/** MERGE: collapse several map summaries into fewer, losslessly (for big repos). */
export function buildReduceMergePrompt(summaries: string): string {
  return [
    '아래는 같은 제품의 여러 코드 영역에서 뽑은 *사용자 관점 기능 요약*들이다.',
    '이들을 기능/화면 단위로 합치되, **구체적인 디테일을 절대 잃지 마라**(동작·정책·요소·상태·열린 질문 보존).',
    '같은 기능에 대한 중복은 하나로 통합하고, 서로 다른 기능은 모두 유지한다.',
    '',
    '요약들:',
    '"""',
    summaries,
    '"""',
    '',
    '출력: 통합된 기능별 마크다운 불릿만. 설명 문장·코드펜스 없이.',
  ].join('\n');
}

export interface DocContext {
  manifest?: string;   // package.json 등 — 제품명/설명 근거
  readme?: string;     // README — 개요 근거
  decisions?: string;  // 누적 의사결정 — 왜
  activity?: string;   // 최근 대화/작업 발췌 — 의도·열린 질문
  truncated?: boolean; // 코드가 분량 제한으로 일부 제외됐는지
}

/** REDUCE: synthesize the final, detailed product doc in the house structure. */
export function buildProductDocPrompt(featureSummary: string, ctx: DocContext): string {
  const lines = [
    '너는 사용자가 만들고 있는 서비스를 *사용자에게 설명하는 제품 문서*(doc.md)를 작성한다.',
    '아래 "기능 요약"은 제품의 실제 코드 전체를 훑어 뽑은 사용자 관점 기능 목록이다. 이것을 근거로 *아주 아주 디테일한* 제품 문서를 새로 작성하라.',
    '',
    '문서 규칙:',
    `1) "## 개요"(서비스가 무엇인지·누구를 위한 것인지, 사용자 관점 1~2문단)와 "## 열린 질문"은 항상 둔다. (스파인: ${SPINE_HEADINGS.join(' , ')})`,
    '2) 기능/페이지마다 "## <이름>" 섹션. 각 섹션에 **무엇**(한 줄), **동작·정책**(규칙을 구체적으로), **요소**(화면 구성 요소), **상태**(유휴/로딩/빈/오류/오버레이 등 해당될 때)를 빠짐없이.',
    '3) 디테일을 아끼지 마라 — 코드에 드러난 정책·엣지케이스·상호작용·상태 전이를 최대한 구체적으로 적는다. 단, 사용자 관점으로(코드 내부 구현 설명 금지).',
    '4) 이건 작업 로그가 아니다. 커밋·할 일·작업 과정은 쓰지 않는다(그건 히스토리).',
    '5) 근거가 약하거나 코드만으로 알 수 없는 제품 의도는 "## 열린 질문"에 - 불릿으로 모은다.',
    '6) 코드에 없는 기능을 지어내지 마라.',
  ];
  if (ctx.truncated) {
    lines.push('7) 코드가 분량 제한으로 일부만 분석됐다. 빠졌을 수 있는 영역은 "## 열린 질문"에 한 줄로 남겨라.');
  }
  lines.push(
    '',
    '기능 요약(코드 전수 조사 결과):',
    '"""',
    featureSummary || '(비어 있음)',
    '"""',
  );
  if (ctx.manifest) lines.push('', '제품 메타데이터(manifest):', '"""', ctx.manifest.slice(0, 2000), '"""');
  if (ctx.readme) lines.push('', 'README:', '"""', ctx.readme.slice(0, 4000), '"""');
  if (ctx.decisions) lines.push('', '누적 의사결정(왜 — 참고):', '"""', ctx.decisions.slice(0, 4000), '"""');
  if (ctx.activity) lines.push('', '최근 활동(의도·열린 질문 참고):', '"""', ctx.activity.slice(0, 4000), '"""');
  lines.push('', '완성된 제품 문서 마크다운 "전체"만 출력하라. 설명·코드펜스(```) 없이.');
  return lines.join('\n');
}
