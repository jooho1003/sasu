# 프로젝트: 사수 (SASU)

> 이 파일은 `AGENTS.md`(Codex)와 `CLAUDE.md`(Claude Code)에 같은 내용으로 존재한다. 한쪽을 고치면 다른 쪽도 같이 고칠 것.

부서별 결정 사수. 부서 단위로 세팅된 AI가 슬랙·온라인 회의를 관찰해 분류하고, 노션의 부서 원칙 문서를 근거로 "지금 결정해야 할 것"을 담당자에게 카드로 밀어주고, 내려진 결정을 원장에 기록하고, 물어보면 질문자 권한 안에서 인용해 답한다. 원티드 AI Championship 2026 제출용 MVP — 참가 접수 9/18(금) · 과제 제출 **9/20(일) 23:59** · 심사 기간 9/21~10/5 내내 배포 URL이 살아 있어야 한다.

## 기술 스택
- Next.js (App Router) + Vercel — 대시보드·원장·Q&A·게스트 모드, Route Handler가 슬랙 이벤트 수신
- Supabase — Postgres + pgvector + RLS + Auth(매직링크). RLS가 곧 "권한 인지 답변"의 물리적 구현
- Slack Events API + Block Kit (HTTP 모드, 단일 워크스페이스 수동 설치, 봇 토큰은 env)
- Recall.ai 류 회의 봇 — **D6(9/13) 판정**, 실패 시 .vtt/.txt 전사 업로드로 확정 · Notion API — 원칙 문서 1회 가져오기 + [다시 가져오기]
- Groq `openai/gpt-oss-120b` (카드·답변·회의 정리, strict json_schema) · Groq `openai/gpt-oss-20b` (분류) · 규칙 휴리스틱 (정량 신호). 두 모델 모두 production + strict structured output이라 인용 스키마를 강제할 수 있다 (ADR-028)
- 임베딩: D2에 Voyage / OpenAI 중 확정. 확정 전에는 스키마에 차원을 박지 않는다
- 비동기: Postgres `jobs` 테이블 + `/api/jobs/run` 워커 (`after()` 즉시 1회 + 매분 트리거 — Vercel Cron 또는 Supabase `pg_cron`+`pg_net`, D0 확정)
- 음성 입력: Groq Whisper `whisper-large-v3-turbo` (원본 음성은 저장하지 않고 사용자가 확인한 전사만 ASK로 전송) · 문서: TXT/MD/CSV/JSON/PDF/DOCX 업로드 + 근거 기반 요약
- Zod (`lib/contracts.ts` 단일 스키마) · Vitest (`lib/` 단위) · Playwright (E2E)

## 아키텍처 규칙
- CRITICAL: 가시성 판정은 SQL 함수 `can_see()` 하나다. RLS 정책도 `search_as()`도 이것을 호출한다. 판정 로직을 애플리케이션 코드에 복제하지 마라 — 두 곳에 있으면 반드시 어긋난다.
- CRITICAL: 사용자 요청 경로(대시보드·카드·원장·묻기·슬랙 Q&A)에서 service role 클라이언트를 쓰지 마라. 웹은 세션 클라이언트, 슬랙 경유는 `search_as(user_id, …)`. service role은 수집 어댑터 insert·게스트 시드·워커 내부에서만.
- CRITICAL: `dept_id`·`decided_by`·`asked_by`는 요청 본문이 아니라 세션·멤버십에서 결정한다. URL의 `[dept]`는 멤버십 검증 후에만 유효. 버튼을 숨기는 것은 권한이 아니다 — 서버·RLS(USING + WITH CHECK)에서 집행한다.
- CRITICAL: 텍스트 LLM 호출은 `lib/llm.ts`의 `llm.structured(purpose, schema, prompt)` 하나로만 한다. 음성 전사는 같은 파일의 `llm.transcribeAudio()`만 사용하며, 다른 곳에서 Groq SDK를 직접 부르지 마라. 재시도·거절 처리·`llm_calls` 기록·마스킹 확인이 거기에 있다. strict json_schema는 모든 필드가 required + `additionalProperties: false`여야 하므로, null이 정상인 필드는 optional이 아니라 nullable union으로 정의한다 (ADR-028, ADR-032).
- CRITICAL: 인용 없는 문장은 렌더하지 않는다. 카드·답변의 `citations[]`는 `quote`가 원문에 문자열로 포함되는지 검증하고, 0개면 답변은 `refused`, 카드는 `needs_review`(DM 안 보냄).
- CRITICAL: 미동의 멤버(`members.consented_at` null)의 발언은 저장하지 않는다 — 어댑터가 `author_ext_id`로 skip. 이름만 가리고 본문을 저장하는 방식은 금지. 동의가 채널 연결보다 먼저다.
- CRITICAL: 비밀값을 리포에 커밋하지 마라. 클라이언트에 노출되는 것은 `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY` 둘뿐. 예외: 비밀값이 아닌 공개 배포 URL `NEXT_PUBLIC_APP_URL` 1개(2026-09-13 확인, 서버 코드는 없으면 `VERCEL_PROJECT_PRODUCTION_URL`로 대체). `/api/slack/*`는 signing secret 검증 후에만 처리.
- CRITICAL: 로그에 슬랙 이벤트 본문·전사 원문·질문 원문을 출력하지 마라 (ID·길이·에러 코드만). `items.content`는 정규식 마스킹 후만 저장하고 마스킹 전 원문은 어디에도 두지 않는다.
- 결정은 append-only. 수정·삭제 없이 `supersedes_id`로만 정정한다.
- 카드 visibility = 인용 소스 중 가장 좁은 것. 병합은 visibility를 좁히지 않는다. `leads_only` 카드는 lead에게만 DM.
- 채널 답변(`@사수`)은 member 권한, DM·웹은 질문자 권한. "N건 제외"는 어디에도 표시하지 않는다.
- 긴 작업(분류·카드·답변·회의 정리)은 row 먼저 만들고 job으로. 요청 핸들러는 검증 → DB 쓰기 → `enqueue` → `after(runOnce)` → 응답. 슬랙은 3초 안에 200. 영원한 스피너 금지 — 2분 스윕이 `failed(error_code)`로 정리한다.
- 멱등: `ingest_events.event_id` · `unique(source_id, external_ref)` · `decisions.request_id unique` · open 카드는 원본당 1건(partial unique).
- Supabase Edge Function을 쓰지 않는다. 런타임은 Next.js 하나.
- 게스트 판별은 `orgs.is_demo` 플래그(이름 문자열 아님). 게스트 라우트는 LLM 호출 0회, 쓰기 0건, 우리 팀 실데이터 0건.
- UI 언어는 한국어 단일. i18n 프레임워크를 도입하지 마라.

## 문서 우선순위
구현의 입력이 되는 확정 계획은 `docs/PRD.md`다. 문서 충돌 시 우선순위:

`docs/PRD.md`의 범위·완료 조건·컷 라인 → `docs/ARCHITECTURE.md`의 구조·불변식 → `docs/ADR.md`의 결정 이유 → `docs/setup-guide.md`·`docs/submission-checklist.md`의 절차

하위 문서가 상위 문서를 암묵적으로 바꾸지 않는다. 구현 중 결정이 바뀌면 PRD §3·§8을 먼저 고치고 ADR을 추가한다. bkit PDCA용 문서는 `docs/01-plan/`·`docs/02-design/`에 있으며 본문은 전부 위 문서를 가리킨다 — 거기에 새 결정을 적지 않는다. `docs/archive/`는 폐기본이라 참조하지 않는다.

## 개발 프로세스
- CRITICAL: `lib/` 아래 새 모듈은 테스트를 먼저 작성하고, 테스트가 통과하는 구현을 작성한다 (TDD — `scripts/hooks/tdd-guard.sh`가 강제). 예외: 라우트 핸들러(`route.ts`)·`app/**/page.tsx` 등 Next.js 프레임워크 파일·`components/`·`lib/supabase/*`·`lib/llm.ts`·`lib/slack/{blocks,post}.ts`·`scripts/`·`phases/`·`.sql`. 이유는 ARCHITECTURE.md §8 (SDK 어댑터·프레젠테이션·배선은 우리 로직이 아니다).
- 하루 마지막 커밋은 항상 배포 가능 상태. D10(9/17) 기능 프리징 이후 신기능 금지.
- 커밋 메시지는 conventional commits (feat:, fix:, docs:, chore:, refactor:).
- 구현은 `phases/`의 step 파일로 Codex에 넘긴다 (`.claude/commands/harness.md`). 완료 판정은 에이전트의 자기 보고가 아니라 PRD §11 검증의 **실행 기록**(스크린샷·쿼리 결과).
- 되돌릴 수 없는 명령(`rm -rf`, `git push --force`, `git reset --hard`, `DROP TABLE`)은 `scripts/hooks/dangerous-command-guard.sh`가 차단한다.

## 명령어
D1 리포 셋업 시 아래 이름으로 스크립트를 만든다. 훅(`Stop`)이 lint → build → test를 순서대로 돌린다.

npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # Vitest (lib/ 단위·RLS 테스트)
npm run e2e      # Playwright (게스트 완주·세로 슬라이스)
npx supabase db push          # supabase/migrations 적용
npx tsx scripts/seed-demo.ts  # 게스트 합성 데이터 시드 (데모 org truncate 후 재생성, 멱등)

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
