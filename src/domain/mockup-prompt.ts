// src/domain/mockup-prompt.ts
// The mockup's CSS is the project's REAL stylesheet (embedded verbatim by the
// assembler). So the model must NOT write CSS — it reproduces each real screen's
// DOM using the actual class names, lays them out as artboards, and fills data
// from the product doc (inferring from the UI only where the doc is silent).
export function buildMockupPrompt(input: { doc: string; css: string; components: string }): string {
  const { doc, css, components } = input;
  return [
    '너는 이 프로젝트에서 *실제로 구현된* 화면을 픽셀 단위로 똑같이 재현한 디자인 목업의 <body> 내용을 만든다.',
    '아래에 이 앱의 진짜 CSS(전체)와 UI 컴포넌트 소스가 주어진다. 이 CSS는 결과물에 *그대로* 포함되므로 너는 CSS를 다시 쓰지 않는다.',
    '',
    '핵심 규칙:',
    '1) CSS를 새로 작성하지 마라. style 속성/<style> 금지. 오직 실제 소스에 있는 *클래스명과 DOM 구조*만 그대로 사용한다.',
    '2) 각 화면의 마크업은 컴포넌트 소스가 렌더하는 것과 동일한 엘리먼트·클래스·중첩 구조여야 한다. 추측해서 새 클래스를 만들지 마라.',
    '3) 앱 셸 구조(루트 컨테이너, 영역, 레일, 플로팅 요소 등)도 컴포넌트 소스 그대로 재현한다.',
    '',
    '출력 형식 — <body> 안에 들어갈 HTML 조각만 출력한다:',
    '- 최상위는 <div class="mock-canvas"> 하나.',
    '- 그 안에 화면/상태마다 <div class="mock-art"> 하나씩:',
    '    <div class="mock-art"><div class="mock-label">화면 이름</div><div class="mock-frame">…실제 화면 DOM…</div></div>',
    '- mock-frame 안에는 실제 앱 루트(예: <div class="tl" ...>)부터 그대로 넣어 한 화면 전체를 재현한다.',
    '',
    '포함할 화면/상태 — *소스에 실제로 존재하는 것만* 빠짐없이 각각 별도 아트보드로:',
    '- 각 주요 화면/뷰(라우팅·뷰 전환에 등장하는 모든 것).',
    '- 모든 인터랙티브/인터럽트/오버레이 상태: 모달·다이얼로그, 펼쳐진 패널/채팅, 드롭다운·메뉴 열림, hover/focus, 빈 상태, 로딩, 오류, 토스트 등. (소스에 구현된 것만)',
    '- 소스에 없는 화면·기능은 절대 만들어내지 마라.',
    '',
    '데이터: 실제 데이터 대신 제품 문서를 근거로 그럴듯한 한국어 가상 데이터로 채운다. 문서에 없는 부분은 UI(컴포넌트 소스)에 맞춰 자연스럽게 추측한다.',
    '',
    '=== 실제 CSS (참고용; 결과에 자동 포함됨 — 다시 쓰지 말 것) ===',
    '```css',
    css || '/* (스타일시트를 찾지 못함 — 클래스명은 컴포넌트 소스를 근거로) */',
    '```',
    '',
    '=== 실제 UI 컴포넌트 소스 (DOM·클래스의 근거) ===',
    '```',
    components || '(컴포넌트 소스를 찾지 못함)',
    '```',
    '',
    '=== 제품 문서 (데이터·문구의 근거) ===',
    '"""',
    doc,
    '"""',
    '',
    '설명 문장이나 코드펜스(```) 없이 <div class="mock-canvas">로 시작하는 HTML 조각만 출력하라.',
  ].join('\n');
}
