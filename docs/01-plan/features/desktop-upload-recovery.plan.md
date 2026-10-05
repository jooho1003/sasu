# desktop-upload-recovery — Plan

2026-10-04 · bkit PDCA · 기존 DC-09 구현 복구. 사용자 연속 실행 지시 범위.

## Executive Summary

| 관점 | 내용 |
|---|---|
| Problem | 업로드 접수 전 링크와 늦은 콜백, 중복 클릭으로 자료 업로드 화면이 잘못된 결과를 표시할 수 있다. |
| Solution | 기존 DC-09·ARCHITECTURE §6-12의 좁은 IPC·현재 화면·성공 뒤 읽음 경계를 WorkReviewUpload에 적용한다. |
| Function/UX Effect | 업로드 중 입력 동결, 오류 때 초안 보존, 접수 성공 뒤 웹 인계, 참여자 조회 수동 재시도를 제공한다. |
| Core Value | 승인한 자료를 한 번 제출하고 현재 화면에서 결과를 확인한다. |

## Context Anchor

| Key | Value |
|---|---|
| WHY | DC-09 업로드·웹 인계 생명주기 복구 |
| WHO | 동의한 비데모 부서 lead |
| RISK | 중복 업로드·이탈 뒤 후속 행동·접수 전 링크 |
| SUCCESS | SC1~5 실행 및 U1~7/S1~2 대조 |
| SCOPE | PRD §3-8 DC-09·§8 / ARCHITECTURE §6-12 / 기존 desktop-companion 설계 |

## 1. Overview

상위 원천: [PRD](../../PRD.md) §3-8 DC-09·§8, [ARCHITECTURE](../../ARCHITECTURE.md) §6-12, [ADR-087](../../ADR.md), [기존 설계](../../02-design/features/desktop-companion.design.md). 새 API·SDK·DB·자동 작업 기능 없이 기존 문서·음성 검토 업로드의 구현 결함을 복구한다.

## 2. Scope

WorkReviewUpload 하나와 별도 Electron 합성 HTTPS 회귀를 수정한다. 파일·동의·참여자·가시성·크기/시간 한도와 기존 main 업로드 어댑터를 유지한다. App workKey와 세션 재마운트를 재사용한다. 서버 재시도·부분 업로드 회복·영구 캐시·자동 재전송은 추가하지 않는다.

## 3. Requirements

| ID | 기존 요구 매핑 / 비교 목록 | 우선순위 |
|---|---|---|
| FR1 | DC-09: 접수 성공 전 웹 링크 없음, 한 번의 사용자 시작에 한 IPC 업로드 | 높음 |
| FR2 | DC-09: 준비·업로드 중 파일/메타데이터 동결, 실패 초안 보존·수동 재시도 | 높음 |
| FR3 | §6-12: 각 await 뒤 현재 화면 검사, 이탈 뒤 후속 IPC/notice/읽음/웹 열기 없음 | 높음 |
| FR4 | 기존 웹 인계: openWeb 성공 뒤 onSeen(id,current), 오류 안내·연타 잠금 | 높음 |
| FR5 | DC-09 음성 동의: 참여자 loading/empty/error·수동 재조회, 늦은 다른 종류 응답 폐기 | 높음 |

한국어 native label/button 유지. 원문/토큰 새 로그 없음. 개발 StrictMode 참여자 읽기 완료·잠금 해제 보존.

## 4. Success Criteria

SC1: 지연 업로드 연타 1회·접수 전 링크 0·입력 동결·성공 뒤 링크와 정상 웹/읽음.
SC2: 업로드 실패 링크 0·입력/동의 보존·자동 재전송 0·수동 재시도 성공.
SC3: 파일 읽기/해시/업로드/참여자 조회 지연 중 탭·동일 탭·로그아웃 이후 새 행동/notice 없음.
SC4: 웹 실패 읽음 0·오류 안내·재시도; 지연 웹/읽음 중 이탈 후 후속 결과 없음.
SC5: 참여자 loading/empty/error/retry·종류 전환 폐기·StrictMode, lint/build/unit·기존 Electron 회귀·독립 분석 기록.

## 5. Risks and Mitigation

| 위험 | 완화 |
|---|---|
| React state 반영 전 연타 | ref 잠금으로 최초 시작부터 보호 |
| StrictMode effect 재실행 | 동일 종류 진행 중 읽기를 현재 인스턴스가 이어받음 |
| 이미 시작한 서버/OS 행동 | 취소를 주장하지 않고 종료 화면 후속 행동만 중단 |
| 합성 Storage/권한의 한계 | 실제 main/preload 계약 검증과 실제 서버/RLS 의미 검증을 구분 |

## 6. Impact Analysis

WorkTab→WorkReviewUpload→preload upload.review/members.list→main IPC→storage-upload/기존 companion E12~13·E17. 웹 열기→main 출처 제한→App rememberSeen. 소비자는 WorkTab 하나다. 문서/음성 성공·실패·권한·탭/세션·기존 sales/recent/card 회귀를 대조한다. Graft 자동 그래프 누락은 실제 실행 오류와 수동 관계 범위를 기록한다.

## 7. Architecture Considerations

기존 React state/ref/cleanup·native form·기존 preload/main을 유지한다. 새 controller hook/저장소/서버 업로드 outbox는 필요 없다. 상위 기능 결정 변경 없음.

## 8. Convention Prerequisites

AGENTS·AI-DEVELOPMENT·desktop-companion 설계를 따른다. components는 lib TDD 예외이지만 Electron red를 먼저 실행한다. 신규 환경변수/의존성 없음. 동시에 desktop build/Electron을 실행하지 않는다.

## 9. Next Steps

design→phase48 step0(red/구현)→step1(검증/분석/report). 운영 반영은 root가 전체 검증 및 기존 승인 범위와 함께 처리한다.
