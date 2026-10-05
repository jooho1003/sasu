# step0 — 업로드 화면 복구

읽기: AGENTS.md, docs/AI-DEVELOPMENT.md, docs/PRD.md §3-8 DC-09·§8, docs/ARCHITECTURE.md §6-12, docs/01-plan/features/desktop-upload-recovery.plan.md, docs/02-design/features/desktop-upload-recovery.design.md 전체.

WorkReviewUpload와 별도 upload-recovery.spec.ts만 수정. 제품 구현 전에 합성 HTTPS/실제 main Electron red 실행을 기록한다. U1~7/S1~2의 준비·업로드·members·웹/읽음 current/ref 잠금과 초안 보존을 구현한다. App/WorkTab/main/server/API/DB/SDK 무변경. 기존 테스트 담당자와 build/Electron 슬롯 조율. Graft 사전 실제 실행과 수동 관계를 남긴다. green 뒤 docs/verification/48-desktop-upload-recovery/step0.md에 명령/결과/이탈 제한을 기록한다. 커밋/배포 없음.
