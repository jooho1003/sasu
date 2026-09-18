# Step 5: bulk-lane

대량 수집이 실시간 작업(슬랙 분류·카드·답변)을 밀어내지 않도록 워커 레인을 나누고, 임베딩을 배치로 처리한다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-06), §6-11 아키텍처(워커·jobs), §8-4 기술 제약
- `/docs/ARCHITECTURE.md` 워커·jobs 절, "10배 규모에서 깨지는 곳" 표
- `/docs/planning/노션_전체수집_설계.md` §7
- `lib/jobs.ts`(claim·`MAX_ATTEMPTS`·`retryAt`·sweep), `supabase/migrations/0016_jobs_lease.sql`(`claim_jobs()`), `0004_worker_cron.sql`(pg_cron 호출), `lib/worker.ts`, `app/api/jobs/run/route.ts`
- `lib/embeddings.ts`(`embedText`), 임베딩 핸들러, `0030_source_lifecycle.sql`의 `complete_item_embedding`
- Voyage 공식 문서의 embeddings API 배치 상한(입력 개수·총 토큰) — 확인값과 확인일을 기록한다

## 작업

1. 레인: bulk kind = `notion_discover`, `notion_import`(소스에 `root_id`가 있는 것), `notion_poll`(step 6), `embed_batch`. 구현은 `jobs.lane text not null default 'realtime' check in ('realtime','bulk')` 컬럼 + `claim_jobs(p_limit, p_lane)`. 기존 시그니처 호출은 `realtime`만 claim한다. enqueue 시점에 lane을 정한다(SQL에서 넣는 job 포함 — step 3·4의 RPC 수정).
2. `/api/jobs/run?lane=bulk`: 기존 인증 그대로. 240초 시간 상한 안에서 claim(1회 25건)을 반복하고, 남은 시간이 30초 미만이면 새 claim을 하지 않는다. `maxDuration`은 300. pg_cron에 bulk 호출 1줄을 추가하는 migration(기존 realtime 호출은 그대로).
3. 429 처리: bulk lane job이 `retryAfterSeconds`를 가진 오류로 실패하면 `attempts`를 올리지 않고 `run_after`만 미룬다. 단 `created_at`에서 24시간이 지나면 일반 실패로 닫는다. realtime lane의 동작은 바꾸지 않는다.
4. 조직당 동시성: 같은 설치(워크스페이스)에 대한 노션 호출 job은 동시에 1개. `notion_installations`에 lease 컬럼 또는 advisory lock으로 구현하고, 못 잡으면 job을 5초 뒤로 미룬다(시도 횟수 미소모).
5. `embed_batch`(테스트 먼저): payload `{deptId}`. 같은 부서의 `embed_status='pending'`·`deleted_at is null`·소스가 `import_version=2`인 item을 최대 64개(그리고 확인한 토큰 상한 이내) 골라 Voyage 1회 호출 → item마다 `complete_item_embedding(item, version, vector, model)`. 버전이 바뀐 item은 그 RPC가 false를 돌려주므로 버린다. 남은 pending이 있으면 같은 job을 다시 예약한다. `lib/embeddings.ts`에 `embedTexts(inputs: string[], type)`를 추가하고 `embedText`는 이를 쓰도록 하되 기존 반환·오류 형태를 유지한다.
   - step 3에서 reference item마다 넣던 단건 `embed` job을 부서당 `embed_batch` 1건(dedupe key = deptId, 실행 중이면 재예약)으로 바꾼다.
6. 임베딩 입력 로그 금지(개수·길이·코드만).

## 코드 관계와 구조 확인

`claim_jobs` 호출자, `/api/jobs/run` 트리거 2곳(`after()`·pg_cron), sweep이 bulk의 장시간 job을 2분 만에 실패 처리하지 않는지를 확인해 `docs/verification/notion-collection/step5.md`에 적는다. 레인·재시도·기한을 구조도로 남긴다.

## Acceptance Criteria

```bash
npx vitest run tests/jobs*.test.ts tests/embeddings*.test.ts tests/pipeline/embed*.test.ts
npm run lint && npm run build && npm run test
```

로컬 실행 기록:
- bulk job 500건이 쌓인 상태에서 realtime job(분류 1건)의 대기 시간이 bulk가 없을 때와 같은 분 안에 처리된다.
- 기존 `/api/jobs/run`(lane 없음)이 bulk job을 1건도 claim하지 않는다.
- 429(`Retry-After: 30`) 3회 연속에도 `attempts`가 늘지 않고 최종 성공. `created_at`을 25시간 전으로 조작하면 실패로 닫힌다.
- `embed_batch` 실행 중 item 1개의 본문을 바꾸면 그 item만 pending으로 남고 나머지는 done.
- 기존 임베딩·검색 테스트 전부 통과.

## 검증 절차

AC → CRITICAL 점검 → `index.json` step 5 갱신. Voyage 배치 상한을 문서로 확인하지 못하면 배치 크기를 16으로 낮추고 그 사실을 기록한다.

## 금지사항

- realtime 레인의 claim 한도·재시도 규칙을 바꾸지 마라. 이유: 슬랙 3초 응답·카드 생성 경로의 검증 기록이 무효가 된다.
- `complete_item_embedding`의 버전 조건을 우회해 직접 update하지 마라. 이유: 느린 완료가 최신 본문을 덮어쓴다(ADR-052).
- Supabase Edge Function이나 외부 큐를 도입하지 마라. 이유: 런타임은 Next.js 하나다.
- 운영 pg_cron 변경·운영 DB 적용·커밋 금지.
