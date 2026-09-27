# ASK F2 검색 함수 운영 DB 확인 — 2026-09-27

- 대상: Supabase `sasu` 운영 프로젝트 `fzpnidoyhejrmhymggpp`, SQL Editor, 2026-09-27 약 02:06 UTC.
- 적용 전 `pg_proc` 조회: `search_topic_items_as` 없음.
- 마이그레이션 0055의 `create or replace function`·`revoke`·`grant`를 한 트랜잭션으로 실행: `Success. No rows returned`.
- 적용 후 `to_regprocedure` 존재 `true`, 함수 실행 권한은 `authenticated=true`, `anon=false`.
- 읽기 전용 `DO` 검사 성공: 파일럿 팀장 ID의 상태 질문 안건 단어 검색 상위 8개에 9/15 보류 항목이 포함됐다. 팀장 전용 합성 항목은 팀장 `user` 범위에서만 반환됐고, `channel`·일반 팀원·타인 ID 사칭 경로에서는 반환되지 않았다. 검사에서는 세션 JWT claim을 임시로 바꿨으며 지속 데이터는 수정하지 않았다.
- `tests/rls/rls.test.ts`의 API 세션 기반 자동화 검사는 DB 환경값이 없어 미실행이다. Supabase CLI도 로그인·프로젝트 연결이 없어 `supabase_migrations` 이력에는 0055가 기록되지 않았다. 추후 CLI `db push`가 0055를 다시 실행할 수 있도록 함수 정의는 `create or replace`로 유지한다.

이 검사는 검색·권한 경계의 SQL 실행 결과다. Groq 문단 선택과 웹 답변 결과는 코드 운영 배포 후 재시험한다.
