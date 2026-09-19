
### feat: 회고·커넥터·쉬운 말 구현 스냅샷 (6fdaaf9, 2026-09-19 18:52)
- vitest의 vi.mock 팩토리가 빠뜨린 named export(PLAIN_LANGUAGE_INSTRUCTION)는 접근 시점에 예외를 던진다 — 구현이 try/catch로 감싸면 error_code 없는 job_failed로 위장돼 4건이 연쇄 실패했다 (동시 세션이 lib 모듈 import를 늘리면 기존 테스트의 mock도 같이 늘려야 한다)
- 동시 세션이 next build 중이면 같은 .next를 쓰는 빌드가 "Another next build process is already running"으로 막힌다 → SASU_VERIFY_BUILD=1로 .next-verify를 쓰면 충돌 없이 검증 가능
