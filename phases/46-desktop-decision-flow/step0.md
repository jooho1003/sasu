# step0 — 결정함 조회·처리 회복

읽을 파일: PRD DC-07/DC-15·§8, ADR-085, ARCHITECTURE §6-12,
docs/02-design/features/desktop-decision-flow.design.md 전체,
App.tsx/CardsTab.tsx/CardView.tsx, desktop/tests/e2e/followup.spec.ts.

설계가 입력이다. 먼저 실제 Electron 실행 테스트로 누락을 확인하고 renderer 3파일만 구현한다. 기존 E05/E09/E10·권한/원장/멱등/IPC 계약을 유지한다.
AC: 신규 Electron 조회/처리/이탈·읽음 사례와 desktop lint PASS. 결과는 docs/verification/46-desktop-decision-flow/verification.md.

## 완료 기록

구현 전 로딩 누락 red를 확인하고 renderer 3파일을 구현했다. 독립 검토가 선행 E05 스냅샷과 동일 탭 읽음 세대 누락을 발견하여 새 조회/nav key로 수정했다. 신규 7 + 기존 18 = Electron 25 PASS, desktop lint PASS. API/SQL 계약 무변경. 합성 화면·실행/실패/수정 로그는 verification에 연결했다.
