# Step 2: verification-report — 전체 회귀·독립 분석·보고

## 읽어야 할 파일

- AGENTS.md, docs/AI-DEVELOPMENT.md §2~3, bkit pdca analyze/report 스킬과 해당 templates
- docs/PRD.md §3-8 DC-16·§8·§11, docs/ARCHITECTURE.md §6-12, docs/ADR.md ADR-086
- desktop-sales-flow plan/design **전체**, phase47 index·step0/1 파일·실제 완료 summary
- App.tsx/WorkSalesReview.tsx/WorkTab.tsx/RecentWork.tsx·followup.spec.ts·실제 E14/E15/E16/공용 lib/SQL 계약
- docs/verification/46-desktop-decision-flow/verification.md (도구 실행 경로·worktree junction 제약)

## 작업

step1 완료 후 같은 작업트리에서 순차 agent로 수행한다. 제품 코드의 독립 분석은 구현 담당 이외 agent에게 bkit gap-detector 요구로 요청한다. 설계 U1~8/S1~2의 structural/functional/contract와 SC1~6의 runtime 증거를 분리 대조한다. 실제 실행 없이 통과/일치율을 추정하지 않는다. 90% 미만 또는 SC Critical 누락은 root에 구체적 보완을 전달하고 수정/재실행/재분석한 후 report한다.

## 코드 관계와 구조 확인

Graft 구현 전후 실제 명령/오류, 수동 App→WorkTab→WorkSalesReview→IPC/main→E14/E15/E16→공용 lib/SQL·onSeen 관계/누락을 기록한다. native binding 실패 시 그래프 생성 성공 대신 실제 수동 대조 범위를 명시할 수 있다.

Archify로 자료 조회→선택→멱등 시작→단일 상태 조회→오류 수동 retry/terminal 새 검토→현재 ready 재확인→웹 열기→읽음과 세대 종료를 구조화한다. 실제 deliver/browser-check 실행 명령·receipt·형식/containment 결과를 보관하고 기능 E2E 증거와 구분한다.

## Acceptance Criteria

desktop에서 순차 실행:

```powershell
npm run lint
npm run build
npm run test
npm run e2e -- followup.spec.ts
```

root에서 순차 실행:

```powershell
npm run lint
npm run build
npm run test
node scripts/verify-security-sql.mjs
```

기존 25 + 신규 모든 Electron이 통과해야 한다. root 기본 Turbopack 외부 junction 실패는 실제 실패 로그로 남기고 해당 환경 한정 `npm run build -- --webpack` production 빌드/타입/정적 페이지 생성으로 보완한다. 이 예외 때문에 제품 설정을 바꾸지 않는다. 단위·SQL 실제 권한 증거와 합성 API/Electron 실행을 구분한다. 380px 실제 화면 screenshot을 저장/검토해 상태/버튼/4select 접근과 overflow를 확인한다.

## 금지사항

운영 마이그레이션/배포/설치 게시·SMTP 연결·main 병합은 하지 않는다. Graft/Archify/테스트 실행을 추정하지 않는다. 합성 시나리오 PASS를 실고객 자료 정확도·실운영 인증/메일 수신 PASS로 쓰지 않는다. profile 삭제는 검증된 tmp workspace 경로만 사용한다.

## 산출물·완료 요약

- docs/verification/47-desktop-sales-flow/verification.md: 실제 명령/exit·최종 숫자·실패/수정 기록·스크린샷·도구/공백·운영 미반영/SMTP 보류
- 같은 폴더 flow.json·Archify receipts·전후 Graft·lint/build/unit/Electron/SQL 로그
- docs/03-analysis/desktop-sales-flow.analysis.md: 독립 10항목·SC1~6·가중 일치율·남은 범위
- docs/04-report/features/desktop-sales-flow.report.md: bkit report template·4관점 요약·검증/제약·다음 사항
- phase47 index step2 summary/completed 및 top-level phase 완료 상태는 root와 조율하고 실제 AC 완료 뒤 갱신한다. 커밋/초안 PR 생성은 root에게 맡긴다.

## 실제 완료 기록 — 2026-10-03

[Step 2 최종 요약](../../docs/verification/47-desktop-sales-flow/step2.md)과 [실행 검증](../../docs/verification/47-desktop-sales-flow/verification.md)을 작성했다. 최종 desktop lint/build/unit/Electron 체인은 모두 exit 0, 78 unit·기존 25+신규 12=37 Electron PASS(3.8분)다. 독립 G1 StrictMode 영구 로딩을 actual development red→자료 소유권 보완→6 PASS로 해결한 뒤 production 전체를 재실행했다.

root lint 0·기본 Turbopack 1(외부 node_modules junction)·webpack 0(compile/타입/정적 49/49)·1,834 unit PASS·isolated SQL 316/권한 2,016 PASS다. Graft 사전/최종 제품 후 actual native 오류와 수동 코드 경로/자동 그래프 누락을 기록했다. Archify 최종 deliver 9/9·오류/경고 0·browser containment PASS, 실제 380px source/ready screenshot·overflow/시각 확인을 연결했다.

독립 [analysis](../../docs/03-analysis/desktop-sales-flow.analysis.md)와 [report](../../docs/04-report/features/desktop-sales-flow.report.md)는 담당 agent 완료 상태와 최종 문서를 확인했다. U1~8/S1~2 10/10·API 3/3·SC 6/6, 대상 가중 100%다. OS 늦은 실패/읽음 늦은 성공 조합의 별도 runtime 미실행, 실제 운영·고객 정확도·메일/설치 미검증을 유지한다. 운영 앱 0.1.1·SMTP 보류이며 커밋/푸시/배포는 root에게 인계했다.
