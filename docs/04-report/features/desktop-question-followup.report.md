---
template: report
version: 1.0
feature: desktop-question-followup
date: 2026-10-03
---

# desktop-question-followup Completion Report

> **Status**: 개발 완료 · 운영 미반영
> **Project**: 사수 (SASU) · **Author**: Codex · **PDCA Cycle**: phase 44
> **Completion Date**: 2026-10-03 · **Branch**: `feat/desktop-question-followup`
> **Version**: 데스크톱 0.1.1 기준 개발; 설치·공개 배포 버전 변경 없음
> 개발 브랜치 검증 결과이며 운영 배포 완료를 뜻하지 않는다.

원천: [PRD DC-13·§8](../../PRD.md) → [ARCHITECTURE §6-12](../../ARCHITECTURE.md) → [ADR-083](../../ADR.md). 최종 비교·실행 근거는 [Analysis](../../03-analysis/desktop-question-followup.analysis.md)와 [검증 기록](../../verification/44-desktop-question-followup/verification.md)을 따른다.

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | 데스크톱 질문 이력 자동 조회·답 재열람·명시적 이어 묻기 |
| Start / End Date | 2026-10-02 / 2026-10-03 |
| Duration | 정확한 작업 시간은 별도 산정하지 않음 |
| Scope | renderer 3개 연결·상태 보완, 기존 API·IPC·암호화 대기열 재사용 |

### 1.2 Results Summary

Plan **SC1~SC6 개발 범위 6/6 충족**, 독립 정적 **U1~U6/S1~S4 10/10 일치**. 최종 합성 Electron **12/12 통과(신규 5·기존 7, 26.6초)**, desktop 단위 **78/78**, root 단위 **1,834/1,834**, lint·build와 격리 SQL **316개/권한 조합 2,016개** 통과. 정적 목록 일치는 모든 오류 조합이나 운영 환경의 검증을 뜻하지 않는다.

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 앱에서 이전 질문의 답을 다시 열어도 후속 질문을 명시적으로 연결할 수 없었고, 수동 조회·오류·늦은 응답의 화면 처리가 부족했다. |
| **Solution** | 진입 때 본인 이력을 새로 조회하고 현재 답을 재검사한다. 원 질문을 표시하는 ‘이어 묻기’를 기존 `parent_id` IPC·SQL·암호화 대기열에 연결했다. |
| **Function/UX Effect** | 한국어 상태·빈 상태·재시도·더 보기, 초안 유지 새 질문 전환, 즉시 중복 잠금과 실패 보존을 구현했다. 신규 합성 Electron 5개와 기존 7개가 통과했다. |
| **Core Value** | 기존 소유자·부서·인용 권한·질문 한도를 유지한다. 권한 거부를 독립 질문으로 자동 재전송하지 않고, 오프라인 질문의 부모를 암호화 보관·재전송한다. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status / Evidence |
|---|---|---|
| SC1 | 이력 진입·페이지·오류·빈 상태 | 충족: 자동 조회·503 재시도·빈 상태·2페이지 중복 제거 |
| SC2 | 현재 답 재열람·실제 IPC 부모 전달 | 충족: refused 및 done+인용 답 후속 전송 |
| SC3 | null 부모·실패 보존·중복 방지 | 충족: 403 초안/부모 유지·더블클릭 1건·새 질문 null 부모·pending 실패 안내 |
| SC4 | 탭 이탈·로그아웃 늦은 응답 폐기 | 충족: 지연 목록/상세 탭 이탈, 기존 로그아웃/401 재로그인 회귀·정적 cleanup |
| SC5 | 오프라인 부모 보존·403 미보관 | 충족: 암호화 평문 부재·재연결 동일 부모 실제 IPC, outbox 단위 |
| SC6 | 검증·독립 분석·실행 기록 | 충족: §5 로그, [검증](../../verification/44-desktop-question-followup/verification.md)·[분석](../../03-analysis/desktop-question-followup.analysis.md) |

**Success Rate: 6/6 (개발 범위)**. 세부 실행은 [Electron 로그](../../verification/44-desktop-question-followup/electron.txt)를 참조한다. 미검증 조합과 운영 상태는 §4로 구분한다.

## 1.5 Decision Record Summary

| Source | Decision | Followed / Outcome |
|---|---|---|
| PRD DC-13·ADR-083 | 명시적 부모·원 질문 표시·실패 보존 | 예: 이어 묻기·초안 유지 전환·403 자동 독립 재전송 금지 |
| Plan §2·Design §3~4 | 기존 API/대기열 재사용 | 예: E06/E07/E08 유지, 새 API·SQL·job·LLM 경로 없음 |
| PRD §8·Design S1~S4 | SQL 권한·메모리 상태 경계 | 예: 선택 때 현재 답 재조회, 이력/초안 영구 캐시 없음 |
| PRD §8·Plan §6 | 개발과 운영 게시·메일 연결 분리 | 예: 설치된 0.1.1·공개 설치 파일 유지, DNS/SMTP 후속 |

## 2. Related Documents

[Plan](../../01-plan/features/desktop-question-followup.plan.md) · [Design](../../02-design/features/desktop-question-followup.design.md) · [Analysis](../../03-analysis/desktop-question-followup.analysis.md) · [검증 기록](../../verification/44-desktop-question-followup/verification.md) · [phase 44](../../../phases/44-desktop-question-followup/). 본 보고서는 개발 완료 결과와 제한을 기록한다.

## 3. Completed Items

### 3.1 Functional Requirements

U1 자동 새 조회·상태/오류 구분, U2 페이지/상세 잠금·ID 중복 제거, U3 명시적 부모·포커스, U4 초안 유지 새 질문 전환, U5 전송 잠금·실패 보존·접수/보관 초기화, U6 요청 세대·cleanup을 구현했다.

### 3.2 Non-Functional Requirements

기존 Bearer·SQL·현재 인용·하루 한도 경계를 재사용한다. 이력/초안 영구 캐시나 원문 로그를 추가하지 않았다. 기존 암호화 outbox의 부모 보존·4xx 미보관을 단위·합성 IPC로 확인했다.

### 3.3 Deliverables

[App.tsx](../../../desktop/src/renderer/src/App.tsx) · [AskTab.tsx](../../../desktop/src/renderer/src/components/AskTab.tsx) · [HistoryTab.tsx](../../../desktop/src/renderer/src/components/HistoryTab.tsx) · [Electron E2E](../../../desktop/tests/e2e/followup.spec.ts) · [outbox 단위](../../../desktop/src/main/__tests__/outbox-service.test.ts) · [구조/실행 근거](../../verification/44-desktop-question-followup/).

## 4. Incomplete Items

### 4.1 Direct Runtime Verification Gaps

**429 실패의 초안/부모 유지**, **페이지 실패·빠른 상세 연타**, **지연 응답과 로그아웃 결합**은 전용 UI 사례로 실행하지 않았다. 공통 오류/잠금/세션 경로의 정적 근거와 별도 회귀는 있으나 해당 조합의 실행 통과로 계산하지 않는다. 최종 독립 대조에서 확인된 미해결 제품 결함은 없다.

### 4.2 On Hold / Operations

발신 이름 **사수**, 주소 **sasu@getsasu.com**, 도메인 **getsasu.com**은 기록만 반영했다. DNS 인증·Resend SMTP 연결·실제 수신은 사용자 지시에 따른 후속이다. 설치된 **0.1.1**과 공개 설치 파일은 변경하지 않았으며 새 게시·업데이트 적용은 수행하지 않았다. phase 43의 실제 메일·신규 Windows 설치 전체 녹화 게이트를 이번 개발 완료로 해제하지 않는다.

## 5. Quality Metrics

### 5.1 Final Analysis Results

| Metric | Final / Evidence |
|---|---|
| 독립 정적·Plan | 10/10 일치·개발 SC 6/6; 모든 런타임 조합 검증 주장이 아님 |
| desktop lint·단위 | 오류 0·78/78: [lint](../../verification/44-desktop-question-followup/desktop-lint.txt)·[test](../../verification/44-desktop-question-followup/desktop-test.txt) |
| Electron·desktop build | 12/12·26.6초, electron-vite production build 포함: [로그](../../verification/44-desktop-question-followup/electron.txt) |
| root lint·build·단위 | 통과·1,834/1,834: [lint](../../verification/44-desktop-question-followup/root-lint.txt)·[build](../../verification/44-desktop-question-followup/root-build.txt)·[test](../../verification/44-desktop-question-followup/root-test.txt). 기존 문구 경고 84·blocking 0 |
| SQL·권한 | 316 PASS·2,016 조합: [sql.txt](../../verification/44-desktop-question-followup/sql.txt), 격리 PGlite; pg_cron/pg_net 없는 migration 0004 제외 |
| Archify | [deliver](../../verification/44-desktop-question-followup/archify-deliver.json)·[browser-check](../../verification/44-desktop-question-followup/archify-browser.json) PASS. automated-browser·`visualReview: not-requested` |
| Graft | 전후 `ERR_DLOPEN_FAILED`로 자동 그래프 미확보: [후속 로그](../../verification/44-desktop-question-followup/graft-after.txt). import/호출 관계 수동 대조 |

### 5.2 Resolved Issues

| Issue | Resolution / Evidence |
|---|---|
| U5 pending A 중 B 실패 뒤 무기한 진행 표시 | 취소한 기존 답을 중단 상태로 유지; 신규 접수 성공 후만 진행 표시. 신규 회귀 통과 |
| outbox 테스트 GUID·parser 인자 오류 2건 | 기존 계약에 맞는 fixture와 assertion으로 수정; 78개 단위 통과 |
| 초기 Electron 준비·창 조회 경쟁 | helper 준비 대기와 창 URL 확인·실패 프로필 정리 보완; 최종 12/12 통과 |

## 6. Lessons Learned & Retrospective

### 6.1 Keep

기존 권한·질문 체인을 재사용했고, 독립 리뷰에서 발견한 실제 pending 상태 오류를 합성 UI 회귀로 확인했다.

### 6.2 Problem

테스트 fixture/호출 assertion도 실제 계약을 따라야 한다. renderer 표시만으로 main 창·IPC 준비를 보장할 수 없었으며 Graft 그래프는 확보하지 못했다.

### 6.3 Try

오류 조합별 직접 실행 여부와 정적 근거를 분리한다. 도구 실행 실패를 산출물 확보로 표현하지 않는다.

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

성공 조건별 정적 대조·실행 로그·미검증 조합을 함께 유지하고, 초기 준비 실패를 기능 누락에 대한 red 증거로 계산하지 않는다.

### 7.2 Tools/Environment

Electron helper의 본체 readiness 대기를 유지한다. Graft 호환 실행 환경을 확인하며, Archify 자동 검사를 사람 visual review와 구분한다.

## 8. Next Steps

### 8.1 Immediate

분석·하네스·보고와 실행 로그를 포함한 개발 브랜치를 검토한다. 운영 설치 파일을 게시할 때는 버전 갱신·릴리스·설치 검증을 별도로 수행한다.

### 8.2 Follow-up

사용자 지시 뒤 getsasu.com DNS/Resend SMTP·실제 메일을 진행한다. 설치 파일 게시 여부와 phase 43 사람 실측은 개발 완료와 별도로 결정한다. §4.1 검증 공백은 후속에 보완한다.

## 9. Changelog

### 보고서 v1.0 (2026-10-03)

**Added:** 자동 이력·한국어 상태·재시도·페이지·명시적 이어 묻기, 신규 Electron 5개·부모 보존 단위 회귀.
**Changed:** 선택 질문/답 메모리 연결, 요청 세대·cleanup·ref 잠금·초안 유지 전환.
**Fixed:** pending 실패 진행 표시, 테스트 배선 2건, Electron helper 준비/창 조회 경쟁.

개발 브랜치 변경 기록이며 공개 설치 파일 릴리스 기록이 아니다.

## Version History

| Version | Date | Changes | Author |
|---|---|---|---|
| 1.0 | 2026-10-03 | 개발 완료·정적 10/10·SC 6/6·최종 Electron 12/12와 운영/검증 제한 | Codex |
