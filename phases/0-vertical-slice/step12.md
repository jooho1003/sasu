# Step 12: card-pipeline

## 읽어야 할 파일

- `/docs/PRD.md` **§6-3 DECIDE — 결정 카드** 전체 (①~⑨). 이 step은 ①~③과 ⑨의 승격 멱등까지다
- `/docs/PRD.md` **§6-4 충돌 감지** · **§6-1 `decision_requests`·`citations`·`conflicts` 테이블**
- `/docs/ARCHITECTURE.md` **§3.5 인용이 없으면 출력이 없다** · **§3.7 파생물은 원본 중 가장 좁은 것을 상속한다** · **§4.1 make_card job** · **§6 불변식 4·13** · **§8**(`lib/pipeline/*`는 **TDD 대상**)
- `/docs/ADR.md` **ADR-012**(필드 순서 + 1.1 갱신 노트) · **ADR-013**(인용 문자열 검증이 유일한 방어선 + 1.1 갱신) · **ADR-014**(가시성 상속)
- `/docs/PRD.md` **§11 DECIDE·LEDGER 행** — 완료 판정 기준
- 이전 step 산출물: `lib/contracts.ts`의 `CardDraft`(step 3) · `lib/llm.ts`(step 5) · `lib/jobs.ts`의 `registerHandler`(step 6) · `classifyItem`이 넣는 `make_card` job(step 9)

## 작업

**이 step은 TDD 대상이다.** `tests/pipeline/card.test.ts`를 먼저 쓴다. `lib/llm.ts`와 Supabase는 mock한다.

### `lib/pipeline/card.ts`

```ts
export async function makeCard(itemId: string): Promise<void>;
export function registerMakeCardHandler(): void;

// 아래 셋은 순수 함수로 분리해 테스트한다 — 이게 이 step의 핵심 로직이다
export function verifyCitations(
  citations: { itemId?: string; decisionId?: string; quote: string }[],
  sources: Map<string, string>,        // id → 원문
): { valid: typeof citations; dropped: number };

export function narrowestVisibility(vs: ("dept" | "leads_only")[]): "dept" | "leads_only";

export function resolveAssignee(args: {
  assigneeHint: string | null;
  members: { userId: string; displayName: string; role: "lead" | "member" }[];
  visibility: "dept" | "leads_only";
}): string;                            // user_id
```

### 흐름 (PRD §6-3)

1. **입력 수집** — 결정 후보 item + 부서 원칙 문서(`sources.is_principles`) + 원장 최근 결정 3건.
   **"임베딩 유사도 상위 5"는 이 task에서 제외한다.** 임베딩 컬럼이 없다(ADR-018). 대신 같은 소스의 최근 항목 몇 건과 원칙 문서를 넣는다. 유사도 기반 입력과 72h 병합(§6-3 ⑥)은 별도 task(`0b-embedding`)에서 붙인다. **여기서 임의의 유사도 대체 구현(키워드 검색 등)을 만들지 마라** — D3 게이트가 실패했을 때만 발동하는 대체안이고(PRD §8-2 ⓪), 지금은 판정 전이다.
2. **생성** — `llm.structured("make_card", CardDraft, {...})`. 프롬프트에 인용 가능한 원문을 `item_id`와 함께 넣고, 시스템 프롬프트에 "먼저 citations를 채우고 결론은 마지막에 쓴다"를 명시한다.
3. **인용 검증 — 이 step에서 가장 중요한 규칙**:
   - `item_id`/`decision_id`가 **실존**하는가
   - `quote`가 해당 원문에 **문자열로 포함**되는가
   - 실패한 인용은 **제거**한다
   - 0개가 되면 **1회 재생성**, 재실패면 `decision_requests.status = 'needs_review'`로 저장하고 **DM을 보내지 않는다** (task 0에는 DM 자체가 없지만, `send_slack`을 enqueue하지 않는다는 뜻이다)
   - LLM 심판(2차)을 만들지 마라 (ADR-013). 문자열 검증이 전부다
4. **visibility 계산** — 인용된 소스들의 visibility 중 **가장 좁은 것**을 `decision_requests.visibility`에 저장한다 (`leads_only` < `dept`). 카드 생성 시 한 번 계산하고, 이후 좁아지는 변경을 하지 마라 (ARCHITECTURE §3.7).
5. **담당자 결정** — `assignee_hint`가 멤버와 매칭되면 그 사람. 아니면 lead. **단 `visibility === 'leads_only'`이면 무조건 lead로 강제한다** (PRD §6-3 ③). 경영회의 내용이 담긴 카드가 팀원에게 가면 안 된다.
6. **충돌 감지** — LLM이 준 `conflicts[]`를 `conflicts` 테이블에 저장한다. `prior_decision_id`가 실존하는지 확인하고, 없으면 그 항목을 버린다. 결정 후 재검사·`confirmed` UI는 만들지 마라 (PRD §8-0).
7. **승격 멱등** — `one_open_request_per_item` partial unique가 같은 원본의 open 카드를 1장으로 막는다. 충돌하면 **에러가 아니라 기존 카드를 반환**하는 경로로 처리한다 (PRD §6-3 ⑨).
8. `enqueue("send_slack", ...)`를 **하지 마라.** task 1의 범위이고 핸들러가 없다. task 0의 카드는 웹에서만 본다.

### 병합은 이 task가 아니다

72시간·0.85 유사도 병합(§6-3 ⑥)은 임베딩이 필요하다. **하지 마라.** 슬랙 항목과 회의 항목이 각각 카드가 되는 것이 지금의 정상 동작이다(컷 ③의 대체 서사와 같다).

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
npx vitest run tests/pipeline/card.test.ts --reporter=verbose
# 아래가 테스트 목록에 실제로 있어야 한다:
#   - quote 가 원문에 없으면 그 인용을 제거한다
#   - 인용이 전부 제거되면 1회 재생성한다
#   - 재생성 후에도 인용이 0개면 status=needs_review 로 저장하고 send_slack 을 enqueue 하지 않는다
#   - narrowestVisibility 는 [dept, leads_only] 에 leads_only 를 준다
#   - visibility=leads_only 카드의 담당자는 assignee_hint 와 무관하게 lead 다
#   - 실존하지 않는 prior_decision_id 를 가진 conflict 는 저장하지 않는다
#   - 같은 origin_item_id 로 두 번 승격하면 카드가 1장이다
#   - embed / send_slack job 을 enqueue 하지 않는다
```

PRD §11 "DECIDE" 행 중 이 step이 담당하는 부분: **인용 링크가 원문으로 도달**할 수 있도록 `citations`에 `item_id`가 실제로 저장돼야 한다. `LEDGER` 행의 충돌 배지 근거(`conflicts` 행 생성)도 여기서 만들어진다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 테스트가 구현보다 먼저인가? (TDD 훅)
   - 인용 검증이 **문자열 포함**만 하는가? LLM 심판을 만들지 않았는가? (ADR-013)
   - visibility가 인용 소스의 최솟값인가? 병합이나 이후 변경으로 좁아지지 않는가? (ARCHITECTURE §3.7·불변식 4)
   - `leads_only` 카드의 담당자가 lead로 강제되는가?
   - `lib/llm.ts`를 통해서만 LLM을 부르는가?
   - 임베딩·병합·슬랙 발송을 만들지 않았는가?
3. `phases/0-vertical-slice/index.json`의 step 12를 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 `makeCard`·`verifyCitations`·`narrowestVisibility`·`resolveAssignee` 시그니처와 카드 생성 입력 구성
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- 인용 정합성 LLM 심판(2차)을 만들지 마라. 이유: ADR-013 — 문자열 포함 검증이 전부다.
- 인용이 0개인 카드로 DM·알림을 보내지 마라. 이유: ARCHITECTURE §3.5 — 인용 없는 문장은 렌더하지 않는다. `needs_review`로 대시보드에만 둔다.
- 카드 visibility를 나중에 좁히지 마라. 이유: 이미 DM된 카드의 근거가 사후에 좁아지는 드리프트를 원천 차단한다 (PRD §6-3 ⑥).
- `leads_only` 카드를 member에게 배정하지 마라. 이유: 경영회의 내용이 팀원 DM으로 간다 (PRD §6-3 ③).
- 임베딩·유사도 검색·72h 병합을 구현하지 마라. 이유: ADR-018 — 모델 미확정이다. 키워드 검색 대체안도 만들지 마라 — D3 게이트 실패 시에만 발동하는 강등 경로다 (PRD §8-2 ⓪).
- `enqueue("send_slack", ...)`·`enqueue("embed", ...)`를 넣지 마라. 이유: 핸들러가 없어 `unknown_kind`로 실패한다. 각각 task 1·별도 task의 몫이다.
- 결정 후 충돌 재검사나 `confirmed` UI를 만들지 마라. 이유: PRD §8-0에서 제외됐다.
- 기존 테스트를 깨뜨리지 마라.
