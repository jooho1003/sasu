# Step 1 — 검증 및 사용자 테스트 인계

PRD §11·ADR-051·step0를 기준으로 lint → build → test, 격리 SQL, 로컬 E2E를 실행한다.
실행 결과와 사용자 테스트 절차를 `docs/verification/slack-completion-2026-09-16.md`에 기록한다.
외부 Slack 설정(`message.im`, `im:history`)과 DB 마이그레이션 0029의 적용 순서를 명시한다.
운영 DB·배포·Slack 실발송·제출 여부를 로컬 검증 결과로 완료 처리하지 않는다.
