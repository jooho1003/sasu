# step0 — 질문 이력·이어 묻기 UI

- 입력: docs/PRD.md DC-13, ADR-083, docs/02-design/features/desktop-question-followup.design.md (U1~U6).
- 계층: renderer. 기존 IPC/main/API/SQL 변경 없음.
- 실행: 합성 Electron 시나리오를 먼저 추가하여 누락 UI 실패 확인 → App/HistoryTab/AskTab 연결 → 같은 시나리오 통과.
- 완료: 실제 IPC에서 부모 ID/새 질문 null, 실패 초안 보존, 조회 상태/페이지, 탭 이탈/로그아웃 폐기를 확인한다.
- 기록: docs/verification/44-desktop-question-followup/verification.md.
- AC 실행: `cd desktop; npm run e2e -- followup.spec.ts -g '질문 이력'; npm run lint`.
