---
title: Throughline
updated: 2025-06-01
---

## 🎯 요약

브라우저에서 *내 CLI AI(Claude Code)*와 기획 대화를 하면, 오른쪽 `spec.md`가 *지시 없이 실시간으로 살아 쓰여지는* 로컬 오픈소스 기획 도구. "내 터미널의 확장판"으로, 코딩은 사용자가 하고 Throughline은 살아있는 문서·유저플로우·라이브 프리뷰를 유지한다.

- **타겟·포지션:** AI로 프로덕트 만드는 사람 / "절대 안 썩는 기획서" (핫키워드: spec-driven dev, living spec, context engineering)
- **핵심 루프:** Converse → Crystallize(★) → Build → Sync
- **레이아웃:** 기본 채팅 전체 + 우상단 뷰 버튼 → 클릭 시 우측 리사이즈 분할
- **문서 구조:** 하이브리드 — 고정 척추(`🎯요약·✅핵심기능·🟡미정`) + 자라나는 섹션
- **아키텍처:** 로컬 Node 앱 → Agent SDK로 *내* Claude Code 구동(구독·인증 그대로, 추론비 0)
- **핵심 모델(Model B):** 좌측 = 내 진짜 터미널을 비추는 창(미러 또는 임베드), Throughline은 AI를 제공하지 않고 내 터미널 활동을 관찰해 문서·플로우를 실시간 최신화
- **CLI:** Claude Code 전용 (어댑터 인터페이스만 열어둠)
- **단일 진실:** `spec.md` = 디스크의 마크다운 파일 하나 (git 친화)
- **BM:** 오픈코어 — 로컬 싱글플레이어 무료(OSS) / 팀 클라우드 유료(멀티플레이어·버전 히스토리·웹 접근·템플릿)
- **슬로건:** TBD

## ✅ 핵심 기능

- [x] 분할 화면 (좌측 대화 | 우측 뷰) <!-- id: layout-split -->
- [x] 라이브 스크라이브 → `spec.md` 실시간 갱신 <!-- id: live-scribe -->
- [x] 하이브리드 문서 구조 (고정 척추 + 자라나는 섹션) <!-- id: hybrid-structure -->
- [x] 변경 하이라이트 (전체 플래시 + 변경 줄 수 배지) <!-- id: change-highlight -->
- [x] 미정 추적 (`🟡 미정` 섹션) <!-- id: open-questions -->
- [x] 멀티뷰 워크스페이스 (📄 문서 · 🔀 플로우 · 👁 프리뷰) <!-- id: multiview-workspace -->
- [x] 유저 플로우 자동 생성 (AI가 spec에서 mermaid 플로우차트 생성, 열려 있을 때만 자동 갱신) <!-- id: flow-view -->
- [x] 라이브 프리뷰 (로컬 dev 서버 URL → iframe 임베드, URL 기억 + 새로고침) <!-- id: preview-view -->
- [x] 리사이즈 가능한 분할 경계 (비율 localStorage 저장) <!-- id: resizable-divider -->
- [x] 활동 기반 싱크 에이전트 (내 Claude Code JSONL + git diff → spec·플로우 라이브 갱신) <!-- id: activity-sync -->
- [x] 읽기전용 트랜스크립트 뷰어 (좌측에서 내 터미널 세션 미러링) <!-- id: transcript-viewer -->
- [ ] 좌측 임베드 인터랙티브 터미널 (xterm.js + PTY, 진짜 셸에서 Claude Code 직접 실행) <!-- id: in-app-terminal -->

## 🟡 미정 / 열린 질문

- 정확한 줄 단위 하이라이트 (현재는 전체 플래시 — 데이터는 흐르고 있어 구조 변경 없이 추가 가능) <!-- id: line-highlight -->
- mermaid 번들 분할 (현재 ~968KB, 지연로딩으로 개선 가능) <!-- id: mermaid-bundle -->
- 멀티 CLI 지원 (Codex/Gemini 트랜스크립트) <!-- id: multi-cli -->
- Build 페이즈: 코더 루프 (spec → 코드 구현 + 진행 표시) <!-- id: build-coder -->
- Sync 페이즈: 코드 → 문서 역동기화 <!-- id: sync-reverse -->
- 자율 오케스트레이션: 서브에이전트 주도 브랜치 + 태스크 큐잉으로 미완 기능 자동 처리 <!-- id: autonomous-orchestration -->
- 안전장치/git: 브랜치·diff 리뷰·승인 게이트 <!-- id: git-safety -->