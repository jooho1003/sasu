# desktop-upload-recovery 검증

2026-10-04 · PRD §3-8 DC-09·§8 → ARCHITECTURE §6-12 → ADR-087.

현재 기능 구현·실행 검증·독립 분석·PDCA report는 완료다. 커밋·운영 게시·실제 업데이트는 root 릴리스 절차의 별도 결과다.

## 구현 범위

[plan](../../01-plan/features/desktop-upload-recovery.plan.md)→[design](../../02-design/features/desktop-upload-recovery.design.md)→[phase step0](../../../phases/48-desktop-upload-recovery/step0.md) 순서로 실행했다. 제품 파일은 [WorkReviewUpload](../../../desktop/src/renderer/src/components/WorkReviewUpload.tsx) 하나다. App workKey·세션 재마운트와 기존 members.list(E17), upload.review(E12 생성·비공개 Storage·E13 queue), origin 제한 app.openWeb·settings.markSeen을 재사용했다.

준비/업로드부터 ref 잠금과 입력·drop handler 동결, 현재 화면의 await 경계 검사, 접수 후에만 결과 링크, 실패 초안/동의 보존·수동 retry, openWeb 성공 뒤 current를 전달한 읽음, 참여자 loading/empty/error/retry·종류 세대를 구현했다. 같은 접수 초안의 재제출은 비활성이며 파일/종류/메타데이터 편집이 링크를 제거해 새 제출을 허용한다. 식별자 없는 전역 progress는 수신하지 않고 로컬 단계만 안내한다(구간별 Storage 상세 진행은 생략).

## 실행 결과

| 범위 | 명령/결과 | 근거 |
|---|---|---|
| 제품 변경 전 Electron red | upload-recovery.spec.ts 접수 전 링크/실패 링크/늦은 hash 3개 모두 실제 누락 재현, exit 1 | [red](step0-red.txt) |
| 제품 변경 후 Electron | `npm run e2e -- tests/e2e/upload-recovery.spec.ts --max-failures=1`, production 14 PASS·exit 0·1.1분 | [green](step0-green.txt) |
| 실제 개발 React | SASU_DESKTOP_REACT_MODE=development, members/hash/WAV 3 PASS·exit 0·15.6초 | [dev](strict-green.txt) |
| desktop lint | tsc+ESLint exit 0 | [lint](step0-lint.txt) |
| desktop production build | standalone `npm run build`, exit 0 | [build](desktop-build.txt) |
| desktop 단위 | `npm run test`, 12 files / 78 PASS·exit 0 | [unit](desktop-test.txt) |
| 변경 후 기존 질문/작업/카드/영업41 | 독립 담당 실행 간 고유41 PASS: 34+5+2. 단일 명령41 PASS 아님 | [41 시도](../44-desktop-question-followup/continuation-post48-electron-final.txt)·[남은7](../44-desktop-question-followup/continuation-post48-electron-last7.txt)·[마지막2](../44-desktop-question-followup/continuation-post48-electron-last2.txt) |
| root lint/build/unit | 최신 통합 main lint/build0·1834 PASS·현재 CSP7 PASS | [릴리스 검증](../desktop-release-2026-10-04/README.md) |
| SQL/RLS | 최신 isolated SQL316 / failed0·권한 matrix2016 | [SQL](../desktop-release-2026-10-04/sql.txt) |
| 실제 운영 guest | 5 PASS·읽기 전후 AI/DB 행 증가0 | [guest](../desktop-release-2026-10-04/production-guest.txt) |

dev hook이 실제 mounted view의 bundleType1·StrictEffects true·cleanupGeneration1을 관측했다. members 조회는 초기 document 이후 audio 전환의 update effect이므로 members request effect 자체의 setup/cleanup/setup을 직접 실행한 것으로 계산하지 않는다. 해당 dev 경로의 단일 요청·loading 종료·retry·종류 전환·현재 동의 참여자 WAV 제출은 실행했다.

## 사용자 흐름 근거

14개는 단순 DOM 존재 검사가 아니라 HTTPS fixture의 실제 main/preload/renderer 요청을 검증한다. 지연 queue 중 링크0·연타1·입력 동결; 503 실패 링크0·초안/동의 유지·자동 POST0·수동 retry; 웹 실패 읽음0·연타1; 업로드 완료 탭/같은 탭/로그아웃 폐기; 파일 read/hash·audio decode 이탈 후 POST0; 참여자 오류/empty/retry·종류 전환; 늦은 웹/읽음 후속 폐기; 실제 WAV/현재 참여자 계약; AudioContext.close 실패의 잠금 해제를 확인했다. 식별자 없는 fake global progress도 현재 UI에 표시되지 않는다.

[접수 화면](screenshots/upload-accepted.png)을 실제 Electron에서 캡처해 view_image로 제목/파일·가시성·동의·접수 후 링크를 확인했다. 가로 overflow 0 단언을 통과했다. 새로운 LLM/SQL/SDK 호출 경로를 추가하지 않았다.

## 실패·수정 기록

[최초 fixture TLS 실패](step0-fixture-tls.txt)는 Electron net verifier 등록 누락에 따른 link:create network 오류이며 제품 red 점수에 포함하지 않는다. loopback hostname·정확히 일치하는 테스트 인증서만 허용하는 기존 fixture 패턴으로 보완했다.

[첫 green 시도](step0-green-first-timeouts.txt)는 첫2개 자동화 timeout으로 중단했고 관련 Electron 프로세스0을 확인했다. 둘째 오류는 업로드 전 일 맡기기 nav 클릭의 performing action timeout이었다. 소유 panel show/focus·stage/teardown trace를 보완한 뒤 [첫case](step0-green-diagnostic.txt) 1 PASS·[둘째](step0-green-retry-diagnostic.txt) 1 PASS를 먼저 실행했다. 둘째 close0.8초/profile정리0.014초로 teardown 계약 문제는 재현되지 않았다. 행동 assertion/API timeout/자동 재시도 검사를 유지하고 외부 test 전체 budget만150초로 맞춘 뒤 최종14 PASS를 실행했다. 이전 실패를 최초 전체 PASS로 바꾸지 않는다.

## 코드 관계·구조 검토

Graft actual before/after query 모두 tree-sitter-kotlin native Win32 ERR_DLOPEN_FAILED·exit1: [전](graft-before.txt)·[후](graft-after.txt). 수동 관계는 App key/session→WorkTab→WorkReviewUpload→preload 좁은 capabilities→main IPC→ApiClient/storage-upload→기존 E17/E12/Storage/E13 및 서버 RLS까지 확인했다. 자동 전역 그래프는 미확보다.

Archify 최종 [flow](flow.json)의 명시 제출·비동기 준비/업로드·성공 웹/읽음·실패 초안/수동 retry·종료 current 경로를 실제 [deliver](archify-deliver.json)와 [automated-browser](archify-visual.json)로 검사했다. 최종9/9·오류/경고0·browser PASS이고 실제 2048px dark 캡처를 view_image로 읽어 가지·레이블·수동 retry 귀환을 확인했다. 초기 schema/type·node 관통·label 겹침·edge crossing receipts는 별도 이름으로 보존했다. HTML은 .vercel/desktop-upload-recovery.html이며 버전 관리 원천은 flow.json이다.

## 독립 분석과 남은 범위

desktop_verify의 [독립 분석](../../03-analysis/desktop-upload-recovery.analysis.md)은 U1~7/S1~2 설계 목록 9/9(100%), 기존 서버 계약 3/3 정적 일치와 SC1~5의 명시된 대표 실행 범위 충족을 확인했다. 추가 확실한 제품 gap이 없어 iterate 없이 [report](../../04-report/features/desktop-upload-recovery.report.md)·[step1](step1.md)·phase index를 완료했다. 실제 companion L1·가중 runtime overall·branch coverage는 미측정 N/A이며 설계100%로 대체하지 않는다.

독립 기존41 검증의 최초 screenshot/click 준비 timeout은 [첫 로그](../44-desktop-question-followup/continuation-post48-electron.txt)와 contexts에 보존했다. 지원된 합성 프로필 settings IPC의 panelPinned 및 소유 창 show/focus만 보완한 [진단4](../44-desktop-question-followup/continuation-post48-electron-diagnostic.txt)는 4 PASS였다. 이후 41 시도는 34 PASS/1 준비 click timeout/6 미실행, 남은7은 5 PASS/1 준비 click timeout/1 미실행, 마지막2는 2 PASS였다. custom login/polling이 준비 helper를 우회한 부분만 맞췄고 제품·행동 assertion·click timeout은 유지했다. 로그아웃 뒤 설정 초기화는 settings 쓰기 없이 native show/focus로 검증했다. 고유41은 실행 간 통과이며 하나의 전체 실행 성공이 아니다.

합성 Auth/API/Storage는 실제 main 경계와 renderer 행동 증거다. 실제 서버 Storage/RLS·권한은 기존 SQL/서버 검증과 구분하며 고객 자료/음성 의미 정확도·SMTP/실제 메일·신규 Windows 계정 녹화는 이 회귀로 완료 처리하지 않는다. 이미 시작한 서버/OS 행동은 취소할 수 없다. 현재 desktop0.1.2 패키지·게시·실제 업데이트 결과는 [통합 릴리스](../desktop-release-2026-10-04/README.md)가 별도 관리한다.
