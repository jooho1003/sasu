# Step 0: project-setup

## 읽어야 할 파일

먼저 아래를 읽고 리포가 따라야 할 구조와 계약을 파악하라:

- `/docs/ARCHITECTURE.md` **§2 디렉토리 구조** (이 step의 산출물이 그대로 이 트리여야 한다) · **§8 테스트 경계** (어떤 계층이 TDD 대상인지)
- `/docs/ADR.md` **ADR-007**(Next.js + Vercel, 별도 백엔드 없음) · **ADR-027**(Harness·TDD 훅)
- `/docs/PRD.md` **§4 기술 스택과 환경 변수** · **§7 디자인 가이드**(색 토큰·서체)
- `/AGENTS.md` **"명령어"** 절 — npm script 이름 6개가 이미 고정돼 있다. 이름을 바꾸지 마라
- `/.env.example` — 환경 변수 **이름**의 원천. 값은 `.env.local`에 있고 커밋되지 않는다

이 step은 리포의 첫 코드다. 이전 step은 없다.

## 작업

리포는 이미 존재하고 `docs/`·`scripts/`·`phases/`·`AGENTS.md`가 들어 있다. **`create-next-app`을 쓰지 마라** — 비어 있지 않은 디렉터리에서 충돌로 실패하고, 대화형 프롬프트라 무인 실행에서 멈춘다. 아래 파일을 직접 만든다.

### 1. `package.json`

의존성:
- 런타임: `next` · `react` · `react-dom` · `zod` · `groq-sdk` · `@supabase/supabase-js` · `@supabase/ssr`
- 개발: `typescript` · `@types/node` · `@types/react` · `@types/react-dom` · `eslint` · `eslint-config-next` · `tailwindcss` · `@tailwindcss/postcss` · `postcss` · `vitest` · `vite-tsconfig-paths` · `@playwright/test` · `tsx`

scripts — **AGENTS.md의 이름 그대로**:

```json
{
  "dev": "next dev",
  "build": "next build",
  "lint": "eslint .",
  "test": "vitest run --passWithNoTests",
  "e2e": "playwright test"
}
```

`--passWithNoTests`를 빼지 마라. 이유: 훅(`Stop`)이 매 step 끝에 `npm run lint && npm run build && npm run test`를 돌리는데, 테스트 파일이 아직 없는 이 step에서 vitest가 "No test files found"로 exit 1을 내면 step 0이 절대 통과하지 못한다.

`"lint": "next lint"`를 쓰지 마라. 이유: 최신 Next에서 제거·경고 대상이고, 우리는 flat config(`eslint.config.mjs`)를 쓴다.

### 2. 설정 파일

- `tsconfig.json` — `strict: true`, path alias `@/*` → 리포 루트. `src/`를 만들지 마라 (ARCHITECTURE §2).
- `next.config.ts` — 최소 설정.
- `eslint.config.mjs` — flat config. `eslint-config-next` 확장.
- `postcss.config.mjs` — `@tailwindcss/postcss`.
- `vitest.config.ts` — `environment: "node"`, `include: ["tests/**/*.test.ts"]`, **`exclude: ["tests/rls/**", "tests/e2e/**", "node_modules/**"]`**, `vite-tsconfig-paths` 플러그인(그래야 테스트에서 `@/lib/...`이 풀린다).

  `exclude`를 빼지 마라. 이유: `tests/rls/`는 살아 있는 Supabase 프로젝트와 JWT 3개가 필요하다(step 14). 기본 `npm test`에 섞이면 훅(`Stop`)이 매 step 끝에 그걸 돌려서 DB가 붙기 전인 step 1~13이 **전부** 실패한다. RLS 테스트는 별도 스크립트로 돌린다:

  ```json
  "test:rls": "vitest run --dir tests/rls"
  ```

  `test:rls`도 `package.json`에 지금 넣어 둔다(실행은 step 14).
- `playwright.config.ts` — `testDir: "tests/e2e"`. 기본 브라우저 chromium 하나.

### 3. 디렉터리 골격

ARCHITECTURE §2 트리대로 빈 디렉터리를 만들되, **이 step에서는 아래 파일만 실제로 생성한다**:

```
app/layout.tsx            # html lang="ko". 서체·토큰을 여기서 로드
app/page.tsx              # 랜딩. "사수" 한 줄 + /demo 링크(아직 404여도 된다)
app/globals.css           # Tailwind import + PRD §7 색 토큰을 CSS 변수로
components/.gitkeep
lib/.gitkeep
supabase/migrations/.gitkeep
tests/.gitkeep
tests/e2e/.gitkeep
```

`app/globals.css`의 토큰은 PRD §7 표를 그대로 옮긴다 — `--accent: #17614A`(다크 `#6CBFA2`) · `--urgent: #B0611B`(다크 `#DB9A55`) · `--bg: #F6F7F5` · `--surface: #FFFFFF` · `--ink: #1F2823` · `--muted: #66716A`. 다크는 `prefers-color-scheme`로 재정의한다. **`--urgent`는 "지금 결정" 전용이다** — 다른 곳에 쓰지 마라 (PRD §7).

서체는 `next/font/google`로 Hahmlet(제목) · Gothic A1(본문) · IBM Plex Mono(메타). 로드 실패 시 시스템 고딕으로 떨어지도록 fallback 스택을 넣는다.

### 4. UI 언어

한국어 단일이다. i18n 프레임워크를 도입하지 마라 (AGENTS.md 아키텍처 규칙).

## Acceptance Criteria

```bash
npm install
npm run lint    # 에러 0
npm run build   # 컴파일 에러 없음. 환경 변수 없이도 빌드가 통과해야 한다
npm test        # 테스트 0개 통과 (--passWithNoTests)
```

추가 확인:

```bash
test ! -d src && echo "OK: src/ 없음"
test -f app/layout.tsx && test -f app/globals.css && echo "OK: app 골격"
node -e "const s=require('./package.json').scripts; ['dev','build','lint','test','e2e','test:rls'].forEach(k=>{if(!s[k])throw new Error('missing script: '+k)}); console.log('OK: scripts')"
grep -q "tests/rls" vitest.config.ts || { echo "FAIL: vitest exclude 에 tests/rls 없음"; exit 1; }
```

## 검증 절차

1. 위 AC 커맨드를 순서대로 실행한다.
2. 아키텍처 체크리스트:
   - ARCHITECTURE.md §2 디렉토리 구조를 따르는가? (`src/` 없음, `app/`·`components/`·`lib/`·`supabase/`·`tests/`가 루트)
   - ADR 기술 스택을 벗어나지 않았는가? (Next.js App Router · Supabase · Groq. 다른 프레임워크·상태관리·UI 킷을 추가하지 않았는가)
   - `.env.local`·`.env`를 커밋하지 않았는가? (`git status`에 나타나면 안 된다)
3. 결과에 따라 `phases/0-vertical-slice/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary"`에 산출물 한 줄 요약 (설치한 주요 의존성 버전과 만든 설정 파일 목록을 포함하라 — 다음 step이 이걸 보고 맞춘다)
   - 3회 시도 후에도 실패 → `"status": "error"`, `"error_message"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason"` 후 즉시 중단

## 금지사항

- `create-next-app`을 실행하지 마라. 이유: 비어 있지 않은 디렉터리에서 실패하고 대화형이라 무인 실행이 멈춘다.
- `src/` 디렉터리를 만들지 마라. 이유: ARCHITECTURE §2가 `app/`을 루트에 두기로 확정했다.
- 이 step에서 `lib/` 아래 `.ts` 구현 파일을 만들지 마라. 이유: `package.json`이 생기는 순간 `scripts/hooks/tdd-guard.sh`가 활성화되어 테스트 없는 `lib/` 편집을 차단한다. `lib/`은 step 3부터다.
- 모듈 최상위에서 환경 변수를 읽어 클라이언트를 만들지 마라. 이유: `.env.local`이 비어 있어도 `npm run build`가 통과해야 한다.
- UI 라이브러리(shadcn·MUI·Chakra 등)나 상태관리 라이브러리를 추가하지 마라. 이유: ADR에 없다. 필요해지면 PRD §4를 먼저 고친다.
- 기존 테스트를 깨뜨리지 마라.
