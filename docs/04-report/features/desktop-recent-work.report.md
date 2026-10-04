# desktop-recent-work 완료 보고서

> **상태**: 개발·검증 완료 / 운영 미반영
> **프로젝트**: 사수 (SASU)
> **버전**: desktop 0.1.1 기준 개발 브랜치
> **작성**: Codex · bkit report-generator
> **완료일**: 2026-10-03
> **PDCA**: phase 45 · `feat/desktop-recent-work` · 기준 `8917c49`

## Executive Summary

### 1.1 Project Overview

| 항목 | 내용 |
|---|---|
| 기능 | 팀장이 앱에서 최근 맡긴 자료·영업 원문 검토를 다시 찾고 웹 상세로 이동 |
| 시작 / 완료 | 2026-10-03 / 2026-10-03 |
| 범위 | PRD DC-14·§8, 기존 최근 24시간의 본인 작업 |

### 1.2 Results Summary

| 항목 | 결과 |
|---|---|
| 성공 조건 | SC1~5 **5/5 충족** |
| 독립 정적 대조 | U1~6/S1~2 **8/8**, 구조·기능·계약 각 100% |
| 대상 실행 검증 | Electron **18/18**(신규 6 + 기존 12), 가중 일치율 **100%** |
| 빌드·검사 | desktop production build/lint/78 단위, root webpack build/lint/1,834 단위 통과 |
| 운영 | 미반영. 설치된 앱·공개 설치 파일 0.1.1 유지 |

100%는 명시된 설계 항목과 실행한 테스트에 한정한다. 운영 실자료·실제 OS 브라우저 탐색·설치·메일 검증률을 뜻하지 않는다. 기본 root Turbopack 빌드의 worktree junction 오류와 Graft 그래프 공백은 아래에 기록했다.

### 1.3 Value Delivered

| 관점 | 실제 결과 |
|---|---|
| **문제** | 작업 시작 화면을 떠난 뒤 다시 찾기 어려웠던 본인의 최근 자료·영업 검토를 일 맡기기 상단에서 재열람한다. |
| **해결** | 기존 E05/E16과 30초 갱신을 재사용한다. 현재 존재·권한을 확인하고 웹 열기 성공 뒤 읽음을 기록한다. |
| **기능·사용 효과** | 한국어 상태·로딩·빈 목록·오류 재시도·연타 제한·이탈 처리를 제공한다. 신규 6개와 기존 12개 Electron 흐름이 통과했다. |
| **핵심 가치** | 새 서버·DB·LLM·영구 이력 없이 현재 세션/RLS 경계를 유지했다. SQL 316건·권한 조합 2,016건과 독립 정적 8항목을 검증했다. |

## Context Anchor

| 항목 | 내용 |
|---|---|
| WHY | 작업 재열람 |
| WHO | 동의한 팀장 |
| RISK | 늦은 요청·권한 회수 |
| SUCCESS | SC1~5 |
| SCOPE | 최근 24시간, 기존 API/웹 인계 |

## 1.4 Success Criteria Final Status

| 조건 | 최종 상태 | 근거 |
|---|---|---|
| SC1 팀장 목록·한국어 상태·빈 상태 | 충족 | 신규 목록/상태·빈 목록·팀원 숨김 사례 |
| SC2 로딩·오류·재시도·공유 갱신 | 충족 | 503 재시도, 수동/30초 갱신 요청 공유 |
| SC3 현재 권한 확인·웹 인계·읽음·연타 1회 | 충족 | E05 존재/E16 상태 재확인, 웹 성공 후 읽음, 문서 버튼 연타 |
| SC4 실패·권한 회수·화면 이탈/로그아웃 | 충족 | 사라진 자료·403·shell 실패, E05/E16 지연, 읽음 저장 지연 오류 |
| SC5 회귀·검사·독립 분석·기록 | 충족 | 18 E2E·78/1,834 단위·SQL·lint·production build·Archify 및 도구 공백 기록 |

**성공률: 5/5.** 세부 시나리오와 원본 로그는 [실행 기록](../../verification/45-desktop-recent-work/verification.md), 정적 근거는 [분석](../../03-analysis/desktop-recent-work.analysis.md)에 연결되어 있다.

## 1.5 Decision Record Summary — Key Decisions & Outcomes

| 원천 | 결정 | 준수·결과 |
|---|---|---|
| PRD DC-14·§8 / ADR-084 | 기존 본인 최근 24시간 작업을 다시 찾고 실패/취소를 자동 재실행하지 않음 | 준수. 범위 확장·새 API/DB/LLM 없음 |
| ARCHITECTURE §6-12 | 기기 Bearer·현재 멤버십·RLS·기존 웹 권한 유지 | 준수. 기존 E05/E16과 main HTTPS/동일 origin 경로 사용 |
| Plan / Design §2~3 | 전용 RecentWork + App 공유 Promise·loading/error | 준수. 기존 시작 화면과 30초 갱신 재사용 |
| Design U3~5 | 재확인→웹→읽음, 잠금·세대 검사 | 준수. 읽음 오류 콜백의 세대 누락 수정, 관련 E2E 추가 |

이미 시작한 OS 열기/저장 요청 자체는 취소할 수 없다. 종료된 화면에 늦은 결과를 반영하지 않는 경계를 상위 문서와 설계에 명시했다.

## 2. Related Documents

| 단계 | 문서 | 상태 |
|---|---|---|
| 원천 | [PRD DC-14·§8](../../PRD.md), [ARCHITECTURE §6-12](../../ARCHITECTURE.md), [ADR-084](../../ADR.md) | 대조 완료 |
| Plan | [desktop-recent-work.plan.md](../../01-plan/features/desktop-recent-work.plan.md) | 확정 |
| Design | [desktop-recent-work.design.md](../../02-design/features/desktop-recent-work.design.md) | 확정 |
| Check | [desktop-recent-work.analysis.md](../../03-analysis/desktop-recent-work.analysis.md) | 완료 |
| 실행 | [verification.md](../../verification/45-desktop-recent-work/verification.md) | 완료 |
| Report | 현재 문서 | 완료 |

## 3. Completed Items

### 3.1 Functional Requirements

U1~6 모두 완료: 팀장 최근 작업, 상태·빈 목록·오류, 공유 갱신, 현재 권한 재확인, 성공 후 읽음, 연타·이탈 방지, 기존 화면 회귀. 독립 검토의 U5 결함 1건을 수정해 7/8에서 8/8로 개선했다.

### 3.2 Non-Functional Requirements

S1~2 일치. 요약은 메모리에만 두고 기존 Bearer/RLS·IPC allowlist·HTTPS/동일 origin·세션 종료를 유지한다. 신규 의존성·원문/토큰 로그·이력 저장소 없음. [합성 380px 화면](../../verification/45-desktop-recent-work/screenshots/recent-work.png)을 확인했으며, 모든 상태 조합의 별도 화면 캡처는 만들지 않았다.

### 3.3 Deliverables

| 산출물 | 위치 |
|---|---|
| 제품 | [App.tsx](../../../desktop/src/renderer/src/App.tsx), [WorkTab.tsx](../../../desktop/src/renderer/src/components/WorkTab.tsx), [RecentWork.tsx](../../../desktop/src/renderer/src/components/RecentWork.tsx) |
| 실행 테스트 | [followup.spec.ts](../../../desktop/tests/e2e/followup.spec.ts) |
| 구조·검증 기록 | [flow.json](../../verification/45-desktop-recent-work/flow.json), [실행 기록](../../verification/45-desktop-recent-work/verification.md) |

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

확인된 기능 갭 없음. Graft 전후 자동 그래프는 Windows native binding 오류로 미확보이며 수동 import/호출 대조 범위를 실행 기록에 남겼다. 모든 시간 경계 조합·운영 계정 실자료·실제 OS 브라우저 탐색은 직접 검증하지 않았다.

### 4.2 Cancelled/On Hold Items

운영 반영·새 설치 파일 게시·phase 43 실기기 게이트는 별도다. 설치된/공개 Windows 0.1.1은 유지한다. 발신자 `사수 / sasu@getsasu.com`은 기록했으며, getsasu.com DNS/Resend SMTP 연결은 사용자 지시에 따라 보류한다.

## 5. Quality Metrics

### 5.1 Final Analysis Results

| 검사 | 최종 결과·기록 |
|---|---|
| 정적·가중 일치율 | [분석](../../03-analysis/desktop-recent-work.analysis.md): 8/8, 구조/기능/계약 각 100%; 15/25/25/35 가중 계산 100% |
| Electron / desktop build | [18/18 PASS, 1.6분](../../verification/45-desktop-recent-work/electron.txt); electron-vite production build 포함 |
| desktop lint / unit | [lint exit 0](../../verification/45-desktop-recent-work/desktop-lint.txt), [78 PASS](../../verification/45-desktop-recent-work/desktop-test.txt) |
| root lint / unit | [lint exit 0, 기존 문구 경고 84·blocking 0](../../verification/45-desktop-recent-work/root-lint.txt), [1,834 PASS](../../verification/45-desktop-recent-work/root-test.txt) |
| root build | [webpack exit 0·타입 검사·49/49 정적 생성](../../verification/45-desktop-recent-work/root-build-webpack.txt). [기본 Turbopack](../../verification/45-desktop-recent-work/root-build.txt)은 외부 node_modules junction으로 실패 |
| SQL | [316 PASS / 권한 조합 2,016](../../verification/45-desktop-recent-work/sql.txt), 격리 PGlite 실제 마이그레이션; pg_cron/pg_net 0004 제외 |
| Archify | [delivery 9/9·오류/경고 0](../../verification/45-desktop-recent-work/archify-deliver.json), [browser-check containment PASS](../../verification/45-desktop-recent-work/archify-browser.json), `visualReview: not-requested` |
| Graft | [전후 ERR_DLOPEN_FAILED](../../verification/45-desktop-recent-work/graft-after.txt); 자동 그래프 없음, 수동 호출 대조 |

Electron은 실제 main/preload/renderer와 합성 HTTPS Auth/API를 사용한다. 임시 인증서의 Node/Chromium 신뢰를 테스트 환경에만 설정했고 OS 브라우저 호출은 shell 대체로 관찰했다. 운영 인증서 검사·제품 Next 설정을 변경하지 않았다.

### 5.2 Resolved Issues

| 문제 | 수정·결과 |
|---|---|
| 탭 이탈 뒤 늦은 읽음 저장 오류가 전역 notice를 변경 | 발신 화면의 current 함수를 App 콜백까지 전달. 현재 화면 안내/이탈 후 미표시 E2E 통과 |
| HTTP fixture가 기존 HTTPS 인계 제한에 막힘 | 제품 제한 유지, 임시 TLS CA와 Chromium 인증서 신뢰로 HTTPS fixture 구성 |
| 기본 root 빌드의 외부 junction 거부 | 환경 공백을 기록하고 설정 변경 없이 webpack production build 검증 |

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

기존 API와 공유 요청으로 재열람을 연결했고, 독립 검토가 콜백 내부의 생명주기 누락을 찾아 실행 회귀로 닫았다.

### 6.2 What Needs Improvement (Problem)

합성 서버도 제품의 HTTPS 제한과 Node/Chromium의 서로 다른 인증서 신뢰 경로를 처음부터 반영해야 한다. Graft와 기본 worktree 빌드 환경이 검증 경로를 제한했다.

### 6.3 What to Try Next (Try)

비동기 UI 검토에서 부모 콜백의 await·오류 처리까지 함께 대조하고, 준비된 HTTPS fixture를 후속 회귀에 재사용한다.

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

각 화면의 세대 검사를 부모 콜백과 외부 부작용 경계까지 추적하고, 이미 시작한 요청의 취소 한계를 설계와 테스트에 함께 남긴다.

### 7.2 Tools/Environment

후속 도구 정비에서 Windows Graft binding과 worktree 의존성 경로를 재확인한다. 자동 검사·수동 대조·운영 실측의 증거 범위를 계속 구분한다.

## 8. Next Steps

### 8.1 Immediate

검증 문서와 변경을 리뷰 가능한 개발 결과로 정리한다. 운영 반영은 별도 승인·실기기 검증 절차를 따른다.

### 8.2 Next PDCA Cycle

새 기능은 사용자 후속 요청과 상위 문서 범위에 따라 정한다. 전체 이력·검색·자동 재실행·SMTP를 이번 완료에 포함하지 않는다.

## 9. Changelog

### 보고서 v1.0 (2026-10-03)

- 추가: 일 맡기기 최근 작업 목록·한국어 상태·새로고침·웹 상세 재열람, 신규 Electron 6개.
- 변경: App inbox Promise/로딩/오류 공유, 읽음 콜백의 발신 화면 생명주기 검사.
- 수정: 탭 이탈 뒤 늦은 읽음 저장 오류 안내.

## Version History

| 버전 | 날짜 | 변경 | 작성 |
|---|---|---|---|
| 1.0 | 2026-10-03 | 개발 완료·실행 증거·운영 경계 보고 | Codex |
