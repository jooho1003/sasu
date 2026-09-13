# Step 3: card-merge

## 읽어야 할 파일

- `/docs/PRD.md` §2-3 대표 시나리오(외주사 B 견적), §6-3 ⑥ 동일 안건 병합(전문), §6-12 "오병합" 행, §8-2 D6 판정 기록(컷 ③ 판정 기준), §11 DECIDE 행
- `/docs/ADR.md` ADR-030(Voyage voyage-4-lite 1024차원), ADR-036
- `/docs/ARCHITECTURE.md` §3·§6
- `lib/pipeline/card.ts` 전체(특히 `makeCard`, visibility 계산, `insertCard`)
- 임베딩 provider·embed job 모듈(`lib/` 아래 embedding 관련 파일 — grep `voyage`/`embed`)
- `supabase/migrations/0009_voyage_embeddings_search.sql`, `0012_answer_security.sql`, 직전 step의 `0017_card_decision_boundaries.sql`
- `tests/pipeline/card.test.ts`, `scripts/seed-demo.ts`

## 작업

PRD §6-3 ⑥: 새 결정 후보가 **최근 72시간 내 open 카드**와 유사도 **0.85 이상**이면 새 카드를 만들지 않고 기존 카드에 근거를 추가한다. **병합은 카드 visibility를 좁히지 않는다** — 새 후보 소스가 기존 카드보다 좁으면(후보 leads_only, 카드 dept) 병합하지 않고 별도 카드.

1. 새 마이그레이션 `supabase/migrations/0018_card_merge.sql`
   - `find_merge_target(p_dept uuid, p_query vector(1024), p_origin_visibility text, p_exclude_item uuid) returns table(request_id uuid, similarity real)` — `security definer`, **service_role만 execute**.
   - 후보 카드: `dept_id=p_dept`, `status='open'`, `opened_at >= now() - interval '72 hours'`.
   - 카드 유사도 = 그 카드의 `citations(owner_kind='decision_request')`가 가리키는 item들 중(`deleted_at is null`, `embedding is not null`, `id <> p_exclude_item`) `1 - (embedding <=> p_query)`의 최댓값.
   - 조건: 유사도 `>= 0.85` **그리고** (`p_origin_visibility='dept'` 또는 카드 `visibility='leads_only'`).
   - 유사도 내림차순 1건.
2. `lib/pipeline/card.ts`
   - 상수 `export const MERGE_WINDOW_HOURS = 72`, `export const MERGE_SIMILARITY_THRESHOLD = 0.85` (PRD §6-3 ⑥ 주석). 임계 변경은 ADR이 필요하다는 주석.
   - `makeCard` 초반, LLM 호출 **전에**:
     - origin embedding이 없으면 기존 embedding provider로 계산해 `items.embedding`·`embed_model`·`embed_status='done'`에 저장한다. 실패하면 병합을 건너뛰고 기존 경로로 계속(병합은 최적화이지 필수 경로가 아니다).
     - `find_merge_target` 호출. 대상이 있으면: 해당 카드에 `citations{owner_kind:'decision_request', owner_id, item_id: origin.id, quote: origin.content}`를 **없을 때만** insert(같은 owner+item 중복 금지 — 재실행 멱등). 새 카드 생성·LLM 호출·send_slack enqueue 모두 하지 않고 return.
   - 반환값 또는 로그로 `merged_into=<request_id>`를 남긴다(ID만, 본문 금지).
3. 멱등 보강: 같은 `(owner_kind, owner_id, item_id)` citation 중복을 막는 partial unique index를 0018에 추가(`item_id is not null`). 기존 중복 데이터가 있으면 인덱스 생성이 실패하므로 생성 전 중복 확인 쿼리를 주석으로 남기고, 운영 데이터에 중복이 없다는 가정이 틀리면 이 step을 `blocked`로 멈춘다(운영 DB는 조회만 가능 — `SUPABASE_DB_URL`로 `select` 1회 허용, 쓰기 금지).
4. 게스트 시드 `scripts/seed-demo.ts`: 데모 장면 3 카드(외주사 견적 류)가 **슬랙 item 1건 + 회의 전사 item 1건**을 함께 인용하도록 보장한다. 시드 실행은 하지 마라(운영 반영은 승인 노드).
5. 임계값 실측 스크립트 `scripts/measure-merge-similarity.ts`: 합성 fixture 쌍(같은 안건: 슬랙 질문 ↔ 회의 보류 발언 3쌍, 다른 안건 3쌍 — `fixtures/evaluation/` 아래 새 JSON)을 실제 Voyage로 임베딩해 코사인 값을 표로 출력. 한 번 실행해 결과를 `docs/verification/D6-merge-similarity.md`에 기록한다. **임계값은 바꾸지 마라** — 같은 안건 쌍이 0.85 미만이면 그 사실만 기록하고 summary에 적는다(판정은 사람).
6. 테스트 먼저(`tests/pipeline/card.test.ts`):
   - 대상 있음 → citation insert 1회, LLM 호출 0회, 카드 insert 0회, send_slack 0회
   - 대상 없음 → 기존 경로
   - origin leads_only + RPC가 대상 없음 반환 → 새 카드(visibility leads_only)
   - 같은 item 재실행 → citation 중복 insert 없음
   - embedding 계산 실패 → 병합 skip, 기존 경로
   - `verify-security-sql.mjs`: find_merge_target 72h 경계·0.85 경계·visibility 좁힘 거부·authenticated 실행 불가

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
npx tsx scripts/measure-merge-similarity.ts                         # 표 출력, docs/verification/D6-merge-similarity.md 생성
```

PRD §11 DECIDE: "슬랙 질문 1건 + 회의 보류 1건 → 카드 1장" — 위 단위 테스트 1번과 SQL 검사로 판정.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트: `llm.ts` 단일 호출점 · 인용 검증(병합 citation의 quote는 origin content 전체라 포함 조건 자명) · visibility 좁힘 금지 · 로그에 본문 없음 · service role은 워커 내부에서만.
3. `phases/3-d6-d10-completion/index.json` step 3 갱신. summary에 실측 유사도(같은 안건 최소값·다른 안건 최대값)를 포함.

## 금지사항

- 병합 판정에 LLM을 부르지 마라. 이유: PRD §8-0 — 병합 LLM 확인은 나중.
- 병합 시 기존 카드의 visibility·담당자·상태를 바꾸지 마라. 이유: 이미 DM된 카드의 파생값 드리프트 금지(§6-3 ⑥).
- 임계값·창 크기를 바꾸지 마라. 이유: PRD 수치 — 변경은 ADR 필요.
- 운영 DB에 쓰지 마라 / 시드를 실행하지 마라. 이유: 승인 노드.
