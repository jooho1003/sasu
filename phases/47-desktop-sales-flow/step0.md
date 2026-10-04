# Step 0: sales-start — 영업 자료·시작 회복

## 읽어야 할 파일

- AGENTS.md, docs/AI-DEVELOPMENT.md §2~3, .claude/commands/harness.md
- docs/PRD.md §3-8 DC-09·DC-16·§8, docs/ARCHITECTURE.md §6-12, docs/ADR.md ADR-086
- docs/01-plan/features/desktop-sales-flow.plan.md와 docs/02-design/features/desktop-sales-flow.design.md **전체**
- desktop/src/renderer/src/App.tsx, components/WorkTab.tsx, WorkSalesReview.tsx, RecentWork.tsx
- desktop/src/shared/contracts.ts·preload의 sales 계약·main sales API·기존 companion sales routes 및 공용 lib의 실제 경로
- desktop/tests/e2e/followup.spec.ts, desktop/playwright.e2e.config.ts
- docs/verification/46-desktop-decision-flow/verification.md (기존 25 회귀/Windows profile 정리)

## 작업

새 작업트리 D:/바이브코딩/sasu/.vercel/desktop-sales-flow, branch feat/desktop-sales-flow에서만 작업한다. 사용자 전체 phase 개발 승인에 따라 step0 서브에이전트가 수행하며 커밋/배포는 root에게 맡긴다.

먼저 followup.spec.ts에 sales fixture와 targeted 테스트를 추가해 현재 renderer의 누락 red를 실제 실행하고 로그를 남긴다. 그 후 설계 U1~4·U8의 자료/시작 부분만 App.tsx·WorkSalesReview.tsx에 구현한다. WorkTab onSeen의 기존 optional current 계약을 이용한다. App workKey로 같은 일 맡기기 탭 재클릭도 자식 cleanup을 실행한다.

자료 loading/empty/error/manual reload, current 4distinct/원칙 플래그 검사, synchronous ref start 잠금/시작 중 선택·자료 조회 동결, 선택 불변 request_id retry와 선택 변경 새 ID, task 접수 뒤 중복 시작 금지, 실패 선택 보존/자동 재전송 금지, source_unavailable 숨김/수동 자료 재검사를 구현한다. 자료/시작 await 후 세대 검사를 적용한다. status/open 최종 회복은 step1이 이어 구현한다.

## 코드 관계와 구조 확인

Graft 실제 실행으로 App→WorkTab→WorkSalesReview→sales IPC/main→E14/E15 공용 lib/SQL 관계를 확인한다. native 실행 실패면 실제 로그와 수동 파일/호출 대조 범위·누락을 적는다. 그래프 성공을 추정하지 않는다. 전체 Archify flow/실행 검증은 step2가 담당한다.

root가 실제 실행한 사전 docs/verification/47-desktop-sales-flow/graft-before.txt(ERR_DLOPEN_FAILED, exit 1)를 재사용한다. 같은 실패를 단순 반복할 필요 없이 현재 파일 수동 대조/누락을 연결한다.

## Acceptance Criteria

desktop에서 실행:

```powershell
npm run e2e -- followup.spec.ts --grep "sales start"
npm run lint
```

신규 test 제목에 `sales start`를 포함한다. 지연/empty/503/reload/권한 오류, 4distinct/후보/원칙, 연타 1POST·같은 선택 실패 retry 동일 ID·선택 변경 새 ID, 성공 후 중복 금지·source_unavailable 재검사, 자료/시작의 다른 탭/같은 탭/로그아웃 늦은 콜백을 실제 실행한다. 원래 실패 red와 최종 green을 보존하고 PASS를 확인한다.

## 금지사항

새 API/IPC/DB/모델·가시성 판단·service role·영업 승인/발송·원문 로그/영구 캐시를 추가하지 않는다. 업로드/RecentWork 기능을 고치지 않는다. 시작된 POST를 서버 취소했다고 주장하지 않는다. 운영 0.1.1·SMTP 보류 유지. 다른 작업트리/기존 phase 실행 자료를 덮어쓰지 않는다.

## 산출물·완료 요약

docs/verification/47-desktop-sales-flow/step0.md에 변경 파일·red/green 명령/exit 결과·Graft 관계/공백·다음 step 주의사항을 남긴다. 로그는 같은 폴더의 명확한 step0 이름을 사용한다. phase index step0 summary에 경로/핵심 동작을 연결하고 실제 AC 완료만 completed 처리한다. 다음 agent는 이 기록과 코드를 읽어야 한다.
