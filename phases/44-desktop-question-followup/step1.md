# step1 — 검증·PDCA 분석/보고

- 입력: docs/02-design/features/desktop-question-followup.design.md §8~11, step0 실행 결과.
- 계층: 검증/문서. outbox 부모 보존/4xx 미보관 회귀, SQL 질문 권한, desktop/root lint/build/unit과 Electron E2E.
- Graft 구현 전후 시도 및 Archify 흐름 산출물/자동 화면 검사 기록.
- bkit gap 분석(U1~U6/S1~S4) → 90% 미만 iterate, 90% 이상 report. 실행하지 않은 운영/메일 검증을 통과로 쓰지 않는다.
- 완료 기록은 verification.md, docs/03-analysis/desktop-question-followup.analysis.md, docs/04-report/features/desktop-question-followup.report.md.
- AC 실행: `cd desktop; npm run lint; npm run test; npm run e2e -- followup.spec.ts`; 루트 `npm run lint`, `npm run build`, `npm run test`, 질문 체인 SQL 하니스. 각 종료 코드를 따로 확인한다.
