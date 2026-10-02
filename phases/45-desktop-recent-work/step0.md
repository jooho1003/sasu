# step0 — 최근 맡긴 작업 UI

## 읽어야 할 파일

docs/PRD.md §3-8 DC-14·§8, docs/ADR.md ADR-084, docs/ARCHITECTURE.md §6-12,
docs/02-design/features/desktop-recent-work.design.md 전체,
desktop/src/renderer/src/App.tsx, components/WorkTab.tsx, desktop/tests/e2e/followup.spec.ts.

계층: renderer. 테스트를 먼저 추가해 누락 화면을 확인하고 App 공유 받은 일 요청과 RecentWork를 구현한다.
기존 API/SQL/IPC/작업 시작을 바꾸지 않는다. 권한 실패/탭 이탈/로그아웃 뒤 링크·읽음 금지.
AC: desktop에서 npm run e2e -- followup.spec.ts -g '최근 작업', npm run lint.
결과 기록: docs/verification/45-desktop-recent-work/verification.md.

## 완료 기록

RecentWork와 App 공유 갱신·발신 화면 읽음 세대 검사를 구현했다. E05/E16→기존 웹 인계/읽음 연결만 추가하며 main/server/SQL 계약은 유지했다. 구현 전 UI 누락 red 이후 신규 6건과 기존 12건 Electron PASS, desktop lint PASS. 합성 화면과 실패 수정 기록은 위 verification에 연결한다.
