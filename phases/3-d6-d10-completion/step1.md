# Step 1: jobs-lease

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §3 패턴(jobs 워커) · §6 불변식
- `/docs/PRD.md` §6-11 아키텍처, §6-12 상태 전이표의 job 행
- `/docs/ADR.md` ADR-009, ADR-035 (마지막 bullet: "남는 running 작업의 복구는 lease 설계의 후속 범위")
- `supabase/migrations/0001_schema_v1.sql` jobs 테이블, `0003_claim_jobs.sql`
- `lib/jobs.ts`, `lib/worker.ts`, `tests/jobs.test.ts`, `tests/worker.test.ts`
- `scripts/verify-security-sql.mjs` (PGlite로 마이그레이션을 실제 실행하는 SQL 검증기)

## 작업

문제: `claim_jobs()`는 `queued`만 가져간다. 함수 타임아웃·프로세스 종료로 `running`에 남은 job은 영원히 회수되지 않는다.

1. 새 마이그레이션 `supabase/migrations/0016_jobs_lease.sql`
   - `jobs`에 `lease_until timestamptz` 추가(nullable).
   - `claim_jobs(p_limit int)` 교체: 후보 = `(status='queued' and run_after<=now())` **또는** `(status='running' and lease_until < now())`. claim 시 `status='running'`, `attempts=attempts+1`, `lease_until = now() + interval '5 minutes'`, `updated_at=now()`. `for update skip locked` 유지.
   - lease 만료로 회수되는 job의 `attempts`가 이미 최대치(3, `lib/jobs.ts`의 상수와 일치시켜라)면 claim하지 말고 같은 함수 안에서 `status='failed', last_error='lease_expired'`로 닫는다.
   - 권한: 기존과 동일하게 `service_role`만 execute.
   - 완료·재큐잉 경로에서 `lease_until`을 null로 되돌린다(`lib/jobs.ts`가 쓰는 update 또는 RPC).
2. `lib/jobs.ts`: 최대 시도 상수를 SQL과 한 곳에서 맞춘다(주석으로 마이그레이션 파일 참조). 핸들러 성공 후 완료 기록만 실패한 경우 재큐잉하지 않는 ADR-035 동작은 유지 — 이제 lease 만료가 그 job을 회수한다는 점을 핸들러가 멱등해야 하는 이유로 주석에 적는다.
3. 테스트 먼저:
   - `tests/jobs.test.ts`: 완료/실패 시 lease 해제 호출.
   - `scripts/verify-security-sql.mjs`에 검사 추가: (a) lease 만료 running job 재claim, (b) lease 유효 running job 미claim, (c) attempts 최대치 + lease 만료 → failed/lease_expired, (d) authenticated는 claim_jobs 실행 불가.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # 기존 19개 + 신규 검사 전부 PASS, failed 0
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트(ARCHITECTURE.md §2·§6, CLAUDE.md CRITICAL).
3. `phases/3-d6-d10-completion/index.json` step 1 갱신 (completed+summary / error / blocked).

## 금지사항

- 기존 마이그레이션 파일(0001~0015)을 수정하지 마라. 이유: 운영 DB에 이미 적용됐다 — 변경은 새 번호로만.
- 운영 DB에 `supabase db push`를 실행하지 마라. 이유: 운영 반영은 사람 리뷰(R1) 후 별도 승인 노드다.
- Edge Function·외부 큐를 도입하지 마라. 이유: ADR-009.
- 기존 테스트를 깨뜨리지 마라.
