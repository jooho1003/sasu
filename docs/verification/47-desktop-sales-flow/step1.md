# Step 1 완료 — 영업 상태·현재 결과 열기

2026-10-03 · branch `feat/desktop-sales-flow` · 기준 `12ad4d7`

## 변경

제품 변경은 `desktop/src/renderer/src/components/WorkSalesReview.tsx`다. step0의 후보·현재 distinct 원칙 검사·선택별 UUID·시작 ref 잠금·App workKey를 유지했다. status와 결과 열기는 공유 ref 잠금을 사용한다. queued/processing에서 5초마다 기존 E16을 단일 조회하며 다섯 상태를 한국어로 표시한다. 오류에는 자동 조회를 멈추고 오래된 상태/결과 링크를 숨긴다. task ID는 메모리에 남아 수동 ‘상태 다시 확인’으로 서버를 재검사한다. 성공 queued/processing이면 폴링을 다시 시작한다. 자동 폴링은 같은 일 맡기기 화면의 업로드/다른 작업 안내를 지우지 않으며 수동 상태 확인·열기 행동만 해당 안내를 비운다.

ready/refused/failed에만 ‘새 검토’를 제공한다. 명시적 초기화는 세대를 바꾸고 acceptedTask/task/status/error/시도 UUID/잠금/진행 상태를 초기화한다. 후보와 네 선택은 계속 사용할 수 있고 다음 시작은 새 request_id를 만든다. 결과 열기는 현재 E16 재조회 → ready만 기존 app.openWeb → 성공 뒤 onSeen(task_id,current) 순서다. 다른 상태는 한국어 상태만 반영하고 웹/읽음을 시작하지 않는다. 상태/웹 열기 오류는 읽음을 기록하지 않는다. 열기·읽음이 진행 중이면 ‘새 검토’도 잠금으로 차단한다.

각 status/open/seen await 뒤 세대를 검사한다. 다른 탭·같은 일 맡기기 탭 재클릭·로그아웃으로 폐기된 화면의 응답은 상태·안내·후속 웹 열기·읽음을 바꾸지 않는다. 이미 시작된 OS 열기/읽음 저장 자체를 취소한다는 뜻은 아니다. 기존 API/IPC/main/preload/SQL/권한·LLM·영구 저장 경계는 변경하지 않았다.

## 실행 기록

| 명령 | 실제 결과 | 기록 |
|---|---|---|
| desktop `npm run e2e -- followup.spec.ts --grep 'sales status 5초'` 구현 전 | exit 1, processing 한국어 안내 누락으로 1 failed | [step1-red.txt](step1-red.txt) |
| desktop `npm run e2e -- followup.spec.ts --grep 'sales status'` 첫 구현 | exit 0, 6 PASS / 1.2m | [step1-green.txt](step1-green.txt) |
| 같은 명령: 늦은 조회 성공/실패·OS 성공 전 미읽음·자동 안내 보존까지 포함한 최종 실행 | exit 0, 6 PASS / 1.4m, Electron production build 포함 | [step1-green-final.txt](step1-green-final.txt) |
| desktop `npm run e2e -- followup.spec.ts --grep 'sales start'` step0 회귀 | exit 0, 6 PASS / 16.7s | [step1-start-regression.txt](step1-start-regression.txt) |
| desktop `npm run lint` 최종 제품 코드 | exit 0, TypeScript/ESLint | [step1-lint-final.txt](step1-lint-final.txt) |

clock은 install/reload 후 pause하고 작업 interval을 등록했다. 최초 시간 경계 작성 때 실제 시간이 흘러 4,999ms 단정이 흔들려 pause를 추가한 다음, 제품의 한국어 상태 누락으로 red를 재현했다. 최종 테스트는 timer 설치 전 clock 초기화를 유지한다.

6개 신규 테스트가 4,999ms/5,000ms 조회 경계·지연 1flight·진행 및 terminal 한국어 5상태·terminal 폴링 종료·새 검토의 선택 보존/새 UUID, 503/404/403/실제 소켓 연결 끊김의 stop·수동 연타 1회·queued 재개·processing·not_found 후 ready 회복, 현재 processing의 미열기/미읽음·현재 not_found의 이전 ready 숨김·openWeb 실패의 미읽음·ready 열기 연타 1회·OS 성공 전 미읽음/성공 뒤 읽음·pending 새 검토 차단을 확인한다. 업로드의 형식 오류 안내도 자동 status poll 전후 유지된다.

other/same/logout 각 lifecycle 테스트는 status poll 성공/실패, 결과 열기 전 E16 성공/실패, 이미 시작한 OS 열기의 늦은 성공, 이미 시작한 읽음의 늦은 오류를 실행한다. 종료 뒤 상태/notice가 없고 E16 종료 뒤 새 웹/읽음을 시작하지 않으며 OS 종료 뒤 읽음을 시작하지 않는 것을 확인한다. 모든 오류/이탈 조합의 곱을 실행한 것은 아니다. OS 열기의 늦은 실패·읽음 저장의 늦은 성공은 별도 실행 사례 없이 공통 catch/current 및 App rememberSeen guard의 코드 대조 범위다.

## 코드 관계·Step 2 인계

step0의 [Graft 실행 실패와 수동 관계](step0.md)를 이어 실제 E16 route(`app/api/companion/sales-review/[taskId]/route.ts`), `readSalesSourceReviewStatus`, shared strict status parser, preload sales.status, main sales:status·app:openWeb, App rememberSeen을 대조했다. WorkSalesReview → E16(현재 lead/동의/비데모·본인 task) → 기존 출처 제한 app.openWeb → rememberSeen(current) 경계를 유지한다. 상태 오류는 사람의 수동 E16 read, terminal 새 검토는 사람의 새 E15 시도다. 5초 조회에는 자동 POST 재시작이 없다. Step 2 Archify에는 이 두 수동 회복 지점과 실패에서 폴링 정지, ready 확인 후 웹/읽음, cleanup 세대를 표시한다.

Graft post 실행·Archify 전체 흐름·기존 25개와 신규 12개를 포함한 전체 Electron·root/desktop 전체 단위/SQL·독립 analyze/report는 step2 담당이며 이 step에서 실행하지 않았다. API fixture는 합성 HTTPS 응답이며 실제 main/preload/renderer와 정확한 테스트 CA/안전한 Windows profile 정리를 사용한다. OS shell만 테스트에서 대체하므로 실제 고객 문서의 의미 정확도·운영 인증·실제 브라우저 설치를 입증하지 않는다.

운영 앱 0.1.1·`sasu@getsasu.com` 도메인/Resend SMTP 보류를 유지했다. 커밋·푸시·배포·설치는 수행하지 않았다.
