# Step 0 완료 — 영업 자료·시작 회복

2026-10-03 · branch `feat/desktop-sales-flow` · 기준 `12ad4d7`

## 변경

제품은 `desktop/src/renderer/src/App.tsx`와 `components/WorkSalesReview.tsx`만 바꿨다. App workKey는 동일 일 맡기기 탭 재클릭에도 WorkTab 자식 cleanup을 실행한다. 영업 자료 조회에 loading/empty/error/manual reload와 ref 단일 잠금을 추가했다. 실패 때 후보를 숨기고 한국어 오류를 보여 주며 선택 ID는 메모리에서 유지한다.

시작은 현재 후보 4개·distinct·원칙 플래그를 다시 검사한다. 동기 ref 잠금으로 시작 중 후보 조회/선택을 동결하고 task 접수 뒤 중복 시작을 막는다. 실패 후 같은 선택의 수동 retry는 같은 request_id다. 실제 값 변경이나 향후 명시 새 검토만 새 시도 ID를 사용한다. 같은 값의 change 이벤트는 시도를 초기화하지 않는다. source_unavailable는 후보/결과를 숨기고 수동 E14 재검사를 제공한다. 자료/시작 await 후 generation 검사를 적용했다.

테스트는 기존 `desktop/tests/e2e/followup.spec.ts`의 합성 HTTPS Auth/API를 확장해 실제 Electron main/preload/renderer를 사용한다. source candidate는 기존 strict 5필드(item_id/title/kind/quote/is_principles), 시작은 기존 5필드와 task_id 응답을 따른다. 정확한 테스트 CA 신뢰/Windows 비동기 안전 경로 profile 정리는 유지했다. 새 서버/IPC/DB/lib 모듈, 직접 quote 렌더, 운영 호출은 없다.

## 실행 기록

| 명령 | 실제 결과 | 기록 |
|---|---|---|
| desktop `npm run e2e -- followup.spec.ts --grep 'sales start 자료 조회'` 구현 전 | exit 1, 1 failed: loading 안내 누락 | [step0-red.txt](step0-red.txt) |
| desktop `npm run e2e -- followup.spec.ts --grep 'sales start'` 첫 구현 | exit 0, 6 PASS / 16.3s | [step0-green.txt](step0-green.txt) |
| 같은 명령: 동일값 ID 보존·원칙 후보 위조·logout 성공 지연 추가 | exit 0, 6 PASS / 19.5s | [step0-green-final.txt](step0-green-final.txt) |
| 같은 명령: 실제 연결 끊김(source/start) 추가한 최종 실행 | exit 0, 6 PASS / 19.4s, Electron production build 포함 | [step0-green-network.txt](step0-green-network.txt) |
| desktop `npm run lint` | exit 0, TypeScript/ESLint | [step0-lint-final.txt](step0-lint-final.txt) |

6개 실행은 자료 지연/연타 1GET/empty/503/403/lead/동의/demo/실제 연결 끊김/재조회, 현재 후보 누락·중복·원칙 목록과 위조된 비원칙 ID의 POST 차단, 시작 연타 1POST·선택 동결·동일값 선택 후 동일 ID retry·선택 변경 새 ID·접수 뒤 중복 금지, source_unavailable 숨김/수동 재조회/선택 보존, 자료 실패·시작 실패/성공 지연 중 other/same/logout 이탈을 확인한다. 종료 뒤 늦은 안내/task/폴링 시작이 없다. 이미 시작한 POST가 서버 취소되었다는 의미는 아니다.

## 코드 관계·도구 공백

root가 구현 전 실제 실행한 Graft CLI는 Win32 tree-sitter-kotlin binding `ERR_DLOPEN_FAILED`, exit 1이다([graft-before.txt](graft-before.txt)). 자동 그래프가 만들어진 것으로 판단하지 않는다.

실제 import/호출을 수동 확인했다: App(workKey/onSeen) → WorkTab → WorkSalesReview → preload sales.sources/start/status → main `ipc.ts`의 sales:sources/start/status → `main/api/client.ts`의 Bearer/15초 timeout/세션 generation/strict parser → E14/E15/E16 routes. E14는 `lib/sales-review-sources.ts`의 loadSalesSourceCandidates, E15는 `lib/sales-source-review-start.ts`의 startSalesSourceReview → sales_source_review_inputs/request_sales_source_review RPC, E16은 같은 lib의 readSalesSourceReviewStatus → 본인 task 읽기다. SQL은 `0068_sales_source_reviews.sql`의 현재 원문/멱등 경로를 유지한다. 실제 실행한 API fixture는 기존 strict 계약을 통과했으며 실제 서버 SQL 권한을 대신 입증하지 않는다. Graft 자동 호출 그래프/영향 분석은 누락, 전체 post-Graft/Archify는 step2 담당이다.

## Step 1 인계

status/open은 임시 기존 흐름을 유지했다. 현재 interval에는 최소 unmount generation만 추가했으므로 단일 flight·오류 stop·5상태 한국어·not_found 수동 재검사·terminal 새 검토·현재 ready 재조회→open 성공→onSeen(current) 순서를 step1에서 완성해야 한다. `hidden`/reportError의 기존 not_found 전체 숨김과 현재 onSeen-before-open 코드는 교체 대상이다.

명시 새 검토는 acceptedTask/start/task/status/attempt를 함께 초기화해야 한다. 자료/선택을 그대로 보존할지 현재 설계대로 후보 재검사를 연결하되 선택별 ID는 새로 생성한다. generation은 화면 cleanup뿐 아니라 새 작업 세대 폐기에도 활용한다. 기존 25 Electron 회귀·root/desktop 전체 단위/SQL·독립 analyze/report는 step2 담당이며 이 step에서 실행했다고 기록하지 않는다. 기존 업로드/RecentWork는 바꾸지 않았다.

운영 앱 0.1.1·Resend SMTP/도메인 보류 상태는 그대로다. 이 step은 커밋/푸시/배포/설치를 수행하지 않았다.

## StrictMode 후속 보완 — step2 독립 검토에서 발견한 갭

step1 상태/열기 구현 후 개발 StrictMode의 effect setup→cleanup→setup에서 source 잠금은 남고 generation만 달라져 첫 pending 조회의 응답/finally가 폐기되는 문제가 확인됐다. source 소유권만 `sourcesActive` ref의 setup true/cleanup false로 바꿨다. replay는 같은 인스턴스의 진행 중 1개 read를 이어받고 실제 unmount는 이전 인스턴스를 false로 폐기한다. 시작/status/새 검토의 generation은 step1 구현을 그대로 유지했다. task 접수 후에는 source read가 허용되지 않으므로 terminal 새 검토와 pending source read가 겹치지 않는다.

기존 실제 HTTPS/Electron 테스트를 `SASU_DESKTOP_REACT_MODE=development`일 때만 개발 React renderer로 빌드하도록 확장했다. 테스트 전용 `desktop/tests/e2e/build-development-react.mjs`는 electron-vite의 renderer preset이 적용된 root에만 compile-time NODE_ENV define을 설정한다. main/preload/제품 build config/인증서/출처/IPC 규칙은 바꾸지 않았다. 정상 env-unset 테스트는 기존 production build 명령이다. 테스트 수 37개는 그대로이며 신규 별도 spec은 없다.

초기 child NODE_ENV만 지정한 시도는 electron-vite resolveConfig가 production으로 덮어써 bundleType 0/cleanup 0이었다([strict-fixture-mode.txt](strict-fixture-mode.txt)). nested renderer inline config도 실제 API가 flat Vite 옵션을 각 target에 병합하므로 적용되지 않았다([strict-fixture-inline-config.txt](strict-fixture-inline-config.txt)). 두 시도는 재현 fixture 준비 실패로 기록하고 제품 red로 계산하지 않는다. 설치된 electron-vite 구현을 읽고 test-only config plugin으로 renderer define을 적용한 다음 실제 개발 replay를 검증했다.

| 명령/관찰 | 결과 | 기록 |
|---|---|---|
| development opt-in, `npm run e2e -- followup.spec.ts --grep 'sales start 자료 조회'`, 보완 전 | exit 1: source 1 flight 뒤 503 오류가 렌더되지 않고 loading 유지 | [strict-red.txt](strict-red.txt) |
| DevTools test hook으로 실제 renderer/subtree 관찰 | bundleType 1, StrictEffects true, cleanupGeneration 1 — red/green 모두 | 위 red 및 아래 green 로그 |
| development opt-in, `npm run e2e -- followup.spec.ts --grep 'sales start'`, 보완 후 | exit 0, 6 PASS / 23.8s, 이탈/같은 탭/logout 포함 | [strict-green.txt](strict-green.txt) |
| desktop `npm run lint` | exit 0 | [strict-lint.txt](strict-lint.txt) |

DevTools hook은 테스트에서만 등록해 실행 증거를 관찰하며 제품에 runtime probe를 추가하지 않는다. 최종 production 37 전체 재검증은 development opt-in 없이 step2가 다시 수행한다. 이 부록은 앞선 step0 완료 시점의 인계 설명을 대체하지 않고, 그 뒤 발견한 갭과 보완 실행을 기록한다.
