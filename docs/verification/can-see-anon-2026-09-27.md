# `can_see()` 비로그인 직접 실행 권한 — 2026-09-27

## 판단과 변경

- phase 23 step4-A의 선행 보안 항목이다. [9/18 운영 관측](processors-2026-09-18.md)에서 `anon`이 `can_see(uuid,uuid,text)`를 직접 실행할 수 있었다. 0002는 `PUBLIC` 권한만 회수하므로 `anon`에 직접 부여된 EXECUTE는 남는다.
- 0057은 `anon`과 `PUBLIC`의 직접 실행 권한을 회수한다. `authenticated`·`service_role` 권한과 유일한 가시성 판정 함수 본문은 바꾸지 않는다.
- SQL 하니스는 0002 직후 운영에서 관측된 직접 grant를 재현한다. 마이그레이션 추가 전 `anon can_see` 권한 단언이 `actual: true, expected: false`로 실패했고, 추가 후 보안 시나리오 243/243·권한 조합 2,016/2,016 통과했다. 하니스의 데모 비로그인 회고 조회도 포함된다.
- 실제 Supabase API 세션 회귀 테스트는 비로그인 직접 RPC 거부와 인증된 팀장의 정상 호출을 검사하도록 추가했다. 현 환경에 시드 계정 환경값이 없어 실행하지 않았다.

## 실행과 범위

- 격리 실행: `node scripts/verify-security-sql.mjs <임시 PGlite 설치 폴더>` — `passed=243`, `failed=0`, `assertions=2016`. `0004_worker_cron.sql`은 PGlite에 `pg_cron`·`pg_net`이 없어 제외했다.
- 저장소 검사: `npx tsc --noEmit`, `npm run lint`, `npm run test`(139개 파일·1,414개 테스트), 공개 Supabase 설정을 임시 값으로 둔 `npm run build`가 모두 통과했다. 린트의 기존 문구 경고 77건은 차단 항목 0건이다.
- 운영 Supabase 대시보드는 연결 시도 두 번 모두 시간 초과였다. 따라서 현재 운영 권한 재조회·0057 적용·실제 API 세션 검증은 아직 하지 않았다. 0055·0056도 운영 SQL로 적용됐지만 CLI 마이그레이션 이력에는 기록되지 않은 상태다. 연결 복구 후 이력과 함수 권한을 확인하고 0057을 적용해야 한다.
- Graft·Archify 실행 파일을 이 환경에서 찾지 못했다. 수동으로 `0002_can_see_rls.sql`의 grant, `0046_daily_retro.sql`의 데모 보안 정의 함수 경로, 보안 하니스의 호출·권한 검사를 확인했다. 새 실행 그래프·렌더링 결과는 없다. 함수의 제어 흐름과 제품 화면은 바뀌지 않는다.

운영 반영 전에는 `anon=false`, `authenticated=true`, `service_role=true`의 함수 EXECUTE와 비로그인 데모 조회를 실제 DB/API에서 재확인한다.

## 운영 적용 재시도 — 2026-09-27

- 사용자 요청으로 0057 운영 적용과 실제 API 재시험을 다시 시도했다. `npx supabase migration list`는 `ProjectRefNotLinkedError`였고, 로컬에 `SUPABASE_ACCESS_TOKEN`이나 연결 설정이 없다. Supabase MCP의 마이그레이션 목록·SQL 조회·테이블 목록은 모두 `Unauthorized`를 반환했다. 기존 로그인 브라우저 자동화도 시간 초과됐다.
- 따라서 운영의 0055·0056 마이그레이션 이력 및 현재 `can_see` 권한을 확인할 수 없었고, 0057도 적용하지 못했다. 실제 API 재시험도 수행하지 못했다. SQL 적용이나 이력 수정을 성공했다고 기록하지 않는다.
- 동일 커밋에서 격리 SQL 하니스를 재실행해 243/243, 권한 조합 2,016/2,016 통과했다. 이 결과는 운영 DB 권한의 증거가 아니다.
- 프로젝트 연결 후 0055·0056의 적용 내용과 이력을 먼저 대조하고, 필요하면 이력만 정합화한 다음 0057을 적용한다. 이후 DB 권한 행렬과 비로그인·인증 세션의 실제 RPC를 재시험한다.
