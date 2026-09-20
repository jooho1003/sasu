---
template: design
version: 1.0
feature: sasu-mvp
project: sasu
date: 2026-09-08
author: wadelee1005@gmail.com
plan: docs/01-plan/features/sasu-mvp.plan.md
---

# sasu-mvp Design Document

> **Summary**: 사수 MVP의 구조·데이터·API·화면·테스트 설계. **bkit PDCA용 얇은 어댑터** — 권위는 [PRD.md](../../PRD.md) §5·§6과 [ARCHITECTURE.md](../../ARCHITECTURE.md)에 있다. 갭 분석(`/pdca analyze`)이 대조할 목록(엔드포인트·화면·모듈·job·테이블)은 여기에 인라인으로 두고, 상세는 절 번호로 가리킨다. **여기에 새 결정을 적지 않는다.**
>
> **Project**: sasu · **Date**: 2026-09-08 · **Status**: Approved (코드 착수 전)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 부서의 결정이 어디에도 기록되지 않아 "말해주지 않았냐" 공방에 심판이 없다 |
| **WHO** | 5~50인 팀의 팀장·팀원 (파일럿 1호 = 우리 팀) · 게스트(심사·투표) |
| **RISK** | 12일·채널 3개 → D3 세로 슬라이스 게이트 · 매분 Cron·Recall.ai·이메일 스코프 D0 미확인 |
| **SUCCESS** | 배포 URL 데모 5장면 5분 · `/demo` 30초 · PRD §11 검증 실행 기록 |
| **SCOPE** | D1~D3 슬라이스 → D4 DM·백필 → D5~D6 회의 → D7~D8 노션·Q&A·RLS → D9 세팅 → D10 게스트 → D12 제출 |

---

## 1. Overview

### 1.1 Design Goals
1. 데모 5장면(PRD §1-2)이 실제 파이프라인으로 돈다 — 모조 UI 없음
2. 권한은 SQL이 판정한다 — `can_see()` 하나 (ARCHITECTURE §3.4)
3. 인용 없는 출력은 없다 (ARCHITECTURE §3.5)
4. 죽어도 데이터를 잃지 않는다 — 어댑터 upsert 먼저, 나머지는 job (ARCHITECTURE §3.1·3.2)

### 1.2 Design Principles → ARCHITECTURE §3 패턴 7개 · §6 불변식 15개

---

## 2. Architecture

### 2.1 Component Diagram → ARCHITECTURE §1 (텍스트) · PRD §6-11 (mermaid)

### 2.2 Data Flow → ARCHITECTURE §4 (슬랙 메시지·결정·질문·회의·게스트 5개 여정)

### 2.3 Dependencies

| 외부 | 용도 | 장애 시 (PRD §6-10) |
|---|---|---|
| Groq (gpt-oss-120b · gpt-oss-20b) | 카드·답변·회의 정리 · 분류 | 백오프 3회 → unclassified / needs_review / failed |
| Supabase | DB·RLS·Auth·pgvector | 전 기능 불가, 상단 배너 |
| Slack Events/Web API | 수신·DM·버튼·@사수 | 재시도 3회 → 웹 카드만 + lead 알림 |
| Recall.ai (조건부, D6) | 회의 봇 전사 | `bot_failed` → 전사 업로드 |
| Notion API | 원칙 문서 1회 가져오기 | 이전 인덱스 유지, 세팅에 실패 표시 |
| Voyage AI voyage-4-lite 1024차원 (ADR-030) | 병합·검색·충돌 | `embed_status=failed` 재시도 큐 |

---

## 3. Data Model → PRD §6-1 (SQL 전문) · §6-12 (전이·삭제·진실 규칙)

> 아래 표는 2026-09-08 초기 목록이다. 현재 스키마·API·job 종류는 PRD §6-1·§6-8과 `supabase/migrations/`가 정본이다.

### 3.1 Entities (16 테이블)

| Table | Key columns | RLS |
|---|---|---|
| `orgs` | `is_demo` | 사용자 접근 없음 |
| `departments` | `org_id`, `template='general'` | dept 멤버 |
| `members` | `(user_id, dept_id)`, `role lead|member`, `slack_user_id`, `consented_at`, `consent_version`, `display_name` | dept 멤버 |
| `sources` | `kind slack_channel|meeting|notion_page`, `visibility dept|leads_only`, `is_principles`, `sync_cursor` | `can_see` |
| `items` | `(source_id, external_ref)` unique, `author_ext_id`, `content`(마스킹), `deleted_at`, `embed_status` · (D2) `embedding`, `embed_model` | `can_see` |
| `ingest_events` | `event_id` PK | 없음 |
| `classifications` | `item_id` PK, `label`, `method rule|llm`, `confidence`, `deadline_hint`, `assignee_hint` | items 따라감 |
| `meetings` | `status scheduled→…`, `summary jsonb` | `can_see` |
| `decision_requests` | `visibility`, `status open|decided|deferred|rejected|needs_review`, `origin_item_id`(open 1건 partial unique), `assignee_id` | `can_see` |
| `decisions` | `request_id unique`, `decided_by set null`, `decided_by_name`, `supersedes_id`, `lead_time_min` | dept 멤버 |
| `citations` | `owner_kind|owner_id` → `item_id|decision_id`, `quote` | 소유 객체 join |
| `conflicts` | `request_id`, `prior_decision_id`, `explanation` | 소유 객체 join |
| `answers` | `asked_by set null`, `status pending|done|refused|failed`, `error_code` | 본인 + lead |
| `jobs` | `kind`(9종), `status`, `attempts`, `run_after` | 없음 |
| `llm_calls` | `purpose`, `model`, tokens, `cost_usd` | 없음 |

### 3.2 SQL 함수: `can_see(p_user, p_dept, p_visibility)` · `search_as(p_user, p_dept, p_query_embedding, k)` SECURITY DEFINER

---

> 아래 표는 2026-09-08 초기 목록이다. 현재 스키마·API·job 종류는 PRD §6-1·§6-8과 `supabase/migrations/`가 정본이다.

## 4. API Specification → PRD §6-8

| Method · Path | 동작 | 권한 |
|---|---|---|
| `POST /api/slack/events` | 서명 검증 → 멱등 → 어댑터 → 200 (3초) | 서명 |
| `POST /api/slack/interactions` | 카드 버튼·모달·동의 버튼 → decisions / consented_at | 서명 + 클릭자 검증 |
| `POST /api/meetings/transcript` | 봇 웹훅 또는 전사 업로드(lead, 10MB) | 웹훅 시크릿 / lead |
| `POST /api/notion/import` | 원칙 문서 가져오기 | lead |
| `POST /api/jobs/run` | 워커 `runOnce()` + `sweep` | `JOBS_TRIGGER_SECRET` |
| `POST /api/consent` | 웹 동의 기록 | 세션 |
| `GET /api/d/[dept]/items?label=` | 대시보드 | 세션(RLS) |
| `POST /api/d/[dept]/cards` | 수동 승격 | member+ |
| `POST /api/cards/[id]/decide` | 결정·보류·반려 + 사유 | 담당자 or lead |
| `GET /api/d/[dept]/ledger` · `POST /api/d/[dept]/decisions` | 원장 · 직접 기록 | 세션(RLS) |
| `POST /api/d/[dept]/ask` | Q&A (answers row → job), 하루 50회 | 세션 |
| `GET /api/demo/*` | 게스트 스냅샷 (캐시, LLM 0) | anon (`is_demo`) |

에러 응답: `{error_code, message, next_action?}` · `error_code ∈ llm_timeout|llm_refusal|schema_invalid|citation_invalid|rate_limited|…` (PRD §6-10)

---

## 5. UI/UX Design → PRD §5 (화면) · §2-4 (플로우) · §7 (토큰)

### 5.1 Screens

| # | 화면 | 라우트 | 핵심 요소 | 빈 상태 |
|---|---|---|---|---|
| S0 | 동의 | `/consent` | 수집 범위·인용 보존·질문 기록 고지 · [동의] | — |
| S1 | 부서 대시보드 | `/d/[dept]` | 입력 카운트 · 분류 탭 5 · 회의 탭 · 원문 · [카드로 승격] | "첫 메시지를 기다리는 중" |
| S2 | 결정 카드 | `/d/[dept]/cards/[id]` + Slack Block Kit | 배지·마감·배경·인용 칩·충돌·추천·[결정/보류/반려]+사유 모달 | "지금 결정할 것이 없습니다" |
| S3 | 결정 원장 | `/d/[dept]/ledger` | 목록(상태·담당자·리드타임)·상세·충돌 배지·마감 지남·[직접 기록] | "첫 결정을 직접 기록해보세요" |
| S4 | 사수에게 묻기 | `/d/[dept]/ask` + `@사수` | 질문 · 인용 답변 · 고정 문구 · refused → 카드 제안 · 2초 폴링 | "아직 참고할 기록이 없습니다"(LLM 0) |
| S5 | 부서 세팅 | `/d/[dept]/settings` | 체크리스트 4단계 · 채널 선택 · 회의 · 노션 · visibility · 결정권자 · 동의 상태 · 사용액 | 동의 0명이면 채널 버튼 비활성 |
| S6 | 게스트 | `/demo` | S1→S4 읽기 전용 · 부서 2개 · 준비된 질문 6 + 범용 AI 답 · CTA | — |

### 5.2 User Flow → PRD §2-4 mermaid (게스트 · 팀장 세팅 · 팀원 동의 · 일상 루프)

### 5.3 Components (`components/`)
`CitationChip` · `DecisionCard` · `DecisionButtons`(+ 사유 모달) · `LedgerRow` · `LedgerDetail` · `ConflictBadge` · `DeadlineBadge`(마감·마감 지남) · `ClassificationTabs` · `MeetingTab` · `AskBox` · `AnswerView`(고정 문구 포함) · `SetupChecklist` · `ChannelPicker` · `VisibilityToggle` · `ConsentBanner` · `EmptyState` · `DependencyBanner`

### 5.4 Page UI Checklist
- 인용 칩 없는 문장은 렌더하지 않는다 (PRD §7)
- 호박색(`#B0611B`)은 "지금 결정" 전용
- 권한 밖 제외 표시는 회색 자물쇠 한 줄 — "N건 제외"는 표시하지 않는다
- 데스크톱 우선, 카드 상세·S4만 모바일 대응

---

## 6. Error Handling → PRD §6-10 (의존성 9개 · 입력 · 동시성 · 빈 상태)

원칙: "무엇이 실패했는지 + 다음에 할 수 있는 것". `error_code`를 내부에 남긴다. "오류가 발생했습니다"만 있는 화면 금지.

---

## 7. Security → PRD §6-9 · ARCHITECTURE §6 불변식 15개 · CLAUDE.md CRITICAL 8개

핵심 4개: `can_see()` 단일 판정 · 요청 경로 service role 금지 · 게시 위치 권한 우선 · 동의가 수집보다 먼저.

---

## 8. Test Plan → ARCHITECTURE §8 · PRD §11

### 8.1 L1 (단위, Vitest, `tests/` 미러)
`rules`(결정 후보 패턴·마감 해석) · `mask`(금액 미마스킹) · `pipeline/card`(인용 검증·visibility 최솟값·담당자 강제) · `pipeline/merge`(72h·0.85·좁아지는 병합 금지) · `pipeline/answer`(refused·게시 위치 권한) · `jobs`(백오프·3회 failed·스윕) · `adapters/meeting`(.vtt 파서 줄 번호 에러) · `slack/verify`(서명·타임스탬프 창)

### 8.2 L2 (RLS, `tests/rls/`, JWT 3종)
member: leads_only select 0·insert 거부 / lead: 보임 / anon: is_demo만 select / `jobs`·`llm_calls`·`orgs` 전부 차단 / 퍼블릭 채널 질문 = member 권한

### 8.3 L3 (E2E, Playwright, 배포 URL)
① 게스트 `/demo` 완주 + 실데이터 grep 0 + LLM 호출 0 ② 세로 슬라이스 5분 ③ lead/member 답 차이 ④ 버튼 연타 → decisions 1건 ⑤ 같은 슬랙 이벤트 2회 → items 1건 ⑥ 잘못된 API 키 → 2분 내 failed + 재시도

### 8.4 Seed Data
`scripts/seed-demo.ts` — 온새미로 주식회사 영업팀·개발팀 3주치 합성 슬랙·회의·원칙 문서 → 실제 파이프라인 → 스냅샷. 준비된 질문 6개(팀장 3 + 팀원 3, 1개는 두 부서 공통) + `generic_answer`. 멱등(truncate 후 재생성).

---

## 9. Clean Architecture (Dynamic) → ARCHITECTURE §2

```
app/            표현·라우트 (검증 → DB 쓰기 → enqueue → after → 응답)
components/     표현
lib/            도메인·파이프라인·게이트웨이 (테스트 대상)
lib/supabase/   클라이언트 팩토리 3종 (server · rls-client · service)
supabase/       스키마·함수·RLS
```
의존 방향: `app` → `lib` → `lib/supabase`·`lib/llm`. `lib/adapters`는 `lib/pipeline`을 모른다. `lib/pipeline`은 SDK를 모른다(`llm.ts`·`search.ts` 경유).

---

## 10. Coding Convention → CLAUDE.md (TDD 훅 예외 목록 · 커밋 컨벤션 · 명령어)

---

## 11. Implementation Guide

### 11.1 Modules (lib/)
`contracts.ts` · `llm.ts` · `jobs.ts` · `search.ts` · `mask.ts` · `rules.ts` · `adapters/{slack,meeting,notion}.ts` · `pipeline/{classify,card,answer,summarize,merge,conflict}.ts` · `slack/{verify,blocks,post}.ts` · `supabase/{server,rls-client,service}.ts`

> 아래 표는 2026-09-08 초기 목록이다. 현재 스키마·API·job 종류는 PRD §6-1·§6-8과 `supabase/migrations/`가 정본이다.

### 11.2 Job kinds (9)
`classify` · `embed` · `summarize_meeting` · `make_card` · `answer` · `send_slack` · `notion_import` · `slack_backfill` · `sweep`

### 11.3 Implementation Order → PRD §9 · harness.md §F

| task | D | 게이트 |
|---|---|---|
| `0-vertical-slice` | D1~D3 | D3 자정 사람 판정 |
| `1-slack-dm-backfill` | D4 | 컷 ① |
실제 phase 목록과 상태는 `phases/index.json`을 따른다 (2-mvp-completion · 3-d6-d10-completion · 4-agent-roles · 6-polish 등).

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-09-08 | PRD §5·§6 + ARCHITECTURE를 bkit design 형식으로 매핑 | wadelee1005@gmail.com |
