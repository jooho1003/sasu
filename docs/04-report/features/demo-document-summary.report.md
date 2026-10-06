# demo-document-summary Completion Report

> Status: 구현·로컬 검증 완료, 운영 반영(migration → 데모 재시드 → 병합) 사용자 승인 대기.
> Project: 사수(SASU) · phase 53
> Author: root(Claude Code) · step 0(opus)·step 1(sonnet) 서브에이전트 · 독립 분석 gap-detector
> Completion Date: 2026-10-07 · PDCA Cycle: phase 53

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | demo-document-summary (게스트 데모 「문서」에 문서 요약 표시) |
| Start Date | 2026-10-07 |
| End Date | 2026-10-07 |
| Duration | 1일 (사용자 요청 → 설계안 A 선택 → PRD·ADR → plan → design → step 0·1 → analyze 96% → report) |

### 1.2 Results Summary

데모 부서 문서 요약 익명 읽기 정책 1개(migration 0070), 검증 함수 순수 모듈 분리, 데모 로더 재검증, 공유 요약 컴포넌트, 데모 화면, 시드 보강을 마쳤다. SQL 하니스 321 passed, unit 1916 passed, lint·tsc 통과, 로컬 E1 2/2. 분석 일치율 96%(Critical·Important 0).

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 데모 첫 화면은 "문서 요약·결정·할 일·열린 질문과 원문 근거를 확인"이라고 소개했지만 데모 「문서」는 자료 목록과 고정 문장만 보여 줬다. |
| **Solution** | 데모 부서 요약만 익명으로 읽고, 렌더 전에 원문으로 다시 검증해 실제 화면과 같은 요약 구역으로 보여 준다. |
| **Function/UX Effect** | 로그인 없이 "배포 점검 회의록 (합성)"에서 한눈에 보기(원문 두 문장)·결정·정책·다음 할 일·확인이 필요한 질문·원문 근거 5개를 확인한다. 지원서 3건도 요약이 보인다. |
| **Core Value** | 데모가 실제 제품과 같은 화면·같은 검증 규칙을 보여 준다. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---|:-:|---|
| SC1 | 익명은 데모 요약만 읽고 쓰기 불가 | ✅ | SQL 하니스 신규 5개 통과 |
| SC2 | 읽기 시 재검증·시드 dropped 0 | ✅ | U1~U4, seed-demo 14 passed |
| SC3 | 데모 화면 요약 구역·원문 문장 overview | ✅ 로컬 / ⏳ 운영 | E1 2 passed, 캡처 |
| SC4 | lint·test·build·데모 회귀 | ⚠️ | E2 61/65(로컬 DB 환경 4건), 운영 반영 후 재확인 |

Overall: 3/4 확정, 1건 운영 확인 대기.

## 2. Key Decisions & Outcomes

| 결정 (출처) | 따름 | 결과 |
|---|:-:|---|
| 설계안 A: DB 데모 읽기 정책 (사용자 선택, ADR-092) | ✅ | 기존 `*_demo_read` 형태와 같은 정책 1개 |
| 쓰기 정책·RPC·새 테이블 없음 (PRD §8) | ✅ | INSERT 거부·UPDATE/DELETE 0행 확인 |
| 읽을 때 원문 재검증 (ADR-092) | ✅ | 배포·재시드 순서와 무관하게 원문 없는 문장 비렌더 |
| 공유 요약 컴포넌트 (design M6) | ✅ | 실제 문서 화면 출력 불변 |
| phase·ADR 번호 | 변경 | 다른 세션의 52·ADR-091과 겹쳐 53·ADR-092로 |

## 3. 남은 일

1. 운영 migration 0070 (`db push --workdir . --skip-vault`, dry-run 대상 0070 한 건 확인됨)
2. 운영 데모 시드 재생성 `npx tsx scripts/seed-demo.ts` (데모 조직만, LLM 호출 없음)
3. PR #46 병합 → 운영 E1(`demo-document-summary.spec.ts`)·E2(데모 회귀) 재실행·캡처

## 4. Lessons

- 메인 체크아웃 안에 둔 worktree는 Supabase CLI·Next 개발 서버가 상위 폴더를 프로젝트로 잡는다. 운영 DB 작업은 `--workdir .`와 dry-run 대상 확인이 필수다.
- 같은 날 여러 세션이 phase·ADR 번호를 잡을 수 있다. 번호를 정하기 전에 메인 체크아웃의 미커밋 변경을 확인한다.
- 화면 변경은 기능 E2E 통과 뒤에도 캡처를 실제 화면과 나란히 보고 스타일 차이를 확인한다(이번 M1).
