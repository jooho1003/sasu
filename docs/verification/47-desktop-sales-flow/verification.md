# 영업 검토 시작·진행 회복 검증

2026-10-03 KST · branch `feat/desktop-sales-flow` · 기준 `12ad4d7` · [설계](../../02-design/features/desktop-sales-flow.design.md)

## 변경과 실행 범위

App의 일 맡기기 nav key와 WorkSalesReview의 메모리 state/ref만 보완한다. 자료 로딩·오류·빈 상태·수동 재조회, 현재 distinct 원문 네 건과 원칙 검사, 선택별 request_id·시작 잠금, 진행 상태의 5초 단일 조회·오류 정지/수동 재개, terminal 새 검토, 현재 ready 재확인→웹 열기 성공→읽음 순서를 구현했다. 탭 이탈·동일 탭 재클릭·로그아웃 뒤 늦은 콜백은 현재 화면에 반영하지 않는다.

기존 E14/E15/E16·좁은 preload/main IPC·Bearer 사용자 클라이언트·공용 영업 lib·SQL의 원문/작업 권한과 멱등을 유지한다. 새 API/IPC/DB/LLM·직접 인용 답·승인/발송·영구 원문 캐시는 없다. step0/step1의 변경·red/green 실행은 [step0](step0.md), [step1](step1.md)에 있다.

## 전체 실행 기록

StrictMode 독립 검토 보완 뒤 정상 production 설정으로 desktop 체인을 다시 실행했고 모든 단계가 완료됐다. 실행 shell에서 `SASU_DESKTOP_REACT_MODE`와 `NODE_ENV` 오버라이드를 제거했다. 별도 development 검증 6개는 같은 테스트의 다른 React 모드 실행이며 production 37개의 고유 시나리오 수와 합산하지 않는다.

| 실행 | 실제 결과 | 기록 |
|---|---|---|
| desktop `npm run lint` 보완 후 | exit 0 | [desktop-lint.txt](desktop-lint.txt) |
| desktop `npm run build` 보완 후 | exit 0, electron-vite production | [desktop-build.txt](desktop-build.txt) |
| desktop `npm run test` 보완 후 | 12 files / 78 PASS, exit 0 | [desktop-test.txt](desktop-test.txt) |
| desktop `npm run e2e -- followup.spec.ts` 보완 후 | 신규 sales 12 + 기존 25 = 37 PASS / 3.8분, exit 0 | [electron.txt](electron.txt) |
| development opt-in `npm run e2e -- followup.spec.ts --grep 'sales start'` 보완 후 | 실제 React development/Strict replay, 6 PASS / 23.8초, exit 0 | [strict-green.txt](strict-green.txt) |
| root `npm run lint` | exit 0, 기존 ESLint warning 2·문구 warning 84·blocking 0 | [root-lint.txt](root-lint.txt) |
| root `npm run build` | exit 1, 기본 Turbopack의 외부 node_modules junction 거부 | [root-build.txt](root-build.txt) |
| root `npm run build -- --webpack` | exit 0, compile 3.9분·타입 검사 35.4초·정적 페이지 49/49 | [root-build-webpack.txt](root-build-webpack.txt) |
| root `npm run test` | 183 files / 1,834 PASS, exit 0 | [root-test.txt](root-test.txt) |
| `node scripts/verify-security-sql.mjs` | 316 PASS / 0 failed·권한 조합 2,016, exit 0 | [sql.txt](sql.txt) |

각 체인은 lint→build→unit→Electron 또는 SQL 순서로 실행했다. 독립 root/desktop 체인은 병렬 진행했으며 desktop build와 Electron 내부 build는 겹치지 않았다. root 기본 build의 junction 실패 때문에 제품 Next 설정을 바꾸지 않았다. 같은 worktree의 webpack production compile·타입·정적 페이지 생성으로 해당 환경의 빌드를 보완했다. 마지막 Strict 보완과 development build helper는 desktop 아래에만 있고 이후 root 제품 변경은 없다. root ESLint globalIgnores/tsconfig exclude/단위 include가 desktop을 제외하므로 root 체인은 이미 완료한 결과를 유지하고 desktop 체인만 재실행했다.

SQL은 기존 실제 마이그레이션을 isolated PGlite PostgreSQL/WASM에 적용한다. 본인 작업·현재 원문/원칙·권한 회수·기기 연결·멱등·교차 부서의 기존 실제 권한 검증을 재사용했다. pg_cron/pg_net을 제공하지 않는 0004 마이그레이션은 제외된다. 이 검증은 운영 DB 변경이나 실제 운영 인증 요청이 아니다.

## Electron 실행 증거

실제 Electron main/preload/renderer를 격리 프로필에서 합성 HTTPS Auth/API에 연결한다. 테스트에만 임시 CA와 정확한 localhost 인증서 신뢰를 사용한다. 제품 HTTPS/origin/인증서/IPC 제한은 바꾸지 않았다. shell.openExternal만 시험에서 대체해 호출 순서와 읽음을 검사한다. 이를 실제 OS 브라우저 탐색이나 고객 문서 정확도로 해석하지 않는다.

신규 12개 테스트의 실행 범위:

1. E14 지연·연타 1GET·로딩/empty 구분, 503→수동 reload→empty→후보, 403/lead/동의/demo/실제 소켓 연결 끊김을 확인한다. native label/select 네 개, 원칙 후보 제한, distinct 누락/중복과 위조된 비원칙 ID의 POST 차단·사라진 현재 후보 검사를 실행한다.
2. E15 연타 1POST, 시작 중 선택/자료 동결, 같은 선택·같은 값 change의 같은 request_id retry, 실제 선택 변경의 새 ID, 실패 때 선택 보존, task 접수 뒤 중복 시작 금지를 실행한다. source_unavailable 후보 숨김과 수동 E14 재검사 뒤 선택 보존도 확인한다. 자동 POST retry는 없다.
3. 자료/시작의 늦은 성공·실패를 other/same/logout 화면 종료에서 실행한다. 늦은 notice/task/새 폴링이 없다. 이미 서버에 보낸 POST의 취소를 뜻하지 않는다.
4. clock을 interval 등록 전에 install/reload/pause한다. 4,999ms에서는 조회 0회, 5,000ms에서 1회이고 지연 중 추가 10초에도 1flight다. queued/processing/ready/refused/failed 한국어, terminal 자동 조회 종료, 명시 새 검토의 선택 보존/새 ID를 확인한다. 업로드 오류 안내는 자동 status poll이 지우지 않는다.
5. E16의 503/404/403/실제 연결 끊김은 폴링 stop과 stale 상태/링크 숨김으로 끝난다. 수동 재조회 연타 1회, queued 성공 뒤 폴링 재개, processing, not_found→수동 ready 회복을 실행한다. task ID는 새 POST 없이 재검사한다.
6. 결과 보기 전 현재 E16 processing/not_found이면 웹과 읽음 0회다. 웹 열기 실패도 읽음 없음. ready에서 연타는 E16/OS 열기 1회, OS 성공 전 읽음 없음, 성공 뒤 읽음이며 pending 중 새 검토를 막는다.
7. status poll·열기 전 E16의 늦은 성공/실패, 이미 시작한 OS 열기의 늦은 성공, 읽음의 늦은 오류를 other/same/logout마다 실행한다. 종료 뒤 status/notice가 없고 후속 웹/읽음을 시작하지 않는다.

기존 25개는 결정함의 조회/처리/근거·선행 snapshot 폐기, 최근 작업 조회/현재 열기/읽음, 질문 이력/후속 질문/오프라인 암호화 발송, 세션 로그아웃/401 초기화, 기기 연결·설정 암호화·IPC 제한 회귀다.

## 화면 확인

신규 source/ready 테스트는 실제 panel 폭 380px와 `document.documentElement.scrollWidth <= clientWidth`를 검사하고 [선택 화면](screenshots/sales-form.png), [선택 section](screenshots/sales-form-section.png), [ready 화면](screenshots/sales-ready.png), [ready section](screenshots/sales-ready-section.png)을 저장한다. step2 agent와 root가 `view_image`로 선택 화면/ready section을 실제 시각 확인했다. 네 label/select·한국어 상태·재조회/시작/웹 결과/새 검토 버튼이 가로로 잘리지 않고 세로 scroll로 접근한다. 모든 오류/모든 선택 option의 별도 screenshot을 만든 것은 아니다.

## 실패·보완 기록

- step0 red는 자료 로딩 안내 누락, step1 red는 processing 한국어 안내 누락을 실제 재현했다. 각각 구현 뒤 6/6 green과 서로의 회귀를 통과했다. 초기 clock 경계는 pause 전 실제 시간 경과로 흔들렸고 fixture clock 초기화로 보완한 뒤 제품 누락 red를 따로 확인했다.
- 독립 검토는 React 개발 StrictMode의 mount→cleanup→setup replay에서 첫 sources ref 잠금과 이전 요청 세대가 영구 로딩을 만들 수 있음을 발견했다. [수정 전 production 37 PASS](electron-before-strict-fix.txt)는 이 replay를 입증하지 못한다. child NODE_ENV만 설정한 [첫 준비 시도](strict-fixture-mode.txt), nested renderer inline config의 [두 번째 준비 시도](strict-fixture-inline-config.txt)는 실제 개발 bundle이 아니어서 fixture 준비 실패로 분리했다. 테스트 전용 renderer config plugin을 적용하고 실제 bundleType 1·StrictEffects true·cleanupGeneration 1을 관찰한 [red](strict-red.txt)에서 단일 source 조회의 503 뒤 alert 없이 loading이 고정되는 제품 누락을 재현했다. sourcesActive setup/cleanup 소유권으로 replay는 pending 1개 read를 이어받고 실제 unmount는 폐기하도록 보완했다. 같은 actual development 실행은 [6 PASS](strict-green.txt), 이후 정상 production 전체는 [37 PASS](electron.txt)다. [수정 전 lint](desktop-lint-before-strict-fix.txt)·[build](desktop-build-before-strict-fix.txt)·[78 unit](desktop-test-before-strict-fix.txt)도 별도로 보존했다. 개발 helper/DevTools 관찰 hook은 테스트 전용이며 제품 build config·main/preload는 바꾸지 않았다.
- Graft는 사전/사후 모두 Win32 tree-sitter-kotlin native binding `ERR_DLOPEN_FAILED`로 exit 1이다. 자동 의존 그래프 성공으로 쓰지 않는다.
- 첫 Archify delivery는 legacy 930px 예산의 edge 가독성 warning 1건이었다([첫 delivery](archify-deliver-first.json), [첫 browser](archify-browser-first.json)). flow viewBox 폭을 1,500→1,200으로 줄여 최종 delivery warning 0을 확인했다. 변경 HTML에 같은 evidence out-dir을 재사용한 실행은 ownership-artifact-mismatch로 거부됐으며 [실패 receipt](archify-browser-path-conflict.json)를 보존하고 새 out-dir으로 재실행했다.

## Graft·Archify와 실제 코드 관계

Graft 실제 명령은 `node D:/바이브코딩/.sasu-graft-20260923/tool/node_modules/@nanonets/graft/dist/cli.js --version`이다([전](graft-before.txt), [최종 제품 보완 후](graft-after.txt), [Strict 보완 전의 post 기록](graft-after-before-strict-fix.txt)). 실제 import/호출을 수동 대조했다:

App(workKey/rememberSeen/current) → WorkTab → WorkSalesReview → preload sales.sources/start/status → main ipc sales:sources/start/status → ApiClient(Bearer·15초 timeout·세션 generation·strict parser) → E14/E15/E16 routes. E14는 loadSalesSourceCandidates의 현재 멤버/lead·동의·비데모/RLS 후보를 읽고, E15는 startSalesSourceReview→sales_source_review_inputs/request_sales_source_review RPC다. E16은 readSalesSourceReviewStatus의 본인 task RLS를 읽고 현재 부서 web_path만 반환한다. SQL 0068의 can_see/현재 원문 버전·원칙·멱등 검사를 유지한다. 결과 열기는 기존 출처 제한 app:openWeb→shell.openExternal 성공 뒤 App rememberSeen(task_id,current)→settings:markSeen으로 이어진다.

수동 대조에는 App/WorkTab/RecentWork 소비자와 이번 두 renderer·shared parser·preload/main·세 route·두 공용 lib·0068 SQL을 포함했다. Graft 자동 호출 그래프·자동 전역 영향 분석은 누락이다. 합성 endpoint 응답은 기존 strict parser를 통과하지만 실제 서버 권한의 증거는 별도 단위/SQL 실행이다.

Archify 3.0.1로 [flow.json](flow.json)의 현재 자료/선택·Strict 단일 read 소유권·선택별 멱등 시작·본인 작업 RLS·5초 단일 상태·오류 수동 retry·terminal 새 검토·현재 ready→웹→읽음·cleanup을 구조화했다. 최종 제품 보완 뒤 [최종 delivery](archify-deliver.json)는 9/9·오류/경고 0, [최종 browser-check](archify-browser.json)는 containment PASS·visualReview not-requested다. 형식/containment 검증은 기능 Electron 실행과 구분한다. HTML은 ignored `.vercel/desktop-sales-flow.html`이며 JSON/receipt로 재생성한다.

```powershell
node D:/바이브코딩/sasu/.vercel/desktop-core-archify/archify/bin/archify.mjs deliver architecture docs/verification/47-desktop-sales-flow/flow.json .vercel/desktop-sales-flow.html --json
node D:/바이브코딩/sasu/.vercel/desktop-core-archify/archify/bin/archify.mjs browser-check .vercel/desktop-sales-flow.html --json --out-dir .vercel/desktop-sales-flow-archify-strict-final
```

## 한계·운영 상태

OS 열기의 늦은 실패·읽음 저장의 늦은 성공은 별도 runtime 조합 없이 공통 catch/current·App rememberSeen guard의 정적 대조 범위다. 모든 오류/이탈 조합의 곱을 실행했다고 주장하지 않는다. 이미 시작한 POST/OS 열기/읽음 저장은 cleanup으로 취소할 수 없다. 임시 프로필은 resolve 후 검증된 tmp prefix 안에서만 비동기 rm/backoff로 정리한다.

실제 운영 세션·고객 자료 의미 정확도·Groq 호출·메일 수신·실기기 설치/OS 브라우저 탐색은 실행하지 않았다. 서버·DB·환경값·원문/토큰 로그를 새로 추가하지 않았다. 운영 앱/설치 파일은 0.1.1 유지, main 병합·운영 마이그레이션·배포·설치 게시 없음. `사수 / sasu@getsasu.com` 도메인/DNS/Resend SMTP 연결은 사용자 지시대로 보류한다.
