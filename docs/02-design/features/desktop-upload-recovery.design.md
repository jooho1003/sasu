# desktop-upload-recovery — Design

2026-10-04 · bkit PDCA · [Plan](../../01-plan/features/desktop-upload-recovery.plan.md)
원천 PRD §3-8 DC-09·§8 → ARCHITECTURE §6-12 → ADR-087·기존 desktop-companion 설계.

## Context Anchor

| Key | Value |
|---|---|
| WHY | DC-09 업로드·웹 인계 생명주기 복구 |
| WHO | 동의한 비데모 부서 lead |
| RISK | 중복 업로드·이탈 뒤 후속 행동·접수 전 링크 |
| SUCCESS | SC1~5 실행 및 U1~7/S1~2 대조 |
| SCOPE | PRD §3-8 DC-09·§8 / ARCHITECTURE §6-12 / 기존 desktop-companion 설계 |

## 1. Overview

기존 업로드 renderer의 현재 화면·단일 행동·성공 웹 인계 경계를 보완한다. 새로운 범위/서버 결정 없음. 아래 U1~7/S1~2는 analyze 비교 목록이다.

## 2. Architecture Options

| 안 | 영향 | 선택 |
|---|---|---|
| A 기존 state/ref/cleanup | 제품 1파일, 기존 계약 재사용 | 선택: 제한된 복구 범위 |
| B 범용 controller hook | 새 추상화·consumer 전환 | 보류 |
| C 서버 outbox/회복 API | DB·업로드 멱등 정책 영향 | 범위 밖 |

WorkTab→WorkReviewUpload→파일 읽기→음성 decode/분할(음성만)→SHA256→upload.review→접수 성공 ID→openWeb→onSeen(current). 각 비동기 경계 current 검사. effect cleanup은 이탈/세션/동일 work 탭의 요청 세대를 폐기한다. members 조회는 종류 세대와 active를 검사하며 StrictMode replay에서는 동일 종류 pending 읽기를 이어받는다. 실제 종류 전환/이탈의 이전 결과는 폐기한다.

## 3. Data Model

기존 file/title/kind/visibility/synthetic/participants/consent, members, progress, reviewId 유지. upload/open ref 잠금, 화면 세대/active, 참여자 조회 상태/세대/잠금만 메모리에 추가한다. 접수 전 임시 UUID는 로컬 변수로만 두며 reviewId는 성공 응답 후에만 기록한다. SQL·영구 캐시 없음.

## 4. API Specification

기존 members.list(E17), upload.review(E12 생성·비공개 Storage·E13 구간 큐를 조율), app.openWeb, onSeen(id,stillCurrent?)만 사용한다. IPC/main/storage-upload·ReviewCreate 한도·서버 권한 무변경. 문서 .txt/.md/.csv/.json/.pdf/.docx 20MB, 음성 50MB/30분, 원본 승인·참여자 검증을 유지한다. 새 자동 retry 없음; 기존 main의 transient retry 정책은 그대로다.

## 5. UI/UX Checklist

U1: ‘올린 자료 확인’과 기존 문서/음성·파일·제목·가시성·동의·참여자 controls 유지. preparing/uploading 동안 모두 동결하고 drop/handler도 ref 검사. 연타 1 IPC.
U2: 업로드 접수 전 ‘웹에서 이어서 하기’ 없음. 성공 뒤 응답 ID로 표시. 실패 때 링크 없음·초안/동의 보존·자동 재전송 없음·수동 retry.
U3: 각 file.arrayBuffer/decode/hash/upload/context.close await 후 current 검사. 탭/동일 work 클릭/로그아웃 뒤 이전 notice·상태·후속 IPC 없음. AudioContext는 finally 정리하며 정리 오류가 잠금을 막지 않음.
U4: 웹 링크 ref 잠금·진행 안내, openWeb 성공→onSeen(id,current). 실패 안내·읽음 없음·retry. 열기/읽음 각 await 후 current 검사; unhandled rejection 없음.
U5: 음성 참여자 loading/empty/error·‘참여자 다시 불러오기’, 조회 연타 1flight. 오류 시 이전 members/participants 숨김·초안 유지. 참여자는 서버가 현재 동의/멤버십을 재검사한다.
U6: document↔audio 전환·이탈 뒤 늦은 members 결과/notice 폐기. 실제 개발 StrictMode에서도 단일 읽기·loading/잠금 정상 완료.
U7: 식별자 없는 전역 upload.onReviewProgress 이벤트는 소비하지 않는다. 화면이 시작한 준비/업로드/접수 성공 상태만 표시하므로 이전 main 업로드가 새 화면을 바꾸지 않는다. 기존 구간별 Storage 진행 표시 대신 로컬 단계 안내를 사용한다. 성공 접수 후 같은 초안의 제출은 비활성이고 명시적인 파일/종류/메타데이터 변경 때 링크를 초기화해 새 제출을 허용한다.

## 6. Error Handling

message(cause) 한국어 오류를 현재 화면에만 표시한다. 참여자 오류는 해당 영역 alert·수동 조회. 업로드 실패는 입력 보존이며 서버 부분 저장/원본은 기존 웹 검토함에서 관리한다. 해시/decode 실패도 링크 0·잠금 해제. 이미 시작한 서버/OS 행동 자체는 취소할 수 없다.

## 7. Security Checklist

S1: 기존 기기 Bearer·lead/동의/비데모·서버 RLS·현재 참여자·비공개 Storage·출처 제한 무변경. UI 검사로 서버 권한을 대체하지 않는다.
S2: 원문/질문/토큰 새 로그·영구 저장·SDK·LLM·DB 없음. 초기 UUID는 서버 접수 전 결과 링크로 노출하지 않는다.

## 8. Test Plan

별도 upload-recovery.spec.ts 합성 HTTPS Auth/companion/Storage와 실제 Electron main/preload/renderer를 사용한다. fixture는 최초 upload 지연/503, members 지연/empty/503, shell 실패/지연, markSeen 지연, 파일 read/hash 지연을 제어한다. 원문은 합성 문서만이다.

red: 접수 전 링크/연타·실패 초안·열기 실패 읽음·늦은 업로드·members loading/retry·늦은 파일 hash를 현재 구현에서 재현한다.
green: SC1~5 전체, 추가 음성 합성 WAV와 현재 participant 선택 검증, 이탈/동일 탭/로그아웃, 실제 개발 React/StrictMode members.
검증: desktop lint/build/unit, 기존 followup/전체 회귀는 root와 슬롯 조율해 실행한다. root build/unit/SQL은 서버 무변경 범위로 최신 별도 검증 결과를 연결한다. Graft 전후 및 Archify altered flow 실제 실행 기록. 합성 fixture가 실제 Storage/RLS 권한·음성 의미 정확도를 증명하지 않는다.

## 9. Clean Architecture

제품 변경 WorkReviewUpload.tsx 하나. App/WorkTab/main/preload/server/contracts 무변경. 별도 E2E fixture는 기존 followup을 수정하지 않는다. 신규 lib/TDD 대상 없음.

## 10. Coding Convention Reference

한국어 native controls·명시 aria-label·shared/messages 직접 import·ref 잠금·각 await current 검사. 기존 media helper 재사용·기능과 무관한 스타일 변경 없음. temporary profile/TLS는 경로 검증 후 native 파일 API로 정리한다.

## 11. Implementation Guide and Session Guide

| module | step | 담당/산출물 |
|---|---|---|
| upload/web/members | 0 | 별도 red 실행→renderer 보완→green 및 summary |
| verification | 1 | 전체 회귀·StrictMode·도구·독립 U1~7/S1~2와 SC1~5 analyze/report |

먼저 design 전체를 읽고 phase step을 작성한다. 결과는 docs/verification/48-desktop-upload-recovery/. root가 공유 phase index와 원천 문서의 구현 현황을 관리한다. 독립 분석 90% 미만이면 iterate 후 재실행. 운영 미반영은 보고에 명시한다.
