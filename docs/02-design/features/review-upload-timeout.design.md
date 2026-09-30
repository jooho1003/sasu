---
template: design
version: 1.3
feature: review-upload-timeout
project: sasu
date: 2026-09-30
---

# review-upload-timeout Design Document

> **원천**: [PRD IN-04·§8](../../PRD.md) → [ARCHITECTURE 자료 검토](../../ARCHITECTURE.md) → [ADR-073](../../ADR.md). [Plan](../../01-plan/features/review-upload-timeout.plan.md)은 매핑용이다.

## Context Anchor

| Key | Value |
|---|---|
| WHY | `uploading` 방치로 자료 검토가 끝나지 않는다. |
| WHO | 음성·문서를 파일로 올리는 동의한 부서장 |
| RISK | 새 sweep이 웹 녹음이나 정상적인 긴 업로드를 건드릴 수 있다. |
| SUCCESS | 24시간 이전·녹음·처리/확정 자료 불변, 24시간 이후 파일 업로드만 한 번 실패 전환, 사용자 안내 |
| SCOPE | SQL sweep → 워커 호출 → 실패 이유 UI → 로컬 검증 |

## 1. Overview

기존 `failed` 상태를 사용하며, 가시성·원본 접근·복구 권한은 변경하지 않는다.

## 2. Architecture Options

| Option | Approach | Trade-off |
|---|---|---|
| A | `sweep_review_parts` 본문에 조건 추가 | 호출은 적지만 녹음 전사 대기 처리와 결합 |
| B | 별도 스케줄·큐·새 상태 | 분리는 크지만 범위와 운영 부담 증가 |
| C (선택) | 별도 SQL RPC를 기존 `sweepReviewParts`에서 호출 | 판정 경계가 분리되고 기존 주기를 사용 |

호출 흐름: 분당 `/api/jobs/run` → `lib/worker.ts` → `sweepReviewParts` → `sweep_abandoned_review_uploads()` → `reviewed_materials` → 세션/RLS GET → `ReviewDetail` 안내. Graft·Archify 도구가 현재 세션에 없으므로 이 수동 흐름을 구현 전 관계 목록으로 사용하며 도구 실행으로 주장하지 않는다.

## 3. Data Model

새 열·테이블이 없다. 기존 `reviewed_materials.status='failed'`, `status_reason='upload_timeout'`, `updated_at=clock_timestamp()`만 갱신한다. 다른 자료 행·`review_parts`·Storage 객체는 변경하지 않는다.

## 4. SQL Contract

`sweep_abandoned_review_uploads() returns integer`는 `security definer`, 고정 `search_path`, `service_role` 실행 전용이다. `deleted_at`·`original_deleted_at`이 null이고 `original_layout='single_file'`, `status='uploading'`, `updated_at<=clock_timestamp()-interval '24 hours'`인 행을 ID 순서로 최대 100개 `for update skip locked` 선택한다. 상태 조건을 갱신문에서도 확인해 경쟁 변경을 막는다. 한 번 더 호출하면 0건이다.

## 5. UI Contract

`status_reason='upload_timeout'`이면서 `failed`인 자료에만 한국어 안내를 표시한다. 저장된 구간 파일이 있다면 기존 `처리 재시도`를 이용하고, 원본이 없으면 자료 삭제 후 새 파일로 등록하라고 안내한다. 원본 존재를 추정해 성공을 약속하지 않는다.

## 6. Security and Failure

사용자 요청에는 service role을 쓰지 않는다. RPC의 `PUBLIC`·`anon`·`authenticated` 실행을 회수하고 `service_role`만 허용한다. 실패한 RPC는 워커가 에러 코드만 로깅하고 다음 주기에 재시도한다. 삭제·동의 철회·보존 만료는 기존 SQL이 우선한다.

## 7. Design Comparison / Test Matrix

| Case | Expected |
|---|---|
| 24시간 직전 / 정확히 경계 이후 | 전자는 유지 / 후자는 실패 |
| audio_segments, processing, ready, deleted, original_deleted | 유지 |
| 오래된 single_file uploading 101건 | 첫 호출 100, 다음 1 |
| 재호출, 동시 잠금 | 중복 없음, 잠긴 행 대기 없음 |
| authenticated 직접 RPC | 거절 |
| 제품 상세 화면 | 이유·다음 행동 표시 |

## 11. Implementation Guide

### 11.1 Module Map

1. `0065_review_upload_timeout.sql`와 격리 SQL 수용 검사.
2. `lib/pipeline/review-material.ts`의 기존 sweep 배선과 워커 호출 회귀.
3. `components/review-detail.tsx` 안내와 브라우저 검사.

### 11.3 Session Guide

단일 step으로 SQL → 배선 → 화면 → 검증 순서로 실행한다. `phases/34-review-upload-timeout/step0.md`가 이 설계를 참조한다.
