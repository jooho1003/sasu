---
template: plan
version: 1.3
feature: recording-ux
project: sasu
date: 2026-09-29
author: wadelee1005@gmail.com
---

# recording-ux Planning Document

> **Summary**: 웹 회의 녹음 화면·검토 화면·관리자 설정의 UI/UX 문제 22건(U01~U22)을 고친다. 시작은 `녹음 시작` 한 번(ADR-071).
>
> **Project**: sasu · **Date**: 2026-09-29 · **Status**: 구현·로컬 검증 완료, 단계별 Graft 이력 조건 미충족
>
> **이 문서의 지위**: bkit PDCA용 **어댑터**다. 범위 원천은 [PRD](../../PRD.md) 1.18·§3-4 REC-06, 결정 이유는 [ADR-071](../../ADR.md), 상세 계약은 [웹 회의 녹음 설계](../../planning/웹회의_녹음_설계.md) §4.1, 문제 목록은 [검토 기록](../../verification/recording-ux-2026-09-29/README.md) §1이다. **여기에 새 결정을 적지 않는다.** 결정이 바뀌면 PRD·ADR을 먼저 고친다.

---

## Executive Summary

| Perspective | Content |
|-------------|---------|
| **Problem** | 녹음을 시작하려면 세 번 눌러야 하고, 되돌릴 수 없는 `녹음 종료`에 확인이 없으며, 녹음 중 링크 이동이 녹음을 끊는다. 오류가 성공과 같은 초록 상자에 영문 코드로 나온다(검토 기록 §1 U01~U22). |
| **Solution** | 입력 선택 → 세션 → 키 → 사전 검사 → 캡처를 한 번의 클릭으로 묶는다(ADR-071). 표시 문구·판정은 순수 모듈 `lib/recording/recorder-copy.ts`로 모으고, 화면 변경은 기존 컴포넌트 안에서 한다. |
| **Function/UX Effect** | 종료 확인·이탈 보호·탭 제목으로 녹음이 실수로 끊기지 않는다. 경고·오류가 모양과 한국어 문구로 구분되고 누른 자리에 나온다. 단계 표시·비활성 이유로 다음 할 일을 안다. 플레이어 탐색이 요청 한도에 걸리지 않는다. |
| **Core Value** | 회의 기록을 놓치지 않는 녹음 — 검증 가능한 업무 근거(PRD §3-4)의 입력 품질을 지킨다. |

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 시작·종료·이탈 흐름의 실수로 회의 녹음을 잃거나 세션이 진행 한도를 24시간 차지한다 (U01·U02·U08) |
| **WHO** | 녹음하는 부서장(동의한 lead), 녹음 자료를 검토하는 부서원, 조직 스위치를 켜고 끄는 관리자 |
| **RISK** | 복구 로직이 오류 코드 문자열로 분기한다(`meeting-recorder.tsx` `recover`, `recording_unavailable`) — 던지는 코드를 바꾸면 로컬 자료 삭제 분기가 깨진다 |
| **SUCCESS** | 공유 취소 시 `POST /recordings` 0건 · 설정 실패 시 남은 트랙 0개 · 키·사전 검사 실패 시 `discard` 1건 · 탐색 중 원본 요청 ≤2건 · U01~U22 결과표(step 8) |
| **SCOPE** | S0 문구 모듈 → S1 한 번 클릭 시작 → S2 안전(종료 확인·이탈·탭·알림) → S3 흐름(단계·이유·복구 목록) → S4 플레이어 → S5 진입 스위치 → S6 검토 화면 → S7 관리자 → S8 검증 |

---

## 1. Overview

### 1.1 Purpose
녹음 화면에서 사용자가 실수로 녹음을 잃지 않고, 무엇을 해야 하는지 화면만 보고 알게 한다.

### 1.2 Background
2026-09-29 사용자 요청 "ui/ux 검토해줘"로 녹음 화면과 QA 페이지를 검토했다. 결과는 검토 기록 §1의 22건이다. 시작 단계는 사용자가 "준비·시작을 한 번의 클릭으로"를 골랐고 ADR-071로 기록했다. step 초안은 사용자가 "이대로 생성"으로 승인했다(`.claude/plans/recording-ux-2026-09-29.md`).

### 1.3 Related Documents
- 범위: PRD 1.18 머리말 · §3-4 REC-06
- 결정: ADR-071 (선행 ADR-056·070)
- 상세 계약: `docs/planning/웹회의_녹음_설계.md` §4.1·§9
- 불변식: ARCHITECTURE §6-5 불변식 30
- 문제 목록·코드 관계: `docs/verification/recording-ux-2026-09-29/README.md` §1·§3
- 실행 명세: `phases/33-recording-ux/step0~8.md` · 모델 배정: `.claude/plans/recording-ux-2026-09-29.plan.json`

---

## 2. Scope

### 2.1 In Scope
- [x] S0 표시 문구·판정 순수 모듈 (U07·U09·U15 기반)
- [x] S1 한 번 클릭 시작 (U08, ADR-071)
- [x] S2 종료 확인·이탈 보호·탭 제목·알림 모양·상태 표시·스크린 리더 (U01~U04·U06·U07·U13)
- [x] S3 단계 표시·비활성 이유·복구 목록·돌아가기·폐기 분리·입력 표시 (U08~U12·U14~U16)
- [x] S4 플레이어 탐색 확정·취소·배치 (U05·U17)
- [x] S5 목록 API `recording_enabled`·`original_layout`, 진입 숨김·배지 (U21·U22)
- [x] S6 검토 화면 경고 모양·이어진 기록 줄 (U18·U19)
- [x] S7 관리자 설명 위치·진행 중 건수 (U20)
- [x] S8 로컬 E2E·캡처·키보드 흐름·결과표

### 2.2 Out of Scope
- 서버 route 동작·SQL·migration 변경 (S5의 목록 응답 필드 추가만 예외)
- 실제 기기 녹음 검증 V01~V06 (phase 23 녹음 게이트)
- Meet·Zoom 공식 자료 수집 (MEET-01, 2단계)
- 운영 반영 — phase 23 녹음 게이트와 함께 사용자 승인 뒤

---

## 3. Requirements

### 3.1 Functional Requirements

요구 원문은 검토 기록 §1 표의 U01~U22다. 여기서는 묶음만 매핑한다.

| ID | Requirement | 원천 | Priority | Status |
|----|-------------|------|----------|--------|
| FR-01 | `녹음 시작` 한 번으로 입력 선택 → 세션 → 키 → 사전 검사 → 캡처. 취소 시 세션 없음, 실패 시 트랙 정지·세션 폐기 | ADR-071, U08 | High | 구현됨(S1) |
| FR-02 | `녹음 종료`는 화면 안 두 단계 확인 | U01, 검토 기록 §2 | High | 구현·검증됨 |
| FR-03 | 녹음 중 새로고침·링크 이동 보호, 탭 제목 표시 | U02·U03 | High | 구현·검증됨 |
| FR-04 | tone별 알림(info·warning·error), 누른 패널 안 표시, 영문 코드 미노출 | U04·U07 | High | 구현·검증됨 |
| FR-05 | 상태 칩·큰 타이머·로컬 저장 지연 경고, 타이머는 live region 밖 | U06·U13 | Medium | 구현·검증됨 |
| FR-06 | 단계 표시와 비활성 이유 목록 | U08·U09 | Medium | 구현·검증됨 |
| FR-07 | 복구 목록 정리·새 녹음 화면으로 돌아가기·폐기 분리 | U10~U12 | Medium | 구현·검증됨 |
| FR-08 | 라디오 그룹·미터 이름·1.5초 입력 감지·모드별 안내 | U14~U16 | Medium | 구현·검증됨 |
| FR-09 | 플레이어 탐색 확정 시점·요청 취소·한 줄 배치 | U05·U17 | High | 구현·검증됨 |
| FR-10 | 조직 스위치가 꺼지면 녹음 진입 없음, 녹음 자료 배지 | U21·U22 (설계 V19) | High | 구현·검증됨 |
| FR-11 | 검토 화면 과입력 경고 모양·이어진 기록 이동 줄 | U18·U19 | Low | 구현·검증됨 |
| FR-12 | 관리자 설명 위치·진행 중 녹음 건수 미리 보기 | U20 | Low | 구현·검증됨 |

### 3.2 Non-Functional Requirements

| Category | Criteria | Measurement Method |
|----------|----------|-------------------|
| 불변식 | 첫 샘플은 세션·키·사전 검사 뒤에만 IndexedDB에 저장 (불변식 30) | S1 Playwright 사례, 코드 리뷰 |
| 권한 | 목록 API는 세션 클라이언트 RPC만, service role import 없음 | S5 route 단위 테스트 |
| 요청 한도 | 재생 중 탐색 1회당 원본 요청 ≤2건 | S4 Playwright 사례 |
| 접근성 | 경고·오류 글자 대비 4.5:1, 색만으로 구분하지 않음, 키보드만으로 완주 | S2·S8 캡처, `keyboard-recorder.spec.ts` |
| 반응형 | 1440×900·390×844에서 가로 넘침 없음 | S8 캡처 |

---

## 4. Success Criteria

### 4.1 Definition of Done
- [ ] step 0~8 `completed` (Graft 전후 결과 포함, Archify 미실행 사유 기록)
- [x] `npm run lint && npm run build && npm run test` 통과, `npm run e2e:review-controls` 통과
- [x] 로컬 Supabase 제품 E2E(`tests/e2e/recording-product.spec.ts`) 통과
- [x] 검토 기록 §6에 U01~U22별 결과(해결·부분·남음)와 근거
- [x] `/pdca analyze recording-ux` 일치율 ≥ 90% (설계 항목 95%, 완료 게이트는 별도)
- [x] 최종 리뷰(R1, 메인 세션): off→on 건수 누락 수정·재검증, Graft 이력 미생성은 열림

### 4.2 Quality Criteria
- [x] 새 `lib/` 모듈 TDD (`recorder-copy.ts` ↔ `tests/recording/recorder-copy.test.ts`)
- [x] 던지는 오류 코드 변경 0건 (표시 시점 변환만)
- [x] 영문 오류 코드(`recording_*`) 화면 노출 0건

---

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| 오류 코드를 한국어로 바꿔 던지면 `recover`의 로컬 자료 삭제 분기가 깨짐 | High | Medium | 모든 step 금지사항: 던지는 코드는 그대로, 렌더 시점에 `recorderErrorText` |
| `getDisplayMedia` 앞에 비동기가 끼면 사용자 동작이 만료돼 공유 창이 안 열림 | High | Medium | S1: 첫 `await`는 `captureInputs(mode)` |
| 링크 이동 가로채기가 새 탭·수정키 이동까지 막음 | Medium | Low | S2: 같은 출처·수정키 없음·target 없음만 차단, 사례 테스트 |
| `execute.py`의 `git add -A`가 다른 세션 미커밋 변경을 step 커밋에 섞음 | Medium | High | 실행 전 작업 트리 정리 (검토 기록 §5) |
| Graft 실행 환경(Docker) 부재로 step 완료 판정 불가 | Medium | High | 도구 결과 확보 전 `blocked` 유지, 추정 기록 금지 |

---

## 6. Impact Analysis

코드 관계 원문은 검토 기록 §3(`graft-plan.txt`).

### 6.1 Changed Resources

| Resource | Type | Change Description |
|----------|------|--------------------|
| `lib/recording/recorder-copy.ts` | 신규 모듈 | 표시 문구·단계·조건·만료·탭 제목 판정 |
| `components/meeting-recorder.tsx` | 컴포넌트 | `prepare()`+`begin()` → `start()`, 안전·흐름 UI |
| `components/recording-segment-player.tsx` | 컴포넌트 | 탐색 확정·취소·배치 |
| `components/reviewed-materials.tsx` | 컴포넌트 | 진입 링크 조건·배지 |
| `components/review-detail.tsx` | 컴포넌트 | 경고 모양·이어진 기록 줄 |
| `components/admin/review-settings.tsx` | 컴포넌트 | 설명 위치·진행 중 건수 |
| `GET /api/d/[dept]/reviews` | API 응답 | `recording_enabled`·`original_layout` 추가 |
| `app/(auth)/d/[dept]/reviews/record/page.tsx` | 페이지 | 스위치 꺼짐 안내 |
| `app/globals.css` | 스타일 | `.meeting-recorder`·검토 화면 범위 클래스 |

### 6.2 Current Consumers

| Resource | Operation | Code Path | Impact |
|----------|-----------|-----------|--------|
| `MeetingRecorder` | RENDER | `app/(auth)/d/[dept]/reviews/record/page.tsx:14`, `scripts/review-controls-lab/main.tsx:12` | 버튼 이름 변경 — 테스트 갱신 |
| `RecordingSegmentPlayer` | RENDER | `components/review-detail.tsx:487` | 버튼 이름 유지 — None |
| `ReviewSettingsForm` | RENDER | `app/admin/security/page.tsx:15`, `scripts/review-controls-lab/main.tsx:10` | 이름 유지 — None |
| `reviews/record` 진입 | LINK | `reviewed-materials.tsx:222`, `review-detail.tsx:357`, `tests/e2e/recording-product.spec.ts:57` | 스위치 조건 추가 — 검증 필요 |
| 목록 API 응답 | READ | `components/reviewed-materials.tsx` | 필드 추가만 — None |

### 6.3 Verification
- [x] 위 사용처의 테스트가 새 흐름으로 통과
- [x] 권한 변경 없음 (세션 RPC `review_org_settings`만 추가 호출)
- [x] 목록 응답 필드 추가가 기존 사용처를 깨지 않음

---

## 7. Architecture Considerations

### 7.1 Project Level Selection
**Dynamic** (Next.js App Router + Supabase). 기술 스택은 CLAUDE.md·ADR을 따른다. 이 기능은 새 의존성을 추가하지 않는다.

### 7.2 Key Architectural Decisions

| Decision | Options | Selected | Rationale |
|----------|---------|----------|-----------|
| 시작 흐름 | 3단계 유지 / 테스트 스트림 재사용 / 세션 먼저 / 입력 선택 먼저 | 입력 선택 먼저 | ADR-071 (기각 대안 3개 포함) |
| 종료 확인 | `window.confirm` / 화면 안 두 단계 | 화면 안 두 단계 | 검토 기록 §2 |
| 문구 위치 | 컴포넌트 내부 / 순수 모듈 | 순수 모듈 (TDD) | design 문서 §2 설계안 C |
| 서버 변경 | 없음 / 목록 필드 추가 | 목록 필드 2개만 | U21·U22, 권한 경로 불변 |

---

## 8. Convention Prerequisites
- CLAUDE.md 아키텍처 규칙 (service role 금지, 로그에 본문 금지), `lib/` TDD
- UI 언어 한국어 단일, i18n 없음
- step 명세 형식: `.claude/commands/harness.md` D-3

---

## 9. Next Steps
1. [x] `/pdca plan recording-ux` (이 문서)
2. [x] `/pdca design recording-ux` → `docs/02-design/features/recording-ux.design.md`
3. [ ] step 0~7의 과거 개별 Graft 전후 결과: 당시 Docker 장애로 미생성. 계획·최종 Graft는 실행·통과했으나 이 이력은 재구성 불가
4. [x] step 0~8을 수동 구현·검증 (`execute.py` 자동 커밋은 다른 미커밋 작업 보호를 위해 사용하지 않음)
5. [x] `/pdca analyze recording-ux` → 설계 일치율 95%, Plan 단계별 Graft 조건은 미충족
6. [x] `/pdca report recording-ux` → Partial 보고서, phase 완료 게이트 보류

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.1 | 2026-09-29 | 최초 작성 (step 0~8 승인 뒤 소급 작성) | wadelee1005@gmail.com |
