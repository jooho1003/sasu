# desktop-decision-flow 완료 보고서

> **상태**: 개발·검증 완료 / 운영 미반영
> **프로젝트**: 사수 (SASU)
> **버전**: desktop 0.1.1 기준 개발 브랜치
> **작성**: Codex · bkit report-generator
> **완료일**: 2026-10-03
> **PDCA**: phase 46 · `feat/desktop-decision-flow` · 기준 PR33의 `1f9da61`

## Executive Summary

### 1.1 Project Overview

| 항목 | 내용 |
|---|---|
| 기능 | 결정함 조회 오류·상세 열람·처리 성공/실패의 회복 동작 |
| 시작 / 완료 | 2026-10-03 / 2026-10-03 |
| 범위 | PRD DC-15·§8, 기존 E05/E09/E10과 renderer 3파일 |

### 1.2 Results Summary

| 항목 | 결과 |
|---|---|
| 성공 조건 | SC1~5 **5/5 충족** |
| 독립 정적 대조 | U1~6/S1~2 **8/8**, 구조·기능·계약 각 100% |
| Electron | 신규 7 + 기존 18 = **25/25 PASS**, exit 0, 1.5분 |
| 검사 | desktop lint/78 단위·SQL·root lint/webpack build/1,834 단위 통과 |
| 운영 | 미반영. 설치된 앱·공개 설치 파일 0.1.1 유지 |

정적 8/8과 대상 runtime 25/25에 따른 가중 일치율은 **100%**다. 이 값은 명시된 설계 항목과 실행한 테스트에 한정하며 운영 실자료·Windows 설치·메일·모든 권한/시간 조합 검증률을 뜻하지 않는다.

### 1.3 Value Delivered

| 관점 | 실제 결과 |
|---|---|
| **문제** | 조회 실패를 빈 결정함으로 오인하고 성공 후 오래된 상세에 남던 흐름을 보완했다. |
| **해결** | 기존 공유 E05·현재 E09·E10을 연결했다. 성공은 목록 복귀와 새 조회, 실패는 입력 유지·수동 재시도다. |
| **기능·사용 효과** | 한국어 상태·오류 재시도·연타 제한·인용 0 복귀·늦은 콜백 폐기를 제공한다. 신규 7개와 기존 18개 Electron 흐름이 모두 통과했다. |
| **핵심 가치** | 기존 담당자/팀장·RLS·append-only·멱등을 유지했다. 독립 정적 8/8과 SQL 316건·권한 조합 2,016건을 확인했다. |

## Context Anchor

| WHY | WHO | RISK | SUCCESS | SCOPE |
|---|---|---|---|---|
| 결정함 오류/처리 회복 | 동의한 부서 구성원 | 늦은 콜백·중복 행동·근거 없는 내용 | SC1~5 | PRD DC-15·§8 / ADR-085 |

## 1.4 Success Criteria Final Status

| 조건 | 상태 | 근거 |
|---|---|---|
| SC1 로딩·오류·빈 목록·재시도·한국어 상태 | 충족 | 지연·503·빈 목록·open/needs_review·마감 사례 |
| SC2 현재 상세·연타 1회·인용 뒤 읽음·인용 0 복귀 | 충족 | E09 연타·403·인용 0·현재 읽음·처리된 상세 행동 없음 |
| SC3 성공/중복 성공 복귀·갱신, 실패 입력 유지 | 충족 | 결정/보류/반려/duplicate·실패 초안·선행 E05 스냅샷 폐기 |
| SC4 이탈/로그아웃 뒤 늦은 콜백 폐기 | 충족 | E09/POST/읽음 지연·복귀 버튼·같은 탭·로그아웃 |
| SC5 회귀·단위/lint/build·SQL·분석/도구/보고 | 충족 | 25 E2E·78/1,834 단위·lint/production build·SQL·독립 대조·Archify 및 Graft 공백 기록 |

**성공률: 5/5.** 원본 증거는 [검증 기록](../../verification/46-desktop-decision-flow/verification.md), 정적 근거는 [분석](../../03-analysis/desktop-decision-flow.analysis.md)에 연결했다.

## 1.5 Decision Record Summary — Key Decisions & Outcomes

| 원천 | 결정 | 준수·결과 |
|---|---|---|
| PRD DC-15·§8 / ADR-085 | 기존 결정함 회복, 새 자동 결정·API/DB·대기열 없음 | 준수. 제품은 renderer 3파일만 변경 |
| ARCHITECTURE §6-12 | 기기 Bearer·현재 멤버십·인용·RLS·원장/멱등 재사용 | 준수. 기존 route/helper/SQL 경계를 유지 |
| Plan / Design §2 | 기존 CardsTab/CardView의 props·ref·cleanup 보완 | 준수. 새 hook/캐시/서비스 없이 상태 공유 |
| Design U4~5 | 성공 후 새 E05, 이탈 콜백 무효화 | 선행 스냅샷 무효화와 동일 탭 key cleanup으로 2개 갭 수정 |

이미 시작한 결정 POST는 화면 이탈로 취소할 수 없다. 현재 화면에서 성공 후 시작한 App 갱신은 탭 전환 뒤에도 이어지며, 세션 종료 후에는 새 조회를 시작하지 않는다.

## 2. Related Documents

| 단계 | 문서 | 상태 |
|---|---|---|
| 원천 | [PRD DC-15·§8](../../PRD.md), [ARCHITECTURE §6-12](../../ARCHITECTURE.md), [ADR-085](../../ADR.md) | 대조 완료 |
| Plan | [desktop-decision-flow.plan.md](../../01-plan/features/desktop-decision-flow.plan.md) | 확정 |
| Design | [desktop-decision-flow.design.md](../../02-design/features/desktop-decision-flow.design.md) | 확정 |
| Check | [desktop-decision-flow.analysis.md](../../03-analysis/desktop-decision-flow.analysis.md) | 완료 |
| 실행 | [verification.md](../../verification/46-desktop-decision-flow/verification.md) | 완료 |
| Report | 현재 문서 | 완료 |

## 3. Completed Items

### 3.1 Functional Requirements

U1~6 구현 완료. 목록 상태·공유 갱신, 현재 상세/읽음, 인용 없는 카드의 내용·행동 숨김, 처리 잠금·성공 복귀, 실패 초안 보존, 세대 검사를 연결했다. 최초 독립 대조의 U4/U5 두 갭을 수정해 6/8에서 8/8로 개선했다.

### 3.2 Non-Functional Requirements

S1~2 정적 일치. 기존 Bearer·담당자/팀장·RLS WITH CHECK·현재 인용·원장 append-only·멱등 경계 유지. 새 의존성·영구 캐시·원문/토큰 로그·LLM 없음. [합성 380px 목록 화면](../../verification/46-desktop-decision-flow/screenshots/decision-list.png)을 확인했으며 모든 처리/오류 상태의 별도 캡처는 만들지 않았다.

### 3.3 Deliverables

| 산출물 | 위치 |
|---|---|
| 제품 | [App.tsx](../../../desktop/src/renderer/src/App.tsx), [CardsTab.tsx](../../../desktop/src/renderer/src/components/CardsTab.tsx), [CardView.tsx](../../../desktop/src/renderer/src/components/CardView.tsx) |
| 테스트 | [followup.spec.ts](../../../desktop/tests/e2e/followup.spec.ts) 신규 7개와 기존 18개 |
| 기록 | [분석](../../03-analysis/desktop-decision-flow.analysis.md), [검증](../../verification/46-desktop-decision-flow/verification.md), [flow.json](../../verification/46-desktop-decision-flow/flow.json) |

## 4. Incomplete Items

### 4.1 Carried Over to Next Cycle

확인된 잔존 코드 갭 없음. 성공 후 선행 E05 종료를 기다리는 갱신의 탭 전환 지속/로그아웃 후 새 조회 금지 조합은 정적 대조만 했고 별도로 실행하지 않았다. Graft 자동 그래프도 미확보다.

### 4.2 Cancelled/On Hold Items

운영 게시·Windows 설치·실자료·실제 OS 브라우저·메일 검증은 별도다. 설치된 앱과 공개 파일은 0.1.1을 유지한다. `사수 / sasu@getsasu.com`을 기록하고 도메인 DNS/Resend SMTP 연결은 사용자 지시대로 보류한다.

## 5. Quality Metrics

### 5.1 Final Analysis Results

| 검사 | 결과·기록 |
|---|---|
| 정적·가중 일치율 | [독립 분석](../../03-analysis/desktop-decision-flow.analysis.md) 8/8, 구조/기능/계약 각 100%; 15/25/25/35 가중 계산 100% |
| Electron / desktop build | [25/25 PASS·exit 0·1.5분](../../verification/46-desktop-decision-flow/electron.txt); electron-vite production build 포함 |
| desktop lint / unit | [lint exit 0](../../verification/46-desktop-decision-flow/desktop-lint.txt), [78 PASS](../../verification/46-desktop-decision-flow/desktop-test.txt) |
| root lint | [기존 문구 경고 84·blocking 0](../../verification/46-desktop-decision-flow/root-lint.txt), PASS |
| root build / unit | [webpack exit 0·타입 검사·49/49 정적 생성](../../verification/46-desktop-decision-flow/root-build-webpack.txt), [1,834 PASS](../../verification/46-desktop-decision-flow/root-test.txt) |
| 기본 root build | [Turbopack](../../verification/46-desktop-decision-flow/root-build.txt)은 worktree 외부 node_modules junction으로 실패. 제품 Next 설정 무변경 |
| SQL | [316 PASS / 권한 조합 2,016](../../verification/46-desktop-decision-flow/sql.txt), isolated PGlite 실제 마이그레이션; pg_cron/pg_net 0004 제외 |
| Archify | [delivery 9/9·오류/경고 0](../../verification/46-desktop-decision-flow/archify-deliver.json), [browser containment PASS](../../verification/46-desktop-decision-flow/archify-browser.json), `visualReview: not-requested` |
| Graft | [전](../../verification/46-desktop-decision-flow/graft-before.txt)·[후](../../verification/46-desktop-decision-flow/graft-after.txt) `ERR_DLOPEN_FAILED`; 자동 그래프 없음, 수동 호출 대조 |

Electron은 실제 main/preload/renderer와 합성 HTTPS Auth/API를 사용한다. 임시 CA와 localhost 인증서 신뢰는 fixture에만 적용했다. SQL 권한·원장·멱등 증거는 공용 단위와 격리 SQL 실행에서 구분한다. 자동 Archify 검사를 사람 시각 승인으로 표시하지 않는다.

### 5.2 Resolved Issues

| 문제 | 수정·결과 |
|---|---|
| 성공 후 처리 전 E05 스냅샷 재사용 | 선행 응답 세대 무효화→종료 대기→새 E05, 지연 스냅샷 단독 사례 PASS |
| 같은 결정함 재클릭 뒤 늦은 읽음 오류 | nav key 재마운트로 CardsTab cleanup 실행, 독립 재검토·회귀 통과 |
| 합성 deadline 계약·label locator 불안정 | ISO datetime과 role/name locator로 fixture만 수정 |
| clock 설치 이전 interval 미추적 | clock 설치 후 reload로 실제 effect 재등록 |
| Windows 임시 프로필 삭제 EPERM | 검증된 임시 경로의 비동기 정리·제한된 재시도 후 전체 25개 회귀 통과 |

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

독립 검토가 공유 조회와 변경 후 갱신의 차이, 동일 탭 복귀의 생명주기를 찾아 실제 지연 사례로 보완했다. 제품 권한·계약은 재사용했다.

### 6.2 What Needs Improvement (Problem)

평상시 중복 조회 공유와 변경 뒤 새 조회를 구분해야 한다. 합성 자료도 실제 parser 계약을 따르고 clock과 Windows 파일 잠금의 테스트 환경을 준비해야 한다.

### 6.3 What to Try Next (Try)

후속 비동기 UI 검토에서도 버튼 복귀·탭 재클릭·세션 종료를 함께 대조하고, 성공 전 스냅샷을 고정한 경합 fixture를 재사용한다.

## 7. Process Improvement Suggestions

### 7.1 PDCA Process

화면의 await뿐 아니라 부모 콜백·공유 조회·변경 후 갱신까지 추적한다. 서버 행동 취소와 UI 결과 폐기의 경계를 설계와 실행 기록에 함께 남긴다.

### 7.2 Tools/Environment

Windows 프로필 정리의 제한된 재시도, clock 설치 시점, 임시 HTTPS 신뢰 설정을 fixture에 유지한다. Graft binding과 기본 worktree 빌드 환경은 후속 도구 정비에서 재확인한다.

## 8. Next Steps

### 8.1 Immediate

검증 문서와 변경을 리뷰 가능한 개발 결과로 정리한다. 운영 반영은 별도 승인·실기기 절차를 따른다.

### 8.2 Next PDCA Cycle

사용자 후속 요청과 상위 문서에 따라 범위를 정한다. 새 자동 결정·결정 대기열·전체 이력·SMTP를 이번 완료에 포함하지 않는다.

## 9. Changelog

### 보고서 v1.0 (2026-10-03)

- 추가: 결정함 로딩/오류/재시도·상태, 인용 0 복귀와 신규 Electron 7개.
- 변경: 상세/처리 잠금·세대 검사, 성공 목록 복귀와 새 E05, 실패 입력 유지.
- 수정: 처리 전 스냅샷 재사용·현재 탭 재클릭의 읽음 세대 누락.

## Version History

| 버전 | 날짜 | 변경 | 작성 |
|---|---|---|---|
| 0.1 | 2026-10-03 | 정적·현재 실행 결과 기반 초안 | Codex |
| 1.0 | 2026-10-03 | 최종 25 E2E·빌드·단위 검증과 완료 상태 반영 | Codex |
