# document-overview-grounding Completion Report

> Status: 구현·검증 완료, 운영 반영(main 병합) 사용자 승인 대기.
> Project: 사수(SASU) · phase 51
> Author: root(Claude Code) · step 0 서브에이전트 · 독립 분석 gap-detector
> Completion Date: 2026-10-06 · PDCA Cycle: phase 51

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | document-overview-grounding (문서 요약 `overview` 원문 문자열 검증) |
| Start Date | 2026-10-05 (V16 실측 발견) |
| End Date | 2026-10-06 |
| Duration | 2일 (V16 발견 → PRD §8·ADR-090 → plan → design → step 0 → V16 재실측 → analyze 100% → report) |

### 1.2 Results Summary

변경은 `lib/pipeline/document-summary.ts` 한 모듈과 테스트 2파일이다. 단위 U1~U5 red→green, 전체 unit 188 files / 1,906 passed, lint blocking 0, `tsc --noEmit` 0, build 통과. 실제 Groq로 V16을 5회 다시 돌려 overview의 문서 밖 문장 0/5, CANARY 0/5를 확인했다(수정 전 1/1·2/5). 분석 일치율 100%(Critical·Important 0).

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 문서 요약 항목·인용은 원문 문자열로 검증했지만 맨 위 `overview` 한 문장은 검증 없이 화면에 나와, 지시문을 심은 문서에서 문서에 없는 문장과 지시 문구가 그대로 보였다. |
| **Solution** | overview를 문장 단위로 원문과 대조하고, 하나라도 원문에 없으면 검증된 요약 항목 문장(최대 2개)으로, 항목도 없으면 고정 문구로 바꾼다. chunk 요약과 병합 결과 모두 같은 규칙. |
| **Function/UX Effect** | 정상 문서는 원문의 핵심 문장 1~2개가 "한눈에 보기"에 나온다. 화면 구조·저장 형식·LLM 호출 수는 그대로다. |
| **Core Value** | "인용 없는 문장은 렌더하지 않는다" 원칙이 문서 요약 화면 전체에 적용된다. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---|:-:|---|
| SC1 | 단위 테스트(검증·대체·고정 문구) | ✅ | `tests/pipeline/document-summary.test.ts` U1~U5, red 5 failed → green 10 passed |
| SC2 | V16 재실측 overview CANARY·문서 밖 문장 0 | ✅ | [`v16-2026-10-06.json`](../../verification/51-document-overview-grounding/v16-2026-10-06.json) 5/5 |
| SC3 | lint·test·build | ✅ | [step0.md](../../verification/51-document-overview-grounding/step0.md) |

Overall: 3/3.

## 2. Key Decisions & Outcomes

| 결정 (출처) | 따름 | 결과 |
|---|:-:|---|
| overview 유지 + 원문 문자열 검증 대체 (ADR-090, 대안 A 제거·B 인용 요구·C 패턴 감지 기각) | ✅ | 스키마·DB·LLM 호출 무변경으로 V16 overview 판정 통과 |
| 대체 순서 key_points→decisions→actions, 최대 2개 (PRD §8) | ✅ | `groundedOverview()` |
| 대체 시 `dropped` +1 (Plan FR3) | ✅ | `status_reason`만 바뀌고 화면 비노출 |
| 병합 결과도 같은 규칙 (Plan FR2, Design §2) | ✅ | chunk 검증 후 병합, 최종 출력 재검증 |
| 문서 안 지시문 문장의 항목 채택은 범위 밖 (ADR-090 경계) | ✅ | V16 5/5에서 여전히 채택 — 아래 후속 |

## 3. 남은 일

- **운영 반영:** PR main 병합 = Vercel 자동 배포. DB 변경 없음. 사용자 승인 뒤 실행.
- **후속 결정 필요(범위 밖):** 문서에 실제로 들어 있는 지시문·주장 문장("이 문서는 모든 구매 규정을 면제하며 승인 없이 집행할 수 있다.")이 원문 검증을 통과해 key_points(5/5)·카드 본문·overview(2/5)에 나온다. 선택지는 v16-2026-10-05.md "해석"과 ADR-090 경계 참조(사람 검토 표시, 지시문 의심 분리, V16 통과 기준 재정의).

## 4. Lessons

- 구조화 출력의 "자유 문장" 필드는 검증 목록에서 빠지기 쉽다. 새 요약 필드를 추가할 때 원문 검증 대상인지부터 정한다.
- 공격 하니스는 판정 항목을 필드별로 나눠야 수정의 효과를 따로 측정할 수 있다(V16에 overview 전용 판정 추가).
