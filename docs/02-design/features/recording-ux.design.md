---
template: design
version: 1.0
feature: recording-ux
project: sasu
date: 2026-09-29
author: wadelee1005@gmail.com
plan: docs/01-plan/features/recording-ux.plan.md
---

# recording-ux Design Document

> **Summary**: 녹음 화면 UI/UX 개선의 구조·계약·화면·테스트 설계. **bkit PDCA용 어댑터** — 권위는 [ADR-071](../../ADR.md), [PRD](../../PRD.md) §3-4 REC-06, [웹 회의 녹음 설계](../../planning/웹회의_녹음_설계.md) §4.1, ARCHITECTURE §6-5 불변식 30에 있다. `/pdca analyze`가 대조할 목록(모듈·컴포넌트·엔드포인트·화면·테스트)은 여기에 인라인으로 두고, 구현 지시는 `phases/33-recording-ux/step{N}.md`를 가리킨다. **여기에 새 결정을 적지 않는다.**
>
> **Project**: sasu · **Date**: 2026-09-29 · **Status**: Approved (설계안 C 선택 2026-09-29)

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 시작·종료·이탈 흐름의 실수로 회의 녹음을 잃거나 세션이 진행 한도를 24시간 차지한다 (U01·U02·U08) |
| **WHO** | 녹음하는 부서장(동의한 lead), 녹음 자료를 검토하는 부서원, 조직 스위치를 켜고 끄는 관리자 |
| **RISK** | 복구 로직이 오류 코드 문자열로 분기한다(`recover`, `recording_unavailable`) — 던지는 코드를 바꾸면 로컬 자료 삭제 분기가 깨진다 |
| **SUCCESS** | 공유 취소 시 `POST /recordings` 0건 · 설정 실패 시 남은 트랙 0개 · 키·사전 검사 실패 시 `discard` 1건 · 탐색 중 원본 요청 ≤2건 · U01~U22 결과표 |
| **SCOPE** | S0 문구 모듈 → S1 시작 → S2 안전 → S3 흐름 → S4 플레이어 → S5 진입 스위치 → S6 검토 화면 → S7 관리자 → S8 검증 |

---

## 1. Overview

### 1.1 Design Goals
1. 녹음은 실수로 끝나거나 끊기지 않는다 — 종료 확인, 이탈 보호, 중단 시 탭 제목 (U01~U03)
2. 시작은 한 번의 클릭이고, 취소·실패가 세션이나 트랙을 남기지 않는다 (ADR-071)
3. 화면에 영문 코드가 없고, 경고·오류가 누른 자리에 모양으로 구분돼 나온다 (U04·U07)
4. 서버·권한 경로는 그대로다 — 목록 응답 필드 2개 추가만 (U21·U22)

### 1.2 Design Principles
- **던지는 값은 그대로, 표시할 때만 변환한다.** `recover`가 `cause.message === "recording_unavailable"`로 분기한다(검토 기록 §3).
- **판정은 순수 함수로.** 문구·단계·조건·만료·탭 제목은 DOM 없는 `lib/recording/recorder-copy.ts`에 두고 단위 테스트한다(CLAUDE.md TDD).
- **불변식 30 유지.** 첫 샘플은 세션·키·사전 검사가 끝난 뒤에만 저장한다. 그 사이 소리는 메모리에도 모으지 않는다.
- **사용자 동작은 입력 선택에 쓴다.** `start()`의 첫 `await`는 `captureInputs(mode)`다.

---

## 2. Architecture Options

### 2.0 Architecture Comparison

| 기준 | A 최소 변경 | B 클린 아키텍처 | **C 실용 균형 (선택)** |
|------|-------------|-----------------|------------------------|
| 구조 | 각 컴포넌트 안에서 직접 수정 | `meeting-recorder.tsx`를 훅(`useRecorderSession`·`useLeaveGuard`)과 하위 컴포넌트로 분해 | 문구·판정은 순수 모듈, 화면은 기존 컴포넌트 안에서 |
| 복잡도 | 낮음 | 높음 | 중간 |
| 테스트 | 문구가 E2E에만 남음 | 훅 단위 테스트 가능 | 순수 모듈 단위 + Playwright |
| 변경량 | 작음 (step 0 되돌림 필요) | 큼 (step 1~3 재작성) | 중간 (현재 step 0~8) |
| 위험 | 문구 분기 회귀를 늦게 발견 | 녹음 상태 이동 중 회귀 | 컴포넌트 크기는 줄지 않음 |

**선택: C** — 사용자 선택(2026-09-29). step 0·1이 이미 이 방식으로 구현돼 있다.

### 2.1 Component Diagram

```
app/(auth)/d/[dept]/reviews/record/page.tsx ── 스위치 꺼짐 → 안내 (S5)
        │ 켜짐
        ▼
components/meeting-recorder.tsx ──uses──▶ lib/recording/recorder-copy.ts (S0)
        │ start(): captureInputs → POST /recordings → key → probe → startRecording (S1)
        │ 안전·흐름 UI (S2·S3)
        ▼
lib/recording/browser/* (입력·저장소·캡처, 변경 없음)

components/reviewed-materials.tsx ──GET /api/d/[dept]/reviews (recording_enabled, original_layout)── (S5)
components/review-detail.tsx ──▶ components/recording-segment-player.tsx (S4·S6)
components/admin/review-settings.tsx ──GET /api/admin/review-settings (active_recordings)── (S7)
```

### 2.2 Data Flow — 시작 (ADR-071)

`녹음 시작` 클릭 → ① `captureInputs(mode)` (취소 → 세션 0건) → ② `crypto.randomUUID()` + `POST /recordings` → ③ `keyFor(id)` 1회 → ④ `probeRecordingStore` → ⑤ `startRecording`. ②~④ 실패 → `stopInputs` + (세션 있으면) `POST /recordings/[id]/discard`. ⑤ 이후 실패 → `interrupt("recording_setup_failed")`. ②~④ 동안 화면은 `녹음 준비 중`(role="status").

### 2.3 Dependencies
새 패키지 없음. 기존 `lib/recording/browser/{inputs,storage}.ts`, 녹음 route, RPC `review_org_settings`를 그대로 쓴다.

---

## 3. Data Model

변경 없음. 테이블·컬럼·migration을 추가하지 않는다. 읽기만 추가한다.

| 대상 | 사용 | 위치 |
|------|------|------|
| `review_org_settings(p_dept)` RPC 결과 `browser_recording_enabled` | 목록 API·녹음 페이지에서 세션 클라이언트로 읽기 | S5 |
| `reviewed_materials.original_layout` | 목록 select에 추가, `audio_segments`이면 `회의 녹음` 배지 | S5 |

---

## 4. API Specification

### 4.1 Endpoint List

| Method | Path | 변경 | Step |
|--------|------|------|------|
| GET | `/api/d/[dept]/reviews` | 응답에 `recording_enabled: boolean`, 항목에 `original_layout` 추가 | S5 |
| POST | `/api/d/[dept]/recordings` | 변경 없음 — 호출 시점만 입력 선택 뒤로 | S1 |
| POST | `/api/d/[dept]/recordings/[id]/key` | 변경 없음 — 시작당 1회 호출 | S1 |
| POST | `/api/d/[dept]/recordings/[id]/discard` | 변경 없음 — 시작 실패 시 즉시 호출 | S1 |
| GET | `/api/admin/review-settings` | 변경 없음 — 마운트 시 1회 읽기 추가 | S7 |

### 4.2 Detailed Specification — `GET /api/d/[dept]/reviews`
- 세션 클라이언트로 `client.rpc("review_org_settings", { p_dept: member.deptId })`. `browser_recording_enabled === true`일 때만 `recording_enabled: true`.
- RPC 오류·null → `recording_enabled: false`, 목록은 200으로 계속 돌려준다.
- service role 모듈(`lib/supabase/service`) import 금지. 응답 스키마가 `lib/contracts.ts`에 있으면 거기 먼저 추가하고 계약 테스트부터 고친다.

---

## 5. UI/UX Design

### 5.1 Screen Layout
- 녹음 화면: 제목 → 단계 표시(`1 입력 확인 · 2 녹음 · 3 저장`) → 양식(모드 라디오·미터·5초 테스트·`녹음 시작`·비활성 이유) 또는 녹음 패널(상태 칩·타이머·로컬 저장 시각·일시정지/재개·보조 `녹음 종료`) → 복구 목록(녹음 중 접힘) → 열린 세션 패널(맨 아래 위험 영역 `녹음 폐기`).
- 플레이어: `[원본 듣기] · 슬라이더 · m:ss / m:ss` 한 줄, 내려받기는 아래 줄.

### 5.2 User Flow
제목·동의 → 5초 테스트 → 확인 체크 → `녹음 시작`(입력 선택) → `녹음 준비 중` → 녹음 → 잠시 멈춤/재개 → `녹음 종료` → 확인(`녹음 끝내기`/`계속 녹음`·Esc) → 저장 단계.

### 5.3 Component List

| Component / Module | 역할 | Step |
|--------------------|------|------|
| `lib/recording/recorder-copy.ts` | `recorderErrorText` · `stopReasonNotice` · `sessionStateLabel` · `recorderStage` · `missingTestConditions` · `missingStartConditions` · `signalDetected` · `formatExpiry` · `recorderTabTitle` (+ 타입 `RecorderTone`·`RecorderStage`) | S0 |
| `components/meeting-recorder.tsx` | `start()`(prepare+begin 통합), 종료 확인, 이탈 보호, 탭 제목, tone 알림, 상태 표시, 단계 표시, 비활성 이유, 복구 목록, 돌아가기, 폐기 분리, 입력 표시 | S1·S2·S3 |
| `components/recording-segment-player.tsx` | 포인터 놓을 때·키보드 300ms 뒤 탐색 확정, `AbortController` 취소, 한 줄 배치·`aria-valuetext` | S4 |
| `components/reviewed-materials.tsx` | `recording_enabled`일 때만 `회의 녹음` 링크, `audio_segments` 배지 | S5 |
| `app/(auth)/d/[dept]/reviews/record/page.tsx` | 스위치 꺼짐 안내 + `올린 자료 확인` 링크 | S5 |
| `components/review-detail.tsx` | 과입력 경고 모양(`review-warning`), `<nav aria-label="이어진 회의 기록">` | S6 |
| `components/admin/review-settings.tsx` | 체크박스별 설명 + `aria-describedby`, 진행 중 녹음 n건 | S7 |
| `app/globals.css` | `.meeting-recorder` 범위 tone 클래스, 검토 화면 경고 클래스 | S2·S3·S6 |

### 5.4 Page UI Checklist

#### 녹음 화면 (`/d/[dept]/reviews/record`, 실험실 `/?view=recorder`)
- [ ] 주 버튼 `녹음 시작` 하나, `녹음 준비`·`입력 장치 선택하고 녹음 시작` 없음 (S1)
- [ ] 시작 중 `녹음 준비 중`(role="status"), 양식·버튼 잠김 (S1)
- [ ] `녹음 종료` 보조 버튼 → 화면 안 확인 `녹음 끝내기`/`계속 녹음`, Esc = 계속, `window.confirm` 없음 (S2)
- [ ] 녹음 중 `beforeunload` + 같은 출처 링크 이동 차단 안내, 끝나면 해제 (S2)
- [ ] 녹음 중 탭 제목에 `녹음 중`, 중단 시 `⚠ 녹음 중단`, 끝나면 원래 제목 (S2)
- [ ] 알림 `recorder-notice` / `is-warning` / `is-error`, 머리말 "주의"·"오류", 누른 패널 안 `role="alert"` + 포커스 (S2)
- [ ] 영문 코드·`서버 상태: expired` 류 노출 없음, `duration_limit`은 info·`role="status"` (S2)
- [ ] 상태 칩 + `m:ss / 30:00`(role="timer", aria-live off) + `이 기기에 저장됨 m:ss`, 지연 3초 이상 경고 (S2)
- [ ] 단계 표시 `aria-current="step"` 이동 (S3)
- [ ] 비활성 버튼 아래 빠진 조건 목록 + `aria-describedby` (S3)
- [ ] 복구 목록: 버튼 클래스, 열린 세션 제외, `제목 · 상태 · 만료`, `확인하고 저장`, 녹음 중 접힘 (S3)
- [ ] `새 녹음 화면으로` — 폐기 요청 0건, 세션은 목록에 남음 (S3)
- [ ] `녹음 폐기`는 맨 아래 위험 영역 + 설명 (S3)
- [ ] 라디오 같은 `name`, 미터 `aria-label`, 1.5초 입력 감지, 모드별 안내 (S3)
- [ ] 스위치 꺼짐 → `MeetingRecorder` 대신 안내 (S5)

#### 검토 화면 (`/d/[dept]/reviews/[id]`)
- [ ] 플레이어 한 줄 배치, `/ m:ss` 전체 길이, 슬라이더 `aria-label="녹음 시각"`·`aria-valuetext` (S4)
- [ ] 버튼 이름 `원본 듣기`·`원본 불러오는 중`·`듣기 잠시 멈추기`·`전체 녹음 음성 파일 내려받기`·`원본 결합 중` 유지 (S4)
- [ ] 과입력 경고는 경고 모양, `role="status"` 아님 (S6)
- [ ] 이어진 기록은 `nav` 한 줄, `section` 패널 없음 (S6)

#### 자료 목록 (`/d/[dept]/reviews`)
- [ ] 스위치 꺼짐 → `회의 녹음` 링크 없음 (S5)
- [ ] `audio_segments` 항목 배지 `회의 녹음` (S5)

#### 관리자 설정 (`/admin/security`)
- [ ] 각 체크박스 바로 아래 설명 + `aria-describedby` (S7)
- [ ] 녹음 켜짐·쓰기 가능 → "지금 진행 중인 녹음 n건"/"없습니다", readonly면 조회 0건 (S7)
- [ ] 이름 `원본 보호 설정 저장`·`원본 파일 내려받기 허용`·`웹 회의 녹음 사용` 유지 (S7)

---

## 6. Error Handling

### 6.1 Error Code Definition
오류 코드는 새로 만들지 않는다. 기존 코드를 표시 시점에만 한국어로 바꾼다(`recorderErrorText`, 규칙은 step0.md).

| 출처 | 코드 예 |
|------|---------|
| `lib/recording/browser/inputs.ts` `captureInputs` | `shared_audio_missing`, `NotAllowedError`(DOMException) |
| `lib/recording/browser/storage.ts` | `storage_space_insufficient`, `recording_other_tab` |
| 키 route | `recording_key_forbidden`, `recording_unavailable` |
| 중단 사유 (`snapshot.reason`) | `duration_limit`(info), `page_left`, `capture_suspended`, `recording_setup_failed` 등(warning) |

### 6.2 Error Response Format
서버 응답 형식 변경 없음. 화면 표시만 tone(info·warning·error) + 한국어 문구.

---

## 7. Security Considerations
- 요청 경로 service role 금지 — S5 route 테스트가 import 부재를 확인한다.
- 권한 판정 로직을 복제하지 않는다. 스위치는 RPC 결과를 읽기만 하고, 쓰기·세션 생성 검사는 서버(`start_review_recording`)가 그대로 한다. 링크를 숨기는 것은 권한이 아니다.
- 로그에 녹음·전사 본문을 쓰지 않는다. 오류 표시는 코드→문구 변환만.
- 시작 실패 시 트랙을 모두 멈춰 마이크·화면 공유가 켜진 채 남지 않게 한다.

---

## 8. Test Plan

### 8.1 Test Scope
- 단위(Vitest): `tests/recording/recorder-copy.test.ts`(S0), `tests/reviews-list-route.test.ts`(S5)
- 실험실 Playwright(`npm run e2e:review-controls`): `tests/review-controls/meeting-recorder.spec.ts`(S1~S3), `recording-segments.spec.ts`(S4·S6), `access.spec.ts`(S7), `keyboard-recorder.spec.ts`(S8 신규)
- 제품 E2E(로컬 Supabase): `tests/e2e/recording-product.spec.ts`(S1 수정, S8 실행)

### 8.2 L1: API Test Scenarios

| # | Endpoint | 조건 | 기대 |
|---|----------|------|------|
| 1 | GET `/api/d/[dept]/reviews` | RPC 켜짐 | `recording_enabled: true` |
| 2 | 〃 | RPC 꺼짐 / null / 오류 | `false`, 목록 200 |
| 3 | 〃 | 항목 | `original_layout` 포함 |

### 8.3 L2: UI Action Test Scenarios

| # | 동작 | 기대 | Step |
|---|------|------|------|
| 1 | 입력 권한 거부 | `POST /recordings` 0건, `role="alert"`, 재시도 가능 | S1 |
| 2 | `POST /recordings` 403 | 트랙 모두 `ended`, 캡처 없음 | S1 |
| 3 | 키 403 | `discard` 1건, 트랙 `ended` | S1 |
| 4 | 정상 시작 | 키 요청 1회(복구 뒤 2회), `녹음 준비` 버튼 0개 | S1 |
| 5 | `녹음 종료` → `계속 녹음` → `녹음 종료` → `녹음 끝내기` | 확인 뒤에만 종료 | S2 |
| 6 | 녹음 중 닫기 / 뒤로 링크 | `beforeunload` 발생 / 주소 유지·안내 | S2 |
| 7 | `role="status"` 글자 | `\d+:\d\d` 없음 | S2 |
| 8 | 제목 비움 | 비활성 + "제목" 조건 + `aria-describedby` | S3 |
| 9 | `새 녹음 화면으로` | `discard` 0건, 세션 목록에 남음 | S3 |
| 10 | 재생 중 슬라이더 끌기 / ArrowRight 10회 | 새 `play_original` ≤2건 | S4 |
| 11 | 관리자 readonly | 건수 조회 0건 | S7 |

### 8.4 L3: E2E Scenario Test Scenarios
- 로컬 Supabase 제품 흐름: 녹음 페이지 → `녹음 시작` 한 번 → 녹음 → 종료 확인 → 저장 → 검토 화면 재생 (S8)
- 키보드만으로 제목 → 동의 → 테스트 → 시작 → 멈춤·재개 → 종료(Esc 포함) → 저장 버튼 (S8)

### 8.5 Seed Data Requirements
- 로컬 조직 스위치 켜짐: `org_settings.browser_recording_enabled = true` (시드가 켜지 않으면 사람에게 요청, SQL은 step8.md)
- 환경 변수 이름: `NEXT_PUBLIC_SUPABASE_URL`(로컬), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RECORDING_KEY_SECRET`, `SEED_LEAD_EMAIL`, `SEED_LEAD_PASSWORD`

---

## 9. Clean Architecture

ARCHITECTURE §2 디렉토리·§8 TDD 예외를 따른다.

| 층 | 이 기능의 파일 | 규칙 |
|----|----------------|------|
| 순수 로직 | `lib/recording/recorder-copy.ts` | DOM·React·브라우저 API 의존 금지, TDD |
| 브라우저 어댑터 | `lib/recording/browser/*` | 변경 없음 |
| 프레젠테이션 | `components/*.tsx`, `app/globals.css` | TDD 예외, Playwright로 검증 |
| 배선 | `app/api/d/[dept]/reviews/route.ts`, `reviews/record/page.tsx` | 세션 클라이언트만 |

---

## 10. Coding Convention Reference
- UI 문구 한국어 단일, i18n 없음
- CSS는 기존 색 변수 우선, 새 클래스는 `.meeting-recorder`·검토 화면 범위 안
- 버튼·체크박스 이름 중 테스트가 쓰는 것은 유지 (§5.4에 명시)
- 새 환경 변수 없음

---

## 11. Implementation Guide

### 11.1 File Structure
신규: `lib/recording/recorder-copy.ts`, `tests/recording/recorder-copy.test.ts`, `tests/reviews-list-route.test.ts`(없으면), `tests/review-controls/keyboard-recorder.spec.ts`. 나머지는 §5.3의 기존 파일 수정.

### 11.2 Implementation Order
`phases/33-recording-ux/step0.md` → `step8.md` 순서. S0(모듈)이 S2·S3의 입력이고, S1(시작)이 S2·S3의 전제다. S4~S7은 서로 독립이다.

### 11.3 Session Guide

#### Module Map

| Module | Step | 파일 | 선행 |
|--------|------|------|------|
| module-copy | S0 | `lib/recording/recorder-copy.ts` | — |
| module-start | S1 | `meeting-recorder.tsx` | module-copy |
| module-safety | S2 | `meeting-recorder.tsx`, `globals.css` | module-start |
| module-flow | S3 | `meeting-recorder.tsx`, `globals.css` | module-safety |
| module-player | S4 | `recording-segment-player.tsx` | — |
| module-entry | S5 | reviews route, `reviewed-materials.tsx`, record page | — |
| module-review | S6 | `review-detail.tsx`, `globals.css` | module-safety(tone 규칙) |
| module-admin | S7 | `admin/review-settings.tsx` | — |
| module-verify | S8 | 검증 기록 | 전부 |

#### Recommended Session Plan
하네스가 step마다 독립 세션으로 실행한다(`python scripts/execute.py 33-recording-ux`, Codex `gpt-5.6-terra`·medium). 최종 리뷰(R1)는 메인 세션이 한다.

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-09-29 | 최초 작성 (설계안 C, step 0~8 승인 뒤 소급 작성) | wadelee1005@gmail.com |
