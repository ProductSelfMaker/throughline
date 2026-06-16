# 섹션 단위 패치 갱신 (section-scoped doc updates)

작성일: 2026-06-17 · 브랜치: `feat/section-patch-updates`

## 문제
연속 ingest가 매 갱신마다 **문서 전체를 모델이 재생성**(`Output the FULL updated document`)했다. 입력·출력이 doc 크기에 비례하고, 특히 출력 토큰(≈입력 5배 단가)이라 **doc가 커질수록 매 30초 갱신이 비싸지는** 구조였다.

## 연구 근거
- **Karpathy "LLM Wiki"**: 구조화된 dense 마크다운을 in-context로 유지; 업데이트는 마크다운 직접 편집. doc가 컨텍스트에 들어가면 **벡터검색/RAG는 과설계**(5~10만 토큰 초과·다도메인·실시간일 때만).
- **Aider diff/search-replace**: 바뀐 부분만 출력 → 출력량↓·환각↓.
- **Morph Fast Apply**: 매 편집마다 전체 재작성은 낭비; 타깃 적용이 토큰 50~60%↓.

## 측정 (실제 doc)
- 제품 doc 섹션: ~50–150 tok (작음).
- architecture `## Modules`(1,068 tok)·`## Key Flows`(721 tok)는 크지만 **각각 `###` 7개로 분해**, `###`당 ~100–250 tok.
→ 패치 단위를 **가장 깊은 헤딩(`##`/`###`)** 으로 잡으면 실질 단위가 ~50–250 tok로 수렴. doc가 커져도 "작은 블록이 더 생기는" 것이라 갱신당 출력이 일정.

## 설계
- **출력 포맷** (`buildSyncPrompt`): 전체 문서 대신 바뀐 블록만:
  ```
  <<<REPLACE
  ## <기존 헤딩 그대로, 또는 새 헤딩>
  <그 블록의 새 전체 마크다운>
  >>>
  <<<REMOVE
  ## <기존 헤딩>
  >>>
  ```
  규칙: 가장 깊은 헤딩 타깃, 헤딩 줄 그대로 복사, 바뀐 것만, spine 보존, 변화 없으면 빈 출력.
- **적용** (`src/domain/doc-patch.ts`, 결정적): doc를 `##`/`###` 블록으로 분해 → op를 블록 단위로 교체/추가/삭제 → 안 바뀐 블록은 byte-for-byte 보존. 새 `##`은 Open Questions 앞에 삽입, spine은 삭제 불가.
- **폴백**: 패치 블록이 없고 `looksLikeFullDoc`(≥2개 `## `)면 전체 문서로 수용(비순응 모델 호환); 그 외 비-doc 응답은 no-op(clobber 방지). 빈 응답이면 체크포인트 미전진(재시도).
- **범위**: 연속 ingest 경로 + source 없을 때의 sync 폴백. tidy/Rebuild/chat/curate는 그대로.

## 검증
- 단위: `doc-patch`(파싱/적용/`###` 하위섹션/spine 보호), sync-prompt(패치 포맷), session(패치 ingest가 해당 블록만 갱신). 157 테스트 통과.
- 라이브: 실제 haiku 호출이 패치 포맷 준수(바뀐 `## 로그인` 한 블록만 출력) 확인.

## 비범위 / 향후
- 한 블록이 비대해지면 줄단위 search/replace 폴백(현재 불필요).
- doc가 컨텍스트를 넘는 초대형이 되면 "헤딩→섹션 라우팅"으로 입력도 축소.
