# npm 배포 패키징 설계

작성일: 2026-06-15
브랜치: `feat/npm-publishing`

## 목표
Throughline을 npm에 공개 배포해, 사람들이 `npx`/전역 설치로 받아 쓸 수 있게 한다.
이번 범위는 **패키징 + 수동 `npm publish`** 까지. CI 자동배포·git remote 연결은 제외(나중에).

## 결정사항
- **이름**: `@<username>/throughline` (스코프드 공개). `throughline`(unscoped)은 이미 점유됨(v0.5.0).
- **런타임**: esbuild로 서버를 단일 JS 번들(의존성 external). tsx 런타임 미사용.
- **라이선스**: MIT.
- **버전**: `0.1.0` (첫 실 배포).

## 최종 사용자 경험
```bash
npx @<username>/throughline [관찰할-프로젝트-경로]   # 일회성 실행 → 브라우저 오픈
npm i -g @<username>/throughline && throughline       # 전역 설치
```
인자 없으면 현재 디렉터리를 관찰. 빌드 없이 즉시 실행(웹 dist + 서버 번들 동봉).

## 빌드 파이프라인
산출물 2개를 패키지에 동봉:
- `dist/` — `vite build` (웹 UI; react/mermaid 등 전부 번들됨)
- `dist-server/server.mjs` — `esbuild src/server/server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/server.mjs` (우리 src만 단일 JS, 의존성은 external)

scripts:
```jsonc
"build:web":     "vite build",
"build:server":  "esbuild src/server/server.ts --bundle --platform=node --format=esm --packages=external --outfile=dist-server/server.mjs",
"build":         "npm run build:web && npm run build:server",
"prepublishOnly": "npm run build && npm test"
```
`prepublishOnly`는 `npm publish` 직전 자동 실행 → 항상 최신 dist + 통과한 테스트만 배포.

## 핵심 코드 수정 (2곳)
1. **`bin/throughline.mjs`**: 현재 `npm start`를 spawn(배포본에선 깨짐). 번들 서버를 직접 로드하도록 교체:
   ```js
   #!/usr/bin/env node
   import './../dist-server/server.mjs';
   ```
   argv가 그대로 전달돼 `throughline <dir>`의 경로 인자가 `server.ts`의 `process.argv[2]`로 들어간다.
2. **`server.ts`의 dist 경로 해석**: 현재 `join(dirname(import.meta.url), '..','..','dist')`는 dev(`src/server`, 2단계 위)에선 맞지만 번들(`dist-server`, 1단계 위)에선 깊이가 달라 깨진다.
   → **`import.meta.url`에서 위로 올라가며 `package.json`이 있는 패키지 루트를 찾고 그 아래 `dist`** 를 쓰도록 교체. dev/배포 양쪽에서 동작.

## package.json 변경
- `"private": true` 제거.
- `"name": "@<username>/throughline"`, `"version": "0.1.0"`.
- `"description"`, `"license": "MIT"`, `"author"`, `"keywords"`, `"homepage"`(생략 가능), `"engines": { "node": ">=20" }`.
- `"files": ["bin", "dist", "dist-server"]` (README·LICENSE·package.json은 npm 자동 포함).
- **의존성 분리**(검증 완료):
  - `dependencies`: `hono`, `@hono/node-server`, `chokidar`, `open`, `@anthropic-ai/claude-agent-sdk`, `diff`
  - `devDependencies`로 이동: `react`, `react-dom`, `react-markdown`, `remark-gfm`, `mermaid` (+ 기존 빌드/타입 devDeps), `esbuild` 신규 추가.

## 문서/라이선스
- `README.md` (npm 랜딩): 제품 소개(Claude Code 세션 로그 + git diff를 읽어 살아있는 문서를 유지하는 관찰 동반자), **사전 요구사항**(Claude Code 인증 또는 `ANTHROPIC_API_KEY` — claude-agent-sdk가 ambient 인증을 사용), 설치·사용법, 산출물(문서/결정/아키텍처/목업/히스토리/토큰 분석), 언어 정책 한 줄.
- `LICENSE` (MIT, 저작권자 기본값: ProductSelfMaker).

## 검증 게이트 (배포 전)
1. `npm pack --dry-run` → 타르볼에 `bin/ dist/ dist-server/server.mjs README LICENSE package.json`만 포함, `src/`·테스트 제외 확인.
2. 팩한 타르볼을 임시 디렉터리에 실제 설치 → 임시 git 프로젝트 대상으로 `throughline`(OPEN=0) 실행 → 서버 기동 + `/api/info`·UI(`#root`) 응답 확인 (npx E2E).
3. `npm test` 전체 통과.

## 배포 (실행하지 않고 명령어 안내)
publish는 비가역·인증 필요 → 검증까지 끝낸 뒤 다음을 안내하고 멈춘다:
```bash
npm login
npm publish --access public   # 스코프드 공개 패키지는 --access public 필수
```

## 비범위 (나중)
GitHub Actions 자동배포, git remote, 버전 범프 자동화.
