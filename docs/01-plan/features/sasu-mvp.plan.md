---
template: plan
version: 1.3
feature: sasu-mvp
project: sasu
date: 2026-09-08
author: wadelee1005@gmail.com
---

# sasu-mvp Planning Document

> **Summary**: 부서별 결정 사수 MVP — 슬랙·회의·노션을 관찰해 결정 카드를 밀어주고 원장에 기록하고 권한 안에서 인용해 답한다. 원티드 AI Championship 2026 제출(9/20).
>
> **Project**: sasu · **Version**: 0.1.0 (코드 착수 전) · **Date**: 2026-09-08 · **Status**: Approved
>
> **이 문서의 지위**: bkit PDCA용 **얇은 어댑터**다. 본문의 권위는 [docs/PRD.md](../../PRD.md)에 있고, 여기에는 Context Anchor와 절 매핑만 둔다. 요구사항·범위·컷 라인이 바뀌면 PRD를 고치고 이 문서의 매핑만 맞춘다. **여기에 새 결정을 적지 않는다** (CLAUDE.md 문서 우선순위).

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 부서의 결정이 슬랙·회의·문서에 흩어져 아무 시스템에도 기록되지 않는다. 팀장은 전달할 시간이 없고 팀원은 물어볼 곳이 없어 "말해주지 않았냐" 공방에 심판이 없다. (PRD §0 #1) |
| **Solution** | 부서 단위 AI가 슬랙·회의를 상시 분류하고, 노션 원칙 문서를 근거로 "지금 결정 카드"를 담당자에게 밀어주고, 결정을 원장에 기록하고, 질문자 권한 안에서 인용해 답한다. (PRD §0 #5) |
| **Function/UX Effect** | 화면 7개(S0~S6) · 데모 5장면이 배포 URL에서 5분 안에 완주 · 게스트 모드 30초 내 열람. (PRD §1-2·§5) |
| **Core Value** | 회의록·검색(커머디티)이 아닌 **결정 레이어** + **부서 단위 격리**. 같은 질문에 권한·부서에 따라 다른 답. (PRD §0 #3) |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 부서의 결정이 어디에도 기록되지 않아 "말해주지 않았냐" 공방에 심판이 없다 |
| **WHO** | 회의는 많고 문서화는 약한 5~50인 팀의 팀장(결정권자)·팀원. 파일럿 1호 = 우리 팀. 심사위원·투표자는 게스트 |
| **RISK** | 12일에 채널 3개는 비현실적(외부 리뷰 2곳 공통) → D3(9/10) 세로 슬라이스 게이트로 강등을 강제 판정. 매분 Cron·Recall.ai·`users:read.email`이 D0 미확인 |
| **SUCCESS** | 배포 URL에서 데모 5장면 5분 완주 · 게스트 `/demo` 30초 · 우리 팀 채널 1개 파이프라인 통과 · 9/21~10/5 통제 가능한 장애 0 · PRD §11 검증 행 전부 실행 기록 있음 |
| **SCOPE** | D1~D3 세로 슬라이스 → D4 DM·백필 → D5~D6 회의(봇 판정) → D7~D8 노션·Q&A·RLS·충돌 → D9 세팅·동의 → D10 게스트 시드·프리징 → D11 부하 → D12 제출 (PRD §9) |

---

## 1. Overview

### 1.1 Purpose
PRD §1-1 한 문장 · §1-2 MVP의 유일한 목표(데모 5장면 + 심사 기간 접속 유지).

### 1.2 Background
PRD §0 먼저 정한 다섯 가지 · `docs/proposal/사수_기획서_v3.html`(컨셉·경쟁·보안·심사 전략). v1·v2.1 폐기 이유는 ADR-002.

### 1.3 Related Documents
- 요구사항·명세: [PRD.md](../../PRD.md)
- 구조·불변식: [ARCHITECTURE.md](../../ARCHITECTURE.md)
- 결정 이유: [ADR.md](../../ADR.md)
- 사람 작업·게이트: [setup-guide.md](../../setup-guide.md)
- 제출: [submission-checklist.md](../../submission-checklist.md)
- 설계 어댑터: [sasu-mvp.design.md](../../02-design/features/sasu-mvp.design.md)

---

## 2. Scope

### 2.1 In Scope (PRD §3 · §8-0 "남은 것")
- [ ] WATCH — 슬랙 상시 수신(+7일 백필) · 회의 봇 전사(D6까지, 실패 시 업로드) · 노션 원칙 문서 1회 가져오기 → 결정 필요/액션/정보/잡담 (U2)
- [ ] DECIDE — 지금 결정 카드: 인용·충돌·추천 방향, 웹 + 슬랙 DM 버튼·모달, 72h 유사도 병합 (U3, U7)
- [ ] LEDGER — 결정 원장: 누가·언제·왜·근거, 리드타임, 직접 기록 (U8)
- [ ] ASK — 권한 인지 Q&A: 질문자 권한 검색, 인용 문자열 검증, refused → 카드 승격 제안 (U5, U6)
- [ ] 충돌 감지 — 카드 생성 시 원장 유사 결정 대조 (U4)
- [ ] 부서 세팅 — 멤버 동의(0단계) → 채널·회의·노션·visibility·결정권자 (U1, U9)
- [ ] 게스트 모드 — 온새미로 주식회사 영업팀·개발팀 합성 데이터, 사전 실행 Q&A 6건 + `generic_answer`
- [ ] 기반 — RLS(`can_see`·`search_as`) · `jobs` 워커 · `llm.ts` · `llm_calls` · 슬랙 서명 검증 · ask 일일 상한

### 2.2 Out of Scope
- Phase 4 삭감(PRD §8-0 "뺀 것" 12항목) · 처음부터 범위 밖(PRD §8-1 14항목) · 컷 라인(PRD §8-2 ⓪~⑦, 판정일 고정)
- **절대 안 버리는 것**: 결정 카드 · 원장 · 권한별 답변 차이 · 근거 인용 · 게스트 모드

---

## 3. Requirements

### 3.1 Functional Requirements

| ID | Requirement | Priority | PRD | Status |
|----|-------------|----------|-----|--------|
| FR-01 | 슬랙 이벤트 수신 → 동의 확인 → 마스킹 → items upsert(멱등) → 규칙+Haiku 분류 → S1 | P0 | §6-2 | Pending |
| FR-02 | 결정 후보 → Opus 5 카드(citations 우선) → 인용 검증 → 병합 → 담당자 결정(leads_only는 lead) → 웹 + DM | P0 | §6-3 | Pending |
| FR-03 | 카드 결정(웹·DM 버튼) → decisions(request_id unique) → 리드타임 → 스레드 한 줄 공지 | P0 | §6-3 ⑤⑨ | Pending |
| FR-04 | 원장 목록·상세·직접 기록·충돌 배지·마감 지남 배지 | P0 | §6-4 | Pending |
| FR-05 | Q&A: 게시 위치 권한 → `search_as` → Opus 5 → 인용 검증 → refused/답변 → answers 기록 | P0 | §6-5 | Pending |
| FR-06 | 충돌 감지: 카드 생성 시 원장 유사 결정 3 → conflicts[] | P1 | §6-4 | Pending |
| FR-07 | 회의: 업로드 파서(.vtt/.txt) → 봇 웹훅 → items → 회의 정리 → deferred → 카드 | P0(봇은 조건부) | §6-2, ADR-005 | Pending |
| FR-08 | 노션 원칙 문서 1회 가져오기 + [다시 가져오기], `is_principles` | P0 | §6-2, §6-6 | Pending |
| FR-09 | 세팅 S5: 동의 수집 → 채널 선택(전원 동의 후) → 공지 → 백필 · 회의 · 노션 · visibility · 결정권자 · 사용액 | P0 | §6-6 | Pending |
| FR-10 | 동의 S0 + 슬랙 버튼 → `consented_at`·`consent_version` | P0 | §6-6, §5 S0 | Pending |
| FR-11 | 게스트 `/demo`: is_demo 부서 2개 anon read-only, LLM 0회, 준비된 질문 6개 + generic_answer, CTA | P0 | §6-7 | Pending |
| FR-12 | jobs 워커: enqueue/runOnce, SKIP LOCKED, 백오프, 3회 failed, 2분 스윕, 매분 트리거 | P0 | §6-11 | Pending |
| FR-13 | 에러·빈 상태: 의존성 9개 장애 거동, 입력 상한, 빈 상태 5화면 | P0 | §6-10 | Pending |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement | PRD |
|----------|----------|-------------|-----|
| 보안·권한 | member 세션으로 leads_only select 0건·insert 거부 · 서명 없는 슬랙 요청 401 · 요청 경로 service role 0 | `tests/rls/`, `/review` 4·5항 | §6-9, §11 |
| 개인정보 | 미동의 발언 저장 0건 · 마스킹 전 원문 저장 0 · 로그에 본문 0 | 코드 리뷰 + grep | §8-3 |
| 성능 | 슬랙 3초 내 200 · 답변 2분 내 done/failed · 게스트 동시 100명 | 부하 테스트 D11 | §8-4, §11 |
| 비용 | 파일럿+심사 기간 $100 이내 | `llm_calls` | §4, ADR-020 |
| 가용성 | 9/21~10/5 통제 가능한 장애 0 | 매일 헬스체크 | §11 |

---

## 4. Success Criteria

### 4.1 Definition of Done (PRD §1-3)
- [ ] 데모 5장면이 로그인 사용자 기준 5분 안에 완주
- [ ] 게스트 모드 로그인 없이 30초 내 열람
- [ ] 우리 팀 실제 슬랙 채널 1개 이상 파이프라인 통과
- [ ] 심사 기간 내내 배포 링크 정상
- [ ] 제출서에 AI 도구·활용 방식 기재
- [ ] 참가 접수 D0 완료

### 4.2 Quality Criteria (PRD §11 검증표 — 실행 기록으로 판정)
- [ ] WATCH 재현율 ≥ 0.7(작업 임계) · 같은 이벤트 2회 → items 1건
- [ ] DECIDE 병합 1장 · 인용 링크 원문 도달 · 버튼 연타 → decisions 1건
- [ ] ASK lead/member 답 차이 · 퍼블릭 채널 leads_only 인용 0 · refused · items 0건 → LLM 0회
- [ ] 게스트 부서 격리: 상대 부서 items 인용 0건 · 실데이터 grep 0건
- [ ] `npm run lint && npm run build && npm test` 통과

---

## 5. Risks and Mitigation (PRD §10 요약)

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 12일에 채널 3개 범위 | High | High | D3 세로 슬라이스 게이트 즉시 강등 (ADR-025) |
| Vercel 매분 Cron 불가 | High | Medium | D0 확인 → Supabase pg_cron 대체안 (ADR-010) |
| Recall.ai 가격·승인·서명 | Medium | Medium | 업로드 파서 먼저, D6 판정 (ADR-005) |
| `users:read.email` 미승인 | Medium | Low | 수동 매핑 표 (ADR-016) |
| 규칙 재현율 < 0.7 | Low | Medium | 수동 승격 경로가 데모를 지킴 |
| 두 번째 파일럿 팀 실패 | Medium | Medium | "1팀 실데이터 + 게스트 2부서" 서사, 숨기지 않음 |

---

## 6. Impact Analysis
신규 프로젝트(코드 착수 전). 기존 소비자 없음. D2 임베딩 마이그레이션이 `items` 스키마의 유일한 예정 변경 (ADR-018).

---

## 7. Architecture Considerations

### 7.1 Project Level: **Dynamic** (Next.js + Supabase BaaS. bkend.ai 미사용)

### 7.2 Key Architectural Decisions → [ADR.md](../../ADR.md)

| Decision | Selected | ADR |
|----------|----------|-----|
| Framework | Next.js App Router + Vercel | 007 |
| Backend | Supabase (Postgres·pgvector·RLS·Auth), Edge Function 배제 | 008·009 |
| State/Async | Postgres `jobs` + `/api/jobs/run` 워커 | 009·010 |
| LLM | Opus 5 / Haiku 4.5 / 규칙, structured output citations-first | 011·012 |
| Auth·권한 | `can_see()` 단일 판정, 요청 경로 service role 금지 | 014·015·024 |
| Testing | Vitest(lib) · tests/rls · Playwright(E2E) | ARCHITECTURE §8 |
| Styling | PRD §7 토큰. 프레임워크 미정(D1) | — |

### 7.3 Clean Architecture → ARCHITECTURE §2 (`app/` · `lib/` · `components/` · `supabase/` · `tests/`, `src/` 없음)

---

## 8. Convention Prerequisites
- [x] `CLAUDE.md`(=`AGENTS.md`)에 CRITICAL 규칙·TDD·커밋 컨벤션
- [ ] ESLint·tsconfig — D1 리포 셋업
- [x] 환경 변수 목록 — PRD §4, setup-guide §2
- [x] 에러 처리 패턴 — PRD §6-10, `error_code` 5종

---

## 9. Next Steps
1. [x] Design 어댑터 `docs/02-design/features/sasu-mvp.design.md`
2. [ ] setup-guide §0 D0 항목 (사람)
3. [ ] `phases/0-vertical-slice` step 작성 → `python scripts/execute.py 0-vertical-slice`
4. [ ] D3 게이트 후 `/pdca analyze sasu-mvp`

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-09-08 | PRD(plan-forge Phase 2~5 완료본)를 bkit plan 형식으로 매핑 | wadelee1005@gmail.com |
