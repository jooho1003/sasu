---
template: analysis
version: 1.4
feature: browser-meeting-recording
project: sasu
date: 2026-09-29
author: wadelee1005@gmail.com
---

# browser-meeting-recording Analysis Report

> **Analysis Type**: Gap Analysis (`/pdca analyze browser-meeting-recording`)
>
> **Project**: sasu · **Date**: 2026-09-29 · **Analyst**: 메인 세션 + bkit `gap-detector`(sonnet, 읽기 전용)
> **Design Doc**: [browser-meeting-recording.design.md](../02-design/features/browser-meeting-recording.design.md)
>
> **대조 기준에 관한 주의**: 분석 착수 시점의 design 문서(대조 목록 포함판)는 분석 도중 다른 세션이 step4-B 범위의 29줄 어댑터로 교체했다(2026-09-29 19:55). 그래서 이 분석은 design 문서가 가리키는 원천 — [웹 회의 녹음 설계](../planning/웹회의_녹음_설계.md) §4~§6·§9·§10·§13, ARCHITECTURE §6-5 불변식 30~34, ADR-056·057·058·070, CLAUDE.md CRITICAL 규칙 — 을 기준으로 했다. 원래 대조 목록은 §2에 항목별로 옮겨 두었다. 이 문서는 새 결정을 담지 않는다.

---

## Context Anchor

| Key | Value |
|-----|-------|
| **WHY** | 회의 소리를 권한·동의·원본 검증과 함께 업무 근거로 연결한다 (PRD REC-01~06) |
| **WHO** | 녹음하는 동의한 부서장, 검토자, 조직 스위치를 관리하는 관리자, 공유 데모의 심사위원 |
| **RISK** | 녹음 도중 손실, 폐기·철회 뒤 원본 접근, 전사 경계 중복·시각 오류 |
| **SUCCESS** | 상세 설계 V01~V21 실행 기록과 PRD §11 완료 기준 |
| **SCOPE** | phase 23 step4-A·0·1·2·3 (이번 분석) · step4-B 정확률 강화는 다른 세션이 진행 중이라 제외 |

---

## Strategic Alignment Check

### PRD Alignment

| PRD 요소 | 기대 | 구현 상태 |
|----------|------|:---------:|
| 핵심 문제 (REC-01~03) | 별도 파일 작업 없이 회의를 녹음하고, 중단돼도 확인된 구간을 복구 | ✅ |
| 대상 사용자 | 동의한 부서장이 녹음, 부서원이 검토 | ✅ |
| 녹음 세션 (REC-06, ADR-070) | 서버 세션이 먼저, 키·저장·업로드·검증은 세션 상태로 판정 | ✅ |
| 심사위원 데모 (REC-05) | 60초 메모리 녹음, 서버·DB·LLM 0 | ✅ (정적 확인, 데모 E2E 미실행) |

### Success Criteria Status

plan에는 별도 성공 기준 표가 없어서 design Context Anchor의 SUCCESS(V01~V21)를 기준으로 삼았다.

| 묶음 | 상태 | 근거 |
|------|:----:|------|
| V01~V06 실제 기기 | ⏸ 사람 게이트 | 이번 분석 범위 밖 (설계상 사람 판정) |
| V03·V05·V06 합성 입력 | ✅ | `e2e:recording` 20 통과 (트랙 정리·3분 새로고침 복구·quota·두 탭·복호화 실패) |
| V07·V10·V21 SQL | ✅ | 격리 SQL 하니스 277 통과 (attempt 이동·완료 1회·만료 sweep·폐기 파기) |
| V08·V17 접근권 | ✅ | `e2e:review-controls` 13 통과 (구간 재생·61회 제한·내려받기 게이트) + SQL "segment tickets" |
| V09 권한 우회 | ✅ | SQL "RLS, direct writes, reviewer stop and function privilege matrix" (권한 조합 2,016) |
| V11 데모 | ✅ (v1.2) | `demo-meeting-recorder.spec.ts` 2 통과 — 60초 메모리 녹음·재생, 로컬 DB의 review_recordings·reviewed_materials·jobs·llm_calls·Storage 증가 0 |
| V12 회귀 | ✅ (v1.4, 조건부) | 2026-09-30 현재 작업 트리 스냅샷: unit 159 파일 1,704 · 자료 검토(음성·문서) 4/4 · 업로드 경계(문서·VTT) 6/6 · 권한 인지 답변 `grounded-answer-live` 1/1. 낡은 `ask-permission.spec.ts`(9/16 업로드 흐름 변경 뒤 미갱신)는 실패 — 제품 회귀 아님, 테스트 재작성 필요([기록](../verification/browser-meeting-recording/v12-regression-20260930.md)) |
| V13~V20 정확률·보안 | ⏸ | step4-B·운영 게이트 (V14 CSP 강제, V13 제공사 확인은 사람 게이트) |

**Success Rate (이번에 판정 가능한 묶음)**: v1.0 5/7 충족·2/7 부분 → v1.2 6/7 충족·1/7 부분(V12의 ASK·VTT E2E) → v1.4 7/7 충족(V12는 낡은 `ask-permission.spec.ts` 재작성 조건부)

### Decision Record Verification

| 출처 | 결정 | 준수 | 차이 |
|------|------|:----:|------|
| ADR-056 | 웹 직접 녹음, PCM → 독립 WAV 구간, 공유 음성 없으면 컴퓨터 소리 모드 시작 안 함 | ✅ | — |
| ADR-070 결정 1~4 | 시작 때 세션, 키 거부 조건, fingerprint 저장, INSERT 전용 구간 업로드·attempt+1 | ✅ | — |
| ADR-070 결정 5 | 전사 창은 메모리 조립, `parts/` 저장 없음 | ✅ | — |
| ADR-070 결정 6 | 구간당 접근 허가 1건·60초 단회 접근권·분당 60건 | ✅ | 관리자 화면의 연속 구간 묶음 표시는 불확실(§3 U-1) |
| ADR-070 결정 8 | 스위치 off면 새 시작·키·저장·업로드 거부 | ✅ | — |
| ADR-070 "영향" | `revoke_participant_reviews`·`queue_review_part` 교체 | ⚠️ 문서 차이 | 실제는 별도 trigger `members_revoke_recordings`와 `private.review_original_available` 교체로 **기능상 대체**됨(§4). SQL "consent withdrawal" 사례 통과 |
| 설계 §4.2 | 탭 하나만 녹음 — Web Locks로 판정, BroadcastChannel·IndexedDB lease는 판정에 쓰지 않음, 쓰기 전용 lease는 정리 대상 | ❌ | §3 G-1 |

---

## 1. Analysis Overview

### 1.1 Analysis Purpose
bkit 필수 규칙(2026-09-29) 적용 뒤 처음으로 phase 23 구현과 설계의 차이를 측정한다.

### 1.2 Analysis Scope
- 기준: §0 주의 참고
- 구현: 커밋 `113a703`(= `d52c002` 포함)의 phase 23 코드
- 실행 검증: 단위·route는 현재 작업 트리, 브라우저·SQL은 **HEAD의 격리 worktree**(다른 세션의 phase 33 미커밋 변경과 `docs/verification/` 기록 덮어쓰기를 피하려고)
- 제외: phase 33(`recording-ux`) 진행 중 변경, step4-B, 실제 기기, 운영 반영

---

## 2. Gap Analysis (Design vs Implementation)

### 2.1 API Endpoints

| Method | Path | 서버 | 클라이언트 | 상태 |
|--------|------|:----:|:----------:|:----:|
| GET, POST | `/api/d/[dept]/recordings` | ✅ | ✅ | ✅ |
| GET | `/api/d/[dept]/recordings/[id]` | ✅ | ✅ (완료 폴링) | ⚠️ 설계 §5.2 표에 없음 |
| GET | `/api/d/[dept]/recordings?recent=1` | ✅ | ✅ (이어서 녹음) | ⚠️ 설계 §5.2 표에 없음 |
| POST | `/api/d/[dept]/recordings/[id]/key` | ✅ | ✅ | ✅ |
| POST | `/api/d/[dept]/recordings/[id]/save` | ✅ | ✅ | ✅ |
| POST | `/api/d/[dept]/recordings/[id]/finalize` | ✅ | ✅ | ✅ |
| POST | `/api/d/[dept]/recordings/[id]/discard` | ✅ | ✅ | ✅ |
| GET | `/api/d/[dept]/reviews/[id]/original?segment=n` | ✅ | ✅ URL·메서드 일치 | ⚠️ 응답 처리 미확인 |
| GET, PATCH, POST | `/api/d/[dept]/reviews/[id]` | ✅ | ✅ | ✅ |
| GET, POST | `/api/admin/review-settings` | ✅ | ✅ | ✅ |

### 2.2 Data Model

| 대상 | Migration | 상태 |
|------|-----------|:----:|
| `review_recordings` (+ index 2, policy, trigger 2) | 0059 | ✅ |
| `review_original_segments` (+ policy, trigger) | 0060 | ✅ |
| `review_access_events.segment_index` | 0060 | ✅ |
| `review_recordings_one_successor`, `review_recording_metadata_stamp` | 0061 | ✅ (설계 §5.2 표에 없음) |
| 세션·구간 RPC: `start_review_recording` · `list_review_recordings` · `discard_review_recording` · `recording_key_context`(0052 교체) · `create_review_recording` · `finalize_review_recording` · `claim_review_segment` · `finish_review_segment` · `authorize_review_segment_access` · `sweep_review_recordings` · `admin_review_recording_count` | 0059·0060 | ✅ |
| `start_continued_review_recording` · `create_review_recording_with_profile` | 0061·0062 | ✅ (설계 §5.2 표에 없음) |
| 교체: `authorize_review_access` · `consume_review_access` · `claim_review_part` · `review_action` · `review_storage_allowed` · `private.review_original_available` | 0060 | ✅ |
| 교체 예정으로 적힌 `revoke_participant_reviews` · `queue_review_part` | — | ⚠️ 교체 안 됨, 기능상 대체 (§4) |

### 2.3 Component Structure

| 구성 | 파일 | 상태 |
|------|------|:----:|
| 녹음 화면 | `app/(auth)/d/[dept]/reviews/record/page.tsx`, `components/meeting-recorder.tsx` | ✅ |
| 구간 플레이어 | `components/recording-segment-player.tsx` | ✅ |
| 검토 화면 | `components/review-detail.tsx` | ✅ |
| 목록·진입 | `components/reviewed-materials.tsx` | ✅ |
| 관리자 | `components/admin/review-settings.tsx` | ✅ |
| 데모 | `app/demo/d/[dept]/reviews/page.tsx`, `components/demo-safe-actions.tsx`, `components/demo-meeting-recorder.tsx` | ✅ |
| 순수 로직 | `lib/recording/{capture-watchdog,checkpoint-crypto,health,levels,original-segments,pcm,recording-key,recording-routes,session}.ts` | ✅ |
| 브라우저 어댑터 | `lib/recording/browser/{capture.ts,capture.worklet.js,inputs.ts,storage.ts,storage.worker.ts}` | ✅ (storage.ts는 §3 G-1) |
| 워커 | `lib/pipeline/review-material.ts` (`verify_review_segment` · `process_review` · `purge_review_files` · sweep), `lib/worker.ts` | ✅ |
| 계약 | `lib/contracts.ts` (`ReviewRecordingStart` · `RecordingOriginalSegment` · `RecordingManifest` · `RecordingCaptureMetadata` · `RecordingSave` · `RecordingSegmentState` · `RecordingSaveResult` · `OriginalSegmentAccessGrant`) | ✅ |

### 2.4 Functional Depth — 불변식·CRITICAL 규칙

| 항목 | 판정 | 코드 근거 |
|------|:----:|-----------|
| 불변식 30 세션이 먼저 | ✅ | `meeting-recorder.tsx:378-391` 순서, 첫 IndexedDB 쓰기는 세션·키 뒤 사전 검사(`storage.ts:223-244`), 실패 시 트랙 정지·폐기(`:456-472`) |
| 불변식 31 키 | ✅ | 0059:115-130 거부 조건, `key/route.ts:45-56` 매번 HKDF 파생·비저장, 404/403 구분 |
| 불변식 32 INSERT 전용 | ✅ | 0060:336-348 `review_storage_allowed`, `upsert:false`(`meeting-recorder.tsx:532-534`), 불일치 삭제는 워커만(`review-material.ts:207-212`) |
| 불변식 33 검증 뒤 전사 1회 | ✅ | 0060:275-331 `finish_review_segment` 잠금·전 구간 verified 뒤 한 트랜잭션, SQL "completion happens once" 통과 |
| 불변식 34 구간 접근권 | ✅ | `original/route.ts:23-25` → 0060:380-405, 구간 번호 없는 요청 거부(0060:360-362), 서명 URL 없음 |
| 요청 경로 service role 금지 | ✅ | `app/api/d/**`에서 `lib/supabase/service` import 0건 |
| 게스트 데모 무쓰기·무LLM | ✅ | `demo-meeting-recorder.tsx`·`demo-safe-actions.tsx`에 fetch·Supabase·IndexedDB·LLM 0 |
| 탭 하나만 녹음 (설계 §4.2) | ❌ | §3 G-1 |

설계 §6 오류 처리 20행 중 17 충족, 3 부분, 5 미확인(권한 거절·컴퓨터 소리 트랙 없음·네트워크 단절 재시도·절전 복귀·무음 — 일부는 합성 브라우저 테스트가 다룸).

### 2.5 Page UI Checklist
덮어써진 design 문서의 §5.4 목록은 §2.3·§2.4의 녹음·검토·데모·관리자 행으로 대신 판정했다. 단계 표시·종료 확인 등 UX 항목은 `recording-ux` feature의 대조 대상이다.

### 2.6 API Contract Verification
route 9개 중 8개가 설계·서버·클라이언트 세 방향 일치. 구간 원본 route의 클라이언트 응답 처리 1개 미확인 → **Contract 8/9 = 89%**.

### 2.7 Runtime Verification Results

| 층 | 명령 | 결과 | 실행 위치 |
|----|------|------|-----------|
| L1 단위·route | `npx vitest run tests/recording tests/recording-key-route.test.ts tests/recording-session-routes.test.ts tests/review-original-route.test.ts tests/review-detail-route.test.ts tests/review-access.test.ts tests/pipeline/review-material.test.ts` | **20 파일 · 289 통과** | 현재 작업 트리 |
| L1 SQL | `node scripts/verify-security-sql.mjs <pglite>` | **277 통과 · 0 실패** (권한 조합 2,016, 녹음 구간 사례 11개 포함, `0004_worker_cron.sql` 제외) | HEAD worktree |
| L2 합성 브라우저 | `npx playwright test --config playwright.recording.config.ts` | **20 통과 · 1 skip** | HEAD worktree |
| L2 실험실 UI | `npx playwright test --config playwright.review-controls.config.ts` | **13 통과** | HEAD worktree |
| L3 제품·데모 E2E (v1.2) | `npx playwright test --config playwright.recording-product.config.ts` (`recording-product` · `demo-meeting-recorder` · `demo-reviewer`) | **8 통과 · 0 실패** — 로그인→녹음→저장→구간 검증→전사→확정→요약·분류, 데모 DB·Storage·jobs·llm_calls 증가 0 | `659f131` worktree + 로컬 `review-qa` Supabase ([기록](../verification/browser-meeting-recording/l3-20260929/README.md)) |

**Runtime Score (실행한 것 기준)**: v1.0 599/599 → v1.2 607/607 = 100% (skip 1 제외)

---

## 3. 차이 목록

### Important (신뢰도 ≥ 80%)

| ID | 항목 | 설계 근거 | 코드 근거 | 신뢰도 |
|----|------|-----------|-----------|:------:|
| G-1 | 한 탭 녹음 판정에 IndexedDB lease heartbeat와 BroadcastChannel이 남아 있다. heartbeat 쓰기가 실패하면 `lose()`가 녹음을 중단(`capture_lease_lost`)시키므로, 설계가 "판정에 쓰지 않는다"고 한 lease가 실제로 중단 경로에 있다 | 웹회의_녹음_설계 §4.2 (127행) | `lib/recording/browser/storage.ts:276-306`, `capture.ts:17·67` | 85% (메인 세션 재확인) |

Critical: 0건.

**G-1 처리 (2026-09-29, v1.1)**: 후속 명세 [step0-capture-lock-20260929.md](../../phases/23-browser-meeting-recording/step0-capture-lock-20260929.md)를 Codex `gpt-5.6-terra`가 구현하고 메인 세션이 AC 재실행·최종 리뷰를 했다. 커밋 `659f131`, 브랜치 `fix/capture-lock-20260929`(HEAD `113a703`에서 분기, 2026-09-29 작업 브랜치에 fast-forward 병합). lint blocking 0 · build 성공 · vitest 148 파일 1,624 통과 · `e2e:recording` 21 통과 1 skip(새 사례: 6초 메인 스레드 정지에도 잠금 유지·두 번 release·옛 lease DB 삭제) · `BroadcastChannel|capture_lease_lost|leaseDb|heartbeat` 0건 · Graft 전후 호출 관계 유지. 기록: `docs/verification/browser-meeting-recording/capture-lock-20260929.md`(브랜치에 있음).

### 불확실 (신뢰도 < 80%, 판정 보류)

| ID | 항목 | 근거 | 신뢰도 |
|----|------|------|:------:|
| U-1 | 관리자 접근 기록 화면에 `segment_index`가 없고 연속 구간 묶음 표시가 없다 | 설계 §13.3 SEC-07 ↔ 0037:85-95 | 75% |
| U-2 | `reextract`는 창만 재예약하고 `kickWorker()`를 부르지 않아 매분 트리거를 기다린다 | `reviews/[id]/route.ts:179` | 70% |
| U-3 | 키 404 중 "완료면 검토 화면으로 이동"이 `recover()`가 아니라 폴링에서만 처리된다 | 설계 §6 ↔ `meeting-recorder.tsx:586-591` | 60% |
| U-4 | 클라이언트 `Session.state` 타입에 `revoked`가 없다 | `meeting-recorder.tsx` 타입 | 60% |

---

## 4. "확인 필요" 판정 — 동의 철회 경로

**판정: 기능상 대체돼 문제없음.** 문서가 구현보다 낡았다.

1. 세션 차단: `members_revoke_recordings` trigger(0059:184-185, 0060:510-523)가 active·saving 세션을 `revoked`(`consent_withdrawal`)로 바꾸고 대기 중인 `verify_review_segment`를 실패 처리한다.
2. 자료 파기: 기존 `members_revoke_reviews`(0034:259-279)가 `audio_segments` 자료도 `original_participants`로 걸어 삭제·`purge_review_files` 예약을 한다.
3. 순서: 같은 이벤트의 row trigger는 이름순 → `members_revoke_recordings`가 먼저, 잠금 순서(세션 → 자료)와 맞다.
4. 원본 파기: `purgeReviewFiles`(`review-material.ts:264-313`)가 모든 attempt·접두사를 끝까지 지우고 재조회로 확인한다.
5. 늦은 쓰기·재생·전사 차단: `review_storage_allowed`, `review_original_retained`, `claim_/finish_review_segment`의 세션 상태 검사.
6. 실행 근거: SQL 하니스 "consent withdrawal revokes, deletes the material and fails queued verification" 통과.

정적 분석은 `tests/rls`에서 철회 테스트를 찾지 못했지만, 실제로는 `scripts/verify-recording-segments-sql.mjs`에 있다.

---

## 5. 설계·상위 문서 차이 (코드 결함 아님)

| # | 문서 | 낡은 서술 | 실제 |
|---|------|-----------|------|
| D-1 | ADR-070 "영향", 웹회의_녹음_설계 §9 | `revoke_participant_reviews`·`queue_review_part` 교체 | §4대로 대체 |
| D-2 | 웹회의_녹음_설계 §5.3 (212행) | 철회 trigger가 `members_revoke_reviews` | 세션은 별도 `members_revoke_recordings` |
| D-3 | 웹회의_녹음_설계 §5.2 표 | `GET /recordings/[id]`·`?recent=1`·0061·0062 함수 없음 | 구현돼 있음 |
| D-4 | ARCHITECTURE §6-5 제목, PRD §11 "웹 회의 녹음" 행, CLAUDE.md·AGENTS.md 기술 스택 줄 | "녹음 화면(UI) 미구현" | 녹음 화면 구현됨(d52c002) |
| D-5 | `phases/23-browser-meeting-recording/index.json` | 모든 step `pending`, phase `blocked` | 실행 기록은 step별 부분 완료 |
| D-6 | `docs/02-design/features/browser-meeting-recording.design.md` | 분석 도중 step4-B 범위 29줄로 교체되어 대조 목록이 없음 | **해결(2026-09-29)**: step4-B 절은 두고 "구현 대조 목록" 절을 병합 |

---

## 6. Match Rate

| 축 | 점수 | 계산 |
|----|:----:|------|
| Structural | 97% | 29개 중 28 (문서 차이 D-1 두 항목은 기능상 대체로 통과, lease 정리 미완 1 실패). 엄격히 세면 26/29 = 90% |
| Functional | 93% | 확인한 20개 중 ✅17 + ⚠️3×0.5, 미확인 5는 분모 제외 |
| Contract | 89% | 8/9 (미확인 1을 실패로 셈) |
| Runtime | 100% | 실행한 599건 전부 통과, L3 미실행 |

**Overall = 97×0.15 + 93×0.25 + 89×0.25 + 100×0.35 = 95.1% → 95%** (Structural을 엄격히 90%로 세면 94.0%)

기준 90% 이상. 단, L3 제품 E2E·데모 E2E·실제 기기(V01~V06)는 실행하지 않았으므로 이 수치는 **완료 판정이 아니다**. 완료 판정은 PRD §11 실행 기록과 사람 게이트를 따른다.

**v1.1 (G-1 반영, `659f131` 기준)**: Structural 29/29 = 100% → Overall = 100×0.15 + 93×0.25 + 89×0.25 + 100×0.35 = **95.5% → 96%**. 2026-09-29 작업 브랜치에 병합됐다.

---

## 7. 다음 단계

1. G-1: 구현·검증 완료(`659f131`, 브랜치 `fix/capture-lock-20260929`). 병합 완료. 남은 일: phase 23 `index.json`에 step 기록(다른 세션의 미커밋 변경 뒤)
2. D-1~D-5 문서 정정: 사용자 결정 "다른 세션 작업 뒤" — PRD → ARCHITECTURE → ADR 순서
3. ~~D-6 design 문서 병합~~ 완료
4. ~~L3~~ 완료(v1.2, 8 통과)
5. ~~G-1 반영 뒤 `/pdca analyze` 재실행 → `/pdca report`~~ 보고서 작성(부분 완료, [report](../04-report/features/browser-meeting-recording.report.md))
6. ~~V12 회귀 E2E~~ 완료(v1.4). 후속: `ask-permission.spec.ts`를 검토함 → 확정 흐름으로 재작성, `upload-boundaries.spec.ts`의 파일럿 시드 이름 고정 제거

---

## Version History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 1.0 | 2026-09-29 | 최초 분석 | wadelee1005@gmail.com |
| 1.1 | 2026-09-29 | G-1 해결(`659f131`, 미병합) 반영, 일치율 96% | wadelee1005@gmail.com |
| 1.2 | 2026-09-29 | `659f131` 작업 브랜치 병합, L3 제품·데모 E2E 8 통과, V11 충족 | wadelee1005@gmail.com |
| 1.4 | 2026-09-30 | V12 회귀 E2E(현재 작업 트리 스냅샷) 반영 → 판정 가능 묶음 7/7. 1.3은 §8 step4-B6~B8 추가 대조 | wadelee1005@gmail.com |

---

## 8. 2026-09-29 추가 대조 — step 4-B6~B8 (`/pdca analyze browser-meeting-recording`)

앞의 95~96% 점수는 당시 step0~3 코드만 대상으로 계산했다. 이번 대조는 [현재 design의 B6~B8 목록](../02-design/features/browser-meeting-recording.design.md)을 PRD ACC-02·03·V20과 함께 확인한 **추가 범위**다. 이전 점수를 전체 Phase 23 완료율로 재사용하지 않는다.

| 범위 | 설계 대조 | 확인 수 | 상태·근거 |
|---|---|---:|---|
| B6 요약 병합 | chunk별 원문 검증, 병합 1회, 최종 검증, 지시문 방어, 같은 chunk 여러 결정, 단위 | 6/6 | `lib/pipeline/document-summary.ts`, `tests/pipeline/document-summary.test.ts`; 실제 모델의 V16 의미 판정은 별도 |
| B7 용어집 | DB/RLS, 편집 RPC, 세션 route, 화면, Whisper, 요약, SQL·route·단위 | 7/7 | 0064 로컬 적용·격리 SQL 280건·route/순수/워커 테스트 통과. 사람 이름 자동 식별은 하지 않음 |
| B8 측정 | CER/용어 CER/낮은 신뢰/precision·recall 계산, 입력 최소 조건, 파일 해시·보고서, 실기기 수치 | 3/4 | 계산·입력·해시 도구와 단위 테스트 통과. V20 실제 녹음·라벨 수치 0건 |

**추가 범위 일치율: 16/17 = 94.1%.** 이는 구현 구조와 로컬 계산·테스트의 일치율이다. 전체 완료 조건인 V01~V06 실기기, V13 제공사, V14 운영 CSP, V16 실제 모델 문서, V20 정량 수치, 운영 반영은 충족하지 않았다. 그래서 Phase 23 상태는 `pending`이고 `/pdca report`의 **완료** 상태로 전이하지 않는다.

최종 로컬 실행: `npm run build` 성공, `npm run test` 159파일·1,704건 통과, 변경 파일 ESLint 성공·문구 blocking 0(기존 경고 79), 격리 SQL 280건, `npm run e2e:recording` 21 통과·기존 장기 1 skip, `npm run e2e:review-controls` 29 통과. 격리 QA Supabase에서 현재 코드의 제품·데모 E2E 9/9 통과([실행 기록](../verification/browser-meeting-recording/product-e2e-20260929.md)). 검토 실험실을 녹음 실험실과 동시에 실행한 첫 시도에서 모듈 로딩 전 타임아웃이 나 단독으로 재실행했고 29/29 통과했다. 전체 `npm run lint`의 마지막 재실행은 파일 스캔이 수분간 정체돼 중단했으므로 이번 시점의 전체 lint 완료 기록으로 적지 않는다. 이에 앞선 코드 단계의 전체 lint는 통과했고, 최종 변경 파일 ESLint와 문구 검사는 통과했다. Graft·Archify 현재 도구 결과가 없어 B6·B7 기록에 수동 의존 흐름만 적었다.
