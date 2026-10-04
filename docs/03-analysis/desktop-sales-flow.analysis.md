# desktop-sales-flow Analysis Report

> 2026-10-03 · 독립 gap-detector · phase 47 · G1 재검토 및 최종 실행 근거 확인 완료
> [Plan](../01-plan/features/desktop-sales-flow.plan.md) · [Design](../02-design/features/desktop-sales-flow.design.md)
> 원천: PRD §3-8 DC-16·§8 → ARCHITECTURE §6-12 → ADR-086.

## Context Anchor

| Key | Value |
|---|---|
| WHY | 영업 검토 시작·진행·결과 열기의 회복 |
| WHO | 동의한 비데모 부서 lead |
| RISK | 중복 POST·중첩 폴링·이탈 후 링크/읽음 |
| SUCCESS | SC1~6 실행 증거와 독립 U1~8/S1~2 대조 |
| SCOPE | PRD DC-16·§8 / ARCHITECTURE §6-12 / ADR-086 |

## Strategic Alignment Check

기존 영업 검토의 중복 시작·상태 회복·현재 완료 결과 인계 문제를 기존 API로 해결한다. lead 대상, 한국어, 서버 권한, 사람의 수동 회복이라는 PRD/Plan/Design 결정은 유지된다. 독립 검토에서 개발 StrictMode의 영구 로딩 G1을 발견했고 실제 development React red→제품 보완→6 PASS로 해결했다. 현재 확인된 Important/Critical 코드 갭은 없다.

| 기준 | 현재 평가 | 근거 |
|---|---|---|
| SC1 후보 조회 회복·현재 4원문/원칙 | targeted 충족 | production 자료/시작 6 PASS와 [실제 개발 StrictMode 6 PASS](../verification/47-desktop-sales-flow/strict-green.txt), G1 해결 |
| SC2 시작 잠금·동일/새 UUID·실패 선택 보존 | targeted 충족 | [step0 최종 6 PASS](../verification/47-desktop-sales-flow/step0-green-network.txt), [step1 시작 회귀 6 PASS](../verification/47-desktop-sales-flow/step1-start-regression.txt) |
| SC3 단일 조회·5상태·오류 정지·새 검토 | targeted 충족 | [step1 최종 6 PASS](../verification/47-desktop-sales-flow/step1-green-final.txt), 현재 테스트 504행 이후 |
| SC4 현재 ready·OS 성공 뒤 읽음 | targeted 충족 | 같은 로그, 현재 테스트 563행 이후 현재 상태/실패/성공 순서 |
| SC5 종료 뒤 각 단계 늦은 콜백 폐기 | targeted 충족 | other/same/logout 및 실제 StrictMode 자료 소유권 실행 통과. OS 늦은 실패/읽음 늦은 성공은 공통 guard 정적 대조이며 별도 runtime 미실행 |
| SC6 전체 회귀·lint/build/unit/SQL·도구·보고 | 충족 | 보완 후 production [37 PASS/3.8분](../verification/47-desktop-sales-flow/electron.txt), desktop lint/build/78 단위 PASS, root lint/webpack build/1,834 단위 PASS, SQL 316 PASS/2,016 조합, 독립 10/10 및 도구 성공/누락 기록 |

SC1~6은 아래의 실행·정적 대조 범위에서 6/6 충족한다. 보완 후 production 전체 37개와 별도 개발 StrictMode 6개 실행을 확인했으며, 모든 권한·시간·오류 조합을 검증했다고 추정하지 않는다.

## 1. Analysis Overview

plan/design 전체와 PRD DC-16/§8, ARCHITECTURE DC-16, ADR-086을 읽었다. 실제 App/WorkTab/WorkSalesReview/RecentWork, onSeen, main IPC/preload/shared parser, E14~16 route와 공용 lib·SQL을 대조했다. 제품 변경은 App.tsx/WorkSalesReview.tsx 두 파일, 테스트는 기존 followup.spec.ts다. 구현 파일 존재만이 아닌 실제 분기/잠금/오류/cleanup을 검토했다. 이 분석 담당자는 전체 테스트를 추가 실행하지 않았다.

## 2. Gap Analysis

### 2.1 UI·보안 비교 목록

| ID | 정적 판정 | 실제 코드 근거 |
|---|---|---|
| U1 후보 loading/empty/error/reload·1flight | 일치, G1 해결 | WorkSalesReview 36·42~68·140~143행: active 소유권·단일 잠금, 개발 setup replay의 pending read 보존/로딩 종료, 오류 숨김 |
| U2 현재 distinct 4개·원칙·동결 | 일치 | 105~115·136~143행: Map/Set/현재 후보/is_principles, native label/select, 자료/시작 중 동결 |
| U3 시작 잠금·선택별 UUID·실패 보존 | 일치 | 105~134행: 값 변경만 attempt 초기화, fingerprint별 UUID, acceptedTask 중복 차단, 자동 POST 없음 |
| U4 자료 회수/권한/연결 오류 회복 | 일치 | 11~20·61~65·128~133행: IPC Error wrapper 정리, source_unavailable 후보 숨김, 수동 E14 가능 |
| U5 5초 단일 조회·5상태·오류 stop | 일치 | 6~9·70~97·146~148행: status/open 공용 잠금, statusError/terminal interval 제거, 수동 재개 |
| U6 진행 중 새 시작 금지·terminal 새 검토 | 일치 | 98~104·136~150행: terminal/잠금 검사, 세대/작업/시도 초기화, not_found에는 task 보존/상태 숨김 |
| U7 현재 ready→open→seen·공유 잠금 | 일치 | 70~91·149행: 현재 E16 ready만 웹 열기, 성공 뒤 onSeen(current), catch에는 상태 숨김 |
| U8 종료·동일 탭·로그아웃 세대 검사 | 일치, G1 해결 | WorkSalesReview 42~44·55~65·73~90·118~133행, App workKey/rememberSeen. 실제 unmount active=false, 시작/상태는 generation 폐기 |
| S1 기존 Bearer/RLS/멱등/원문 경계 | 일치 | 기존 E14~16 requireDeviceContext, sales-review-sources/sales-source-review-start, SQL 0068 37~105행 |
| S2 로그/캐시/LLM/DB/IPC 경계 | 일치 | product diff는 renderer 두 파일. 후보 quote를 답으로 렌더하지 않고 직접 fetch/SDK/저장 추가 없음 |

G1 보완을 재대조한 현재 목록은 10/10 정적 일치다. source active ref는 effect replay의 같은 인스턴스에만 읽기 소유권을 복구하며 실제 unmount 뒤 옛 인스턴스는 false로 남는다. source read가 진행 중이면 시작 자체가 금지되고 task 접수 뒤 source read가 금지되므로 terminal 새 검토와 이전 source read가 겹치지 않는다.

### 2.2 API Contract 3-way 대조

| API | Design | 실제 server | 실제 client | 결과 |
|---|---|---|---|---|
| E14 GET sales-review/sources | candidates strict 5필드 | route → loadSalesSourceCandidates: lead/동의/demo·세션 RLS, item_id/title/kind/quote/is_principles | WorkSalesReview sources → preload 93행 → IPC 196행 → parseSalesSources/shared 119~129행 | 일치 |
| E15 POST sales-review | 4역할 ID + request_id → task_id | route SalesSourceReviewRequest·startSalesSourceReview → 현재 원문/버전·RPC 멱등, 202 task_id | WorkSalesReview 124행 → preload 94~96행 → IPC 197행 → parseSalesStart | 일치 |
| E16 GET sales-review/[taskId] | status 5enum + web_path | route requireDeviceContext/z.uuid/readSalesSourceReviewStatus, 본인/부서/RLS·200 path | WorkSalesReview 78행 → preload 97~98행 → IPC 198행 → strict 5enum/path parser | 일치 |

task UUID는 SQL gen_random_uuid()이므로 route z.uuid()와 응답 guid parser 사이에 확인된 불일치가 없다. readSalesSourceReviewStatus의 본인/부서 필터와 SQL sales_source_reviews_current → sales_source_review_inputs → can_see가 현재 lead/동의/비데모/원문 버전 권한을 집행한다. renderer 후보 검사는 이 권한을 대신하지 않는다. 웹 열기는 IPC app:openWeb 212행의 기존 제한을 유지한다.

### 2.3 Runtime Verification

G1 보완 후 최종 production Electron main/preload/renderer + 합성 HTTPS 전체 실행은 [신규 12 + 기존 25 = 37 PASS/3.8분, tool_exit 0](../verification/47-desktop-sales-flow/electron.txt)다. 별도 실제 development React StrictMode source/start는 [6 PASS/23.8초](../verification/47-desktop-sales-flow/strict-green.txt)다. E14/15/16 서버 운영 HTTP나 실제 고객 문서 의미 정확도를 실행한 것으로 기록하지 않는다.

| 검증 | 최종 실제 결과 | 근거 |
|---|---|---|
| desktop lint / build | 각각 exit 0, production electron-vite | [lint](../verification/47-desktop-sales-flow/desktop-lint.txt), [build](../verification/47-desktop-sales-flow/desktop-build.txt) |
| desktop 단위 | 12 files / 78 PASS, exit 0 | [desktop-test](../verification/47-desktop-sales-flow/desktop-test.txt) |
| root lint | exit 0, 기존 warning/문구 blocking 0 | [root-lint](../verification/47-desktop-sales-flow/root-lint.txt) |
| root 기본 build | exit 1, worktree 외부 node_modules junction Turbopack 실패 | [root-build](../verification/47-desktop-sales-flow/root-build.txt) |
| root webpack production build | exit 0, compile 3.9분·타입 35.4초·정적 49/49 | [webpack](../verification/47-desktop-sales-flow/root-build-webpack.txt) |
| root 단위 | 183 files / 1,834 PASS, exit 0 | [root-test](../verification/47-desktop-sales-flow/root-test.txt) |
| 격리 SQL | 316 PASS / 0 failed, 권한 2,016 조합 | [sql](../verification/47-desktop-sales-flow/sql.txt) |

SQL은 실제 마이그레이션의 isolated PGlite 실행이며 pg_cron/pg_net을 제공하지 않는 0004는 제외한다. L1 서버 계약은 단위/SQL로 대조한 범위이고 운영 HTTP 요청을 실행하지 않았다. Electron L2 UI 행동과 L3 흐름은 동일한 37개에서 확인하므로 74개의 독립 실행으로 합산하지 않는다. 별도 개발 6개는 effect replay 검증으로 구분한다.

SC5 targeted는 자료/시작, 자동 상태/열기 전 E16 성공·실패, OS 열기 늦은 성공, 읽음 늦은 실패를 other/same/logout으로 실행했다. OS 열기 늦은 실패와 읽음 저장 늦은 성공은 별도 runtime 사례가 없으며 공통 catch/current와 App rememberSeen 100~110행의 현재성 검사만 정적 대조했다. 모든 오류/이탈 조합의 곱을 실행하지 않았다.

### 2.4 현재 점수

- Structural: 100% — 예상 제품 2파일과 기존 세 모듈/경로 유지.
- Functional: 8/8 완전 일치 = 100%, G1 해결.
- Contract: 3/3 = 100%.
- Static formula: 100×0.2 + 100×0.4 + 100×0.4 = 100%. 비교 목록 완전 일치는 10/10이다.
- Runtime: 명세화한 최종 production Electron 실행 37/37 = 100%, 별도 개발 StrictMode 6/6 = 100%. 권한/서버 정적 대조와 SQL 실행 한계는 위와 같다.
- Overall: structural 100×0.15 + functional 100×0.25 + contract 100×0.25 + scoped runtime 100×0.35 = 100%.
- 이 수치는 설계 비교 10개와 실제 실행한 사례의 범위에만 해당하며 모든 권한/시간 조합·운영 인증·실문서 정확도를 뜻하지 않는다.

## 3. Code Quality Analysis

### G1 — 개발 StrictMode 후보 조회 영구 로딩 (Important, confidence 95%, 해결)

보완 전 코드에서 renderer main.tsx 8~11행의 StrictMode는 개발에서 effect setup→cleanup→setup을 실행한다. WorkSalesReview 첫 mount는 loadSources가 sourcesLocked=true·generation 0 요청을 시작한다(보완 전 49~54행). 첫 cleanup은 generation을 증가시킨다(보완 전 41행). 두 번째 setup에서 loadSources는 sourcesLocked=true 때문에 return한다(보완 전 48행). 첫 응답과 finally는 current=false라 후보/오류와 잠금/로딩 종료를 모두 반영하지 않는다(보완 전 55~61행). 따라서 개발 사용 화면은 loading/disabled에서 회복할 수 없었다. production Electron build targeted는 effect replay를 하지 않으므로 이 문제를 탐지하지 않았다.

초기 상태의 위 결함을 root에게 전달했고, 실제 개발 React red에서 bundleType 1·StrictEffects true·cleanupGeneration 1·sourceRequests 1 뒤 503 alert가 렌더되지 않는 실패를 확인했다([strict-red.txt](../verification/47-desktop-sales-flow/strict-red.txt)). 이후 자료 소유권만 sourcesActive setup true/cleanup false로 분리해 replay는 단일 pending read를 이어받고 실제 unmount는 폐기한다. 시작/상태/새 검토 generation은 유지한다. 실제 development React 6 PASS와 desktop lint exit 0으로 보완했다([strict-green.txt](../verification/47-desktop-sales-flow/strict-green.txt), [strict-lint.txt](../verification/47-desktop-sales-flow/strict-lint.txt)).

테스트 전용 build-development-react.mjs는 SASU_DESKTOP_REACT_MODE=development opt-in에서 renderer compile-time React mode만 바꾼다. 제품 build config/main/preload/IPC/HTTPS 제한은 유지하고 env-unset은 production build다. 초기 child NODE_ENV만 바꾼 시도와 flat inline config 준비 실패는 fixture 실패이며 제품 red로 계산하지 않는다.

그 외 확인된 confidence ≥80 Important/Critical 코드 갭은 없다. 상태 effect는 taskId/status/statusError primitive 의존성과 cleanup으로 interval을 관리하고, 시작/조회/열기 ref 잠금이 렌더 전 연타를 막는다. 자동 polling은 global notice를 지우지 않아 같은 화면 업로드 안내를 보존한다. native label/select/button 및 role=status/alert를 사용한다. 범용 hook/캐시나 새 라이브러리 요구는 현재 범위에 필요하지 않다.

## 4. Performance Analysis

서버 지연/SLA 측정은 범위 밖이다. 단일 flight 계수와 4,999/5,000ms 경계는 targeted 실행으로 확인했다. 중복 API 조회 억제를 지연 테스트로 검증했으며 응답 시간 숫자를 추정하지 않는다.

## 5. Test Coverage and Runtime Verification Plan

L1: 기존 공용 영업 lib/companion을 포함한 root 1,834 단위와 격리 SQL 316/권한 2,016 조합 실행 결과를 연결했다. lead/member/미동의/demo/본인 task/current source/멱등은 기존 경계이며 이번 서버 route 변경은 없다. 운영 서버 curl 재실행은 하지 않았다.

L2/L3: 기존 followup.spec.ts 신규 12 + 기존 25 최종 production 전체 37개 회귀와 G1 실제 development React setup/cleanup/setup source/start 6개 검증을 연결했다. OS 늦은 실패·seen 늦은 성공은 미실행 한계로 유지하며 기존 guarded await와 동일 경로인 것으로만 평가한다. 실행 대상의 코드 커버리지 백분율은 수집하지 않아 추정하지 않는다.

## 6. Clean Architecture Compliance

App workKey→WorkTab→WorkSalesReview/RecentWork, renderer→기존 preload/main→Bearer API→공용 lib/SQL을 유지한다. onSeen은 기존 App의 세션/current 검사이며 웹 열기 성공 뒤 호출한다. 원문·상태는 메모리에만 두고 새로운 저장/LLM/서버 권한 로직이 없다. 확인된 계층 위반은 없다.

Graft 사전/사후 실제 실행은 tree-sitter-kotlin Win32 native binding ERR_DLOPEN_FAILED로 실패해 자동 그래프를 만들지 못했다. 수동 import/호출 대조 범위만 이 분석에 사용한다. Archify flow deliver는 [9/9·오류/경고 0](../verification/47-desktop-sales-flow/archify-deliver.json), browser-check는 [containment PASS](../verification/47-desktop-sales-flow/archify-browser.json)다. browser-check의 visualReview는 not-requested로 별도 의미 정확도 검증을 뜻하지 않는다.

## 7. Convention Compliance

AGENTS·AI-DEVELOPMENT의 상위 문서→PDCA design→순차 step 순서, 한국어, shared/messages 직접 import, native controls를 따랐다. React best-practices의 transient ref 잠금·primitive effect 의존성·이벤트 처리·cleanup을 대조했고 G1의 StrictMode setup 안전성을 실제 dev replay로 보완했다. Root lint exit 0와 G1 보완 후 desktop lint exit 0를 확인했다.

## 8. Overall Score

초기 G1 1건을 실제 개발 red/green으로 해결했고 현재 잔존 확정 Important/Critical 갭은 없다. 비교 목록 10/10, API 계약 3/3, 최종 production 실행 37/37 및 별도 개발 6/6이다. SC6/6 충족과 scoped weighted 100%를 근거로 report 진행이 가능하다. 전체 권한/시간 조합이나 운영 준비 완료를 뜻하지 않는다.

## 9. Recommended Actions

1. G1 제품 보완과 actual development red/green 재검토 완료.
2. 보완 후 production 37개와 desktop/root 최종 체인 실제 결과 연결 완료.
3. 최종 검증 문서·step 기록과 이 독립 분석을 completion report에 연결한다.

## 10. Design Document Updates Needed

현재 API/권한/데이터 모델 결정 변경은 필요하지 않다. G1은 승인된 조회/lifecycle 구현 보완으로 처리한다. 상위 범위 외 업로드 개선·운영 배포·SMTP 연결은 이 분석에 추가하지 않는다.

## 11. Next Steps

G1 보완/재분석 및 SC6 최종 실행 근거 확인 완료. [검증 기록](../verification/47-desktop-sales-flow/verification.md)·step 요약과 함께 report로 진행한다. 운영 Windows 0.1.1·도메인/Resend SMTP 보류 상태는 유지한다.

## Version History

0.1 · 2026-10-03 · 독립 3-way/10항목 정적 검토와 G1, 전체 runtime pending.
0.2 · 2026-10-03 · 실제 StrictMode red/green·자료 active 소유권 보완 재검토, 정적 10/10, 최종 production runtime pending.
0.3 · 2026-10-03 · 보완 후 production 37/37·desktop/root/SQL 최종 로그 확인, SC6/6·scoped weighted 100% 확정.
