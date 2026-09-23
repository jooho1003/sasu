# 단일 페이지 발견 후속 수정 — 2026-09-23

기존 roots-discover 구현·검증 기록은 index.json과 docs/verification/notion-collection/에 보존한다.

실계정 연결 후 최초 page 범위가 database 커서로 시작해 원본을 등록하지 않는 문제와, 실행 중 발견 작업 때문에 미배정 집계 예약이 누락되는 문제를 재현했다. 두 회귀 테스트를 먼저 실패시킨 뒤 page 초기 상태와 후속 예약을 수정했다.

- 수정: `lib/pipeline/notion-discover.ts`, `tests/pipeline/notion-discover.test.ts`.
- 검증: Notion 관련 27개, 전체 단위 1,393개, lint·프로덕션 build/TypeScript 통과.
- 실제 Graft 수정 전·후 호출 관계, Archify 명세·HTML·실제 Chrome 측정·에이전트 화면 검토 완료.
- [실행 기록 및 운영 재검증](../../docs/verification/release-completion-2026-09-23/notion-fix/README.md).
- 공개 통합 OAuth·webhook 심사/인증 등 step8의 외부 조건은 기존대로 미완료다. 내부 통합 키 연결 성공으로 이를 대체하지 않는다.
