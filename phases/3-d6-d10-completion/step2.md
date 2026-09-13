# Step 2: write-boundaries

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §6 불변식 전부
- `/docs/PRD.md` §6-3 ③⑤⑨, §6-4 직접 기록, §6-9 권한 모델, §6-12 상태 전이표(결정 카드·결정·회의 행)
- `/docs/ADR.md` ADR-035 마지막 bullet(0015가 남긴 후속 범위)
- `docs/verification/quality-design-review.md` "권한 설계의 남은 검토"
- `supabase/migrations/0002_can_see_rls.sql`, `0012_answer_security.sql`, `0013_authenticated_write_boundaries.sql`, `0015_evidence_write_boundaries.sql`
- 쓰기 경로: `app/api/d/[dept]/cards/route.ts`(승격), `app/api/cards/[id]/decide/route.ts`, `app/api/d/[dept]/decisions/route.ts`(직접 기록), `app/api/d/[dept]/meetings/transcript/route.ts`, `app/api/slack/interactions/route.ts`, `lib/pipeline/card.ts`
- `scripts/verify-security-sql.mjs`, `tests/rls/`

## 작업

남은 구멍:
- (a) `decision_requests`·`conflicts`·`meetings`의 0002 FOR ALL 정책 → 부서 member가 카드 담당자·상태·visibility를 직접 update/insert할 수 있다.
- (b) 직접 기록 결정(`request_id=null`)은 leads_only item을 인용해도 `dept`로 취급되어 부서 전원에게 보인다. 결정 insert와 인용 insert가 원자적이지 않다.

1. 새 마이그레이션 `supabase/migrations/0017_card_decision_boundaries.sql`
   - `decision_requests`: authenticated는 **SELECT만**(`can_see` 기반 기존 판정 재사용). INSERT/UPDATE/DELETE 정책 제거.
   - `conflicts`: authenticated SELECT만. 쓰기는 service_role(워커).
   - `meetings`: authenticated SELECT + **lead의 INSERT만**(전사 업로드 라우트가 세션 클라이언트로 meeting row를 만든다면). UPDATE/DELETE 제거.
   - `decisions`에 `visibility text not null default 'dept' check (visibility in ('dept','leads_only'))` 추가. 기존 행 백필: `request_id` 있으면 카드 visibility, 없으면 인용 item들의 source visibility 중 가장 좁은 것.
   - 0012의 `decisions_source_boundary`·`recent_decisions_as`·`recent_channel_decisions_as` 등 결정 가시성을 `request_id is null → dept`로 추론하던 곳을 `decisions.visibility`로 교체. 판정은 `can_see()` 하나를 거친다(애플리케이션 복제 금지).
   - SECURITY DEFINER RPC (search_path 고정, `auth.uid()` 기반, anon 실행 불가):
     - `promote_item(p_item uuid) returns uuid` — 기존 승격 라우트가 하던 일(대상 item을 `can_see`로 볼 수 있는 부서 멤버만, `one_open_request_per_item` 멱등, make_card job enqueue 방식은 기존 코드 따름).
     - `decide_request(p_request uuid, p_action text, p_outcome text, p_rationale text) returns jsonb` — `p_action in ('decide','defer','reject','reopen')`. 담당자 또는 lead만(`reopen`은 lead만). 전이표(PRD §6-12) 밖의 전이 거부. decide는 `decisions` insert(`request_id unique` 멱등, 이미 결정됐으면 기존 결정 정보 반환) + 카드 citations 복사 여부는 기존 동작 유지 + `visibility = 카드 visibility`. 원자적.
     - `record_direct_decision(p_dept uuid, p_outcome text, p_rationale text, p_citations jsonb) returns uuid` — 부서 멤버만. `p_citations = [{item_id, quote}]`. 각 item은 호출자가 `can_see`로 볼 수 있어야 하고 `quote`가 item content에 포함돼야 한다(아니면 예외). `visibility` = 인용 item source들 중 가장 좁은 것(인용 0개면 dept). 결정 + citations 한 트랜잭션.
   - 슬랙 interactions(서명 검증 후 service role로 동작)는 담당자/lead 검증을 SQL로 넘길 수 있게 `decide_request_as(p_user uuid, …)`를 service_role 전용으로 두거나 기존 검증을 유지하되 같은 전이 규칙 함수를 공유한다. `dept_id`·`decided_by`는 인자가 아니라 세션/멤버십에서 결정.
2. 라우트 교체: 승격·웹 결정·직접 기록·슬랙 버튼이 위 RPC를 호출하도록 바꾼다. 응답 형태·한국어 문구는 유지. 이미 결정된 카드 문구("이미 {이름}이(가) {시각}에 결정했습니다 → 원장 #N") 유지.
3. `lib/pipeline/card.ts`의 recentDecisions visibility 계산을 `decisions.visibility` 컬럼으로 교체.
4. 테스트 먼저:
   - `scripts/verify-security-sql.mjs`: member가 decision_requests update(담당자 변경)·insert·delete 불가 / conflicts·meetings 직접 쓰기 불가 / 담당자 아닌 member의 decide 거부 / lead reopen 허용, member reopen 거부 / leads_only item 인용 직접 결정은 member 조회·`recent_decisions_as` 0건, lead 조회 1건 / 볼 수 없는 item 인용 거부 / quote 불일치 거부 / 인용 insert 실패 시 결정도 롤백 / decide 두 번 → 결정 1건 / 기존 2,016 매트릭스 유지.
   - 라우트 단위 테스트는 기존 패턴(`tests/*-route.test.ts`)을 따른다.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 체크리스트: `can_see()` 단일 판정 · 요청 경로 service role 금지(슬랙 서명 검증 경로 제외) · RLS USING + WITH CHECK · `dept_id`/`decided_by` 서버 결정 · 결정 append-only.
3. `phases/3-d6-d10-completion/index.json` step 2 갱신.

## 금지사항

- 가시성 판정을 TypeScript로 복제하지 마라. 이유: CLAUDE.md CRITICAL — 두 곳이면 어긋난다.
- 웹 사용자 경로에서 service role 클라이언트로 RPC를 우회 호출하지 마라. 이유: 필터 누락 한 줄이 유출이다.
- `decisions` UPDATE/DELETE 경로를 만들지 마라. 이유: 원장은 append-only(정정은 supersedes_id).
- 기존 마이그레이션 파일을 수정하지 마라 / 운영 DB에 push하지 마라. 이유: 운영 반영은 R1 리뷰 후 승인 노드.
- 게스트(`is_demo`) 읽기 정책을 깨지 마라. 이유: `/demo` 무쓰기·무LLM 보장(tests/e2e/guest.spec.ts).
