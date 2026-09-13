# Step 4: conflict-relevance

## 읽어야 할 파일

- `/docs/PRD.md` §6-3 ①(원장 유사 결정 상위 3), §6-4 충돌 감지, §11 LEDGER 행
- `/docs/ADR.md` ADR-030
- `lib/pipeline/card.ts`(recentDecisions 조회·conflicts insert), embed job 모듈
- `supabase/migrations/0012_answer_security.sql`, `0017_card_decision_boundaries.sql`(decisions.visibility), `0018_card_merge.sql`
- 충돌 배지 렌더: `app/(auth)/d/[dept]/cards/[id]/page.tsx`, `components/ledger-s3.tsx`, `lib/slack/blocks.ts`, 데모 카드 페이지

## 작업

현재 카드 생성은 원장 결정을 **최근순 3건**만 LLM에 준다. PRD는 **유사 결정 상위 3**이다. 결정이 쌓이면 3월 결정과의 충돌을 놓친다.

1. 마이그레이션 `supabase/migrations/0019_decision_embeddings.sql`
   - `decisions`에 `embedding vector(1024)`, `embed_model text` 추가 + HNSW 인덱스(`where embedding is not null`).
   - `similar_decisions_for_card(p_dept uuid, p_query vector(1024), p_limit int) returns table(id, request_id, outcome, rationale, decided_at, visibility, similarity)` — service_role만. `supersedes`로 대체된 옛 결정은 제외(최신 행만).
2. 결정 임베딩: 결정 생성 경로(0017의 RPC들)가 끝난 뒤 `embed_decision` job을 enqueue하거나, 기존 embed job이 decisions도 처리하도록 확장한다(`outcome + "\n" + rationale`). `lib/worker.ts` 핸들러 등록 누락 금지. 기존 결정 백필 스크립트 `scripts/backfill-decision-embeddings.ts`(실행은 하지 마라 — 운영 반영 노드에서 실행).
3. `card.ts`: origin embedding(step 3에서 보장)으로 `similar_decisions_for_card(limit 3)`. 결과가 3건 미만이면 최근순으로 채운다(임베딩 없는 옛 결정 대비). 중복 제거. visibility는 `decisions.visibility` 사용.
4. 배지 문구: 카드·원장·슬랙 블록에서 충돌 배지를 `"{결정일 M월 D일} 결정과 충돌"` 형식으로(예: "3월 14일 결정과 충돌") + 해당 결정 원장 링크 + explanation. 결정일은 KST.
5. 테스트 먼저: 유사 결정 우선·3건 미만 채움·중복 제거·대체된 결정 제외(SQL)·배지 날짜 포맷(KST 경계)·authenticated 실행 불가(SQL).

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
```

## 검증 절차

1. AC 실행. 2. 체크리스트(`llm.ts` 단일 호출점 — 임베딩 호출은 기존 provider 모듈 경유 · can_see 단일 판정 · 로그 본문 금지). 3. index.json step 4 갱신.

## 금지사항

- 노션 원칙 item을 `conflicts.prior_decision_id`에 넣으려고 스키마를 바꾸지 마라. 이유: PRD §6-4는 원장 결정 대상, 원칙은 이미 카드 입력으로 들어간다.
- 백필 스크립트를 운영 DB에 실행하지 마라. 이유: 승인 노드.
- 기존 마이그레이션 파일 수정 금지.
