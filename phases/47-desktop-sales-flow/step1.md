# Step 1: sales-status — 영업 상태·현재 결과 열기

## 읽어야 할 파일

- AGENTS.md, docs/AI-DEVELOPMENT.md §2~3
- docs/PRD.md §3-8 DC-16·§8, docs/ARCHITECTURE.md §6-12, docs/ADR.md ADR-086
- docs/01-plan/features/desktop-sales-flow.plan.md와 docs/02-design/features/desktop-sales-flow.design.md **전체**
- phases/47-desktop-sales-flow/index.json·step0.md 및 docs/verification/47-desktop-sales-flow/step0.md
- step0가 수정한 App.tsx/WorkSalesReview.tsx/followup.spec.ts **현재 전체**
- WorkTab.tsx/RecentWork.tsx·shared contracts·sales.status/openWeb/onSeen 실제 호출 경로와 E16 서버

## 작업

step0 완료 후 같은 작업트리/branch에서 순차 agent로 수행한다. 커밋/배포는 root에게 맡긴다. design U5~8, SC3~5를 대상으로 targeted red를 먼저 실행한 후 구현한다.

queued/processing 5초 single flight, 한국어 5상태, 오류에서 폴링 정지/수동 ‘상태 다시 확인’, 성공 진행 상태의 폴링 재개를 구현한다. terminal ready/refused/failed만 ‘새 검토’를 제공하고 명시적 초기화에서 새 시도 ID로 돌아간다. status not_found는 stale 상태/결과를 숨기고 task ID는 수동 재검사용으로 보존한다.

결과 열기 ref 잠금·현재 E16 ready 검사→기존 app.openWeb→성공 뒤 onSeen(id,current) 순서를 적용한다. 현재 상태가 달라졌으면 상태만 반영하고 링크/읽음 없음. status/open 중첩을 막고 조회/웹 열기 실패는 읽음 없음. 각 await/읽음의 현재 세대 검사·cleanup으로 탭 이탈/같은 work 재클릭/로그아웃 늦은 결과를 폐기한다. 이미 시작한 OS 열기/저장을 취소했다고 주장하지 않는다.

## 코드 관계와 구조 확인

step0의 Graft/수동 범위를 이어 WorkSalesReview→E16→app.openWeb→rememberSeen 현재 콜백을 대조한다. 새 구조 경계 없이 existing renderer에 구현한다. step2가 Archify 전체 흐름을 실제 실행할 수 있도록 구성/실패/사람의 수동 retry 지점을 summary에 남긴다.

## Acceptance Criteria

desktop에서 실행:

```powershell
npm run e2e -- followup.spec.ts --grep "sales status"
npm run e2e -- followup.spec.ts --grep "sales start"
npm run lint
```

신규 test 제목에 `sales status`를 포함한다. 단일 5초 polling·5상태·오류 stop/retry/restart·terminal 새 검토·not_found 재검사, ready/다른 상태/조회·openWeb 오류·연타1·열기 성공 뒤 읽음, status/open/읽음 늦은 탭·같은 탭·로그아웃을 실행한다. step0 회귀를 함께 통과한다. Electron clock은 interval 등록 전에 install하고 필요하면 reload하여 실제 5초 동작을 검사한다.

## 금지사항

새 API/IPC/DB·LLM/직접 인용 답·가시성 판단·업로드 보완·자동 작업 재시작/POST retry는 추가하지 않는다. source/current 권한은 기존 서버를 재조회한다. root/default build 환경을 제품 설정 변경으로 우회하지 않는다. 운영 0.1.1·메일 보류 유지.

## 산출물·완료 요약

docs/verification/47-desktop-sales-flow/step1.md와 red/green 로그에 변경/실행/실패 수정/다음 step 주의점을 기록한다. 실제 AC PASS 뒤 step1 completed/summary를 연결한다. step2는 두 step 요약과 현재 파일을 읽고 전체 검증·독립 분석을 맡는다.
