---
template: plan
version: 1.3
feature: review-upload-timeout
project: sasu
date: 2026-09-30
---

# review-upload-timeout Planning Document

> **Summary**: 방치된 기존 파일 업로드를 실패 상태로 정리한다.
>
> **Status**: 로컬 구현·검증 완료, 운영 반영 대기 · **원천**: [PRD IN-04·§8](../../PRD.md), [ADR-073](../../ADR.md)
>
> 이 문서는 PDCA 어댑터다. 범위·완료 조건의 원천은 PRD IN-04·§8이고 새 결정은 이 문서에 두지 않는다.

## Executive Summary

| Perspective | Content |
|---|---|
| Problem | 브라우저가 원본 업로드 전에 닫히면 자료가 `uploading`으로 영원히 남는다. |
| Solution | 워커가 24시간 지난 `single_file` 업로드만 SQL로 실패 전환한다. |
| Function/UX Effect | 목록의 무한 진행 표시가 끝나고, 검토 화면에 다음 행동이 보인다. |
| Core Value | 실패한 자료를 확인하고 안전하게 다시 시작할 수 있다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | `uploading` 방치로 자료 검토가 끝나지 않는다. |
| WHO | 음성·문서를 파일로 올리는 동의한 부서장 |
| RISK | 새 sweep이 웹 녹음이나 정상적인 긴 업로드를 건드릴 수 있다. |
| SUCCESS | 24시간 이전·녹음·처리/확정 자료 불변, 24시간 이후 파일 업로드만 한 번 실패 전환, 사용자 안내 |
| SCOPE | SQL sweep → 워커 호출 → 실패 이유 UI → 로컬 검증 |

## 1. Overview

PRD 1.17a가 녹음 세션 밖 후속 과제로 둔 파일 업로드 상태 정리를 수행한다. 기존 `failed` 상태와 구간 재시도·삭제 동작을 재사용한다.

## 2. Scope

- 포함: `single_file` 24시간 무진행 판정, 최대 100건/호출, service role 워커 호출, 안내, 격리 SQL 검증.
- 제외: 원본 자동 파기, 브라우저 업로드 재개 프로토콜, `audio_segments` 상태/만료 변경, 운영 배포.

## 3. Requirements

| ID | Requirement | Priority | Status |
|---|---|---|---|
| FR-01 | 방치 업로드만 `failed(upload_timeout)`으로 전환 | High | 예정 |
| FR-02 | 반복 호출·동시 호출은 안전하고 처리 수 제한 | High | 예정 |
| FR-03 | 사용자에게 재시도·삭제 선택을 안내 | Medium | 예정 |

권한: sweep RPC는 `service_role`만 실행한다. 가시성은 기존 `can_see()`·RLS를 유지한다. 성능: 잠긴 행을 기다리지 않고 호출당 100건으로 제한한다.

## 4. Success Criteria

- [x] 격리 SQL에서 시각 경계·레이아웃·상태·멱등·권한을 실제 실행
- [x] 워커가 기존 분 단위 sweep에서 호출
- [x] 검토 화면에서 `upload_timeout`의 한국어 안내 확인
- [x] 단위·전체 lint·빌드 통과, 운영 미반영 기록

## 5. Risks and Mitigation

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| 긴 정상 업로드 오판 | Medium | Low | 2분 대신 24시간, 최신 `updated_at` 기준 |
| 녹음 세션 오염 | High | Medium | `single_file` SQL 조건과 반대 사례 테스트 |
| 원본 유실 | High | Low | 상태만 전환, Storage·구간·리비전 미변경 |

## 6. Impact Analysis

| Resource | Current consumers | Change |
|---|---|---|
| `reviewed_materials` | 목록·상세·구간 RPC·녹음 세션 | 기존 `status`, `status_reason`만 갱신 |
| `sweepReviewParts` | `lib/worker.ts` 매분 호출 | 새 내부 RPC 호출 추가 |
| `ReviewDetail` | 동의한 부서장 검토 화면 | 실패 이유 안내 |

## 7. Verification and Rollout

PGlite 격리 SQL → 로컬 migration → Vitest/빌드/브라우저 안내 검증 순서다. 운영 DB·배포는 별도 승인 뒤에 둔다.
