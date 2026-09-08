# Step 9: classify-pipeline

## 읽어야 할 파일

- `/docs/PRD.md` **§6-2 WATCH — 수집·분류 파이프라인** 전체. 특히 "LLM 분류" 항목의 confidence 임계와 실패 처리
- `/docs/ARCHITECTURE.md` **§4.1**(classify job이 하는 일) · **§3.2**(job 실패 처리) · **§8**(`lib/pipeline/*`는 **TDD 대상**)
- `/docs/PRD.md` **§6-1 `classifications` 테이블** · **§6-10 Groq API 장애 행** · **§6-12 "같은 정보가 두 곳에 있는 곳"**의 `classifications.label` ↔ 카드 존재 행
- `/docs/ADR.md` **ADR-011**(규칙 1차 → LLM 2차)
- 이전 step 산출물: `lib/contracts.ts`의 `Classification`(step 3) · `lib/llm.ts`의 `llm.structured`(step 5) · `lib/jobs.ts`의 `registerHandler`(step 6) · `lib/rules.ts`의 `classifyByRules`(step 7)

## 작업

**이 step은 TDD 대상이다.** `tests/pipeline/classify.test.ts`를 먼저 쓴다. `lib/llm.ts`와 Supabase는 mock한다.

### `lib/pipeline/classify.ts`

```ts
export async function classifyItem(itemId: string): Promise<void>;
export function registerClassifyHandler(): void;   // registerHandler("classify", ...)
```

흐름 (PRD §6-2):

1. `items`에서 항목을 읽는다. 없거나 `deleted_at`이 있으면 조용히 종료.
2. `classifyByRules({content, spokenAt, hasReplyWithin12h})`를 부른다.
3. **`isDecisionCandidate === false`면 LLM을 부르지 않는다.** 규칙만으로 `info` 또는 `chatter`를 정하고 `classifications`에 `method: "rule"`로 저장한 뒤 종료한다. 여기가 비용이 결정되는 지점이다 (ADR-011).
4. 후보면 `llm.structured("classify", Classification, {...})`. 프롬프트에는 **마스킹된 `content`**와 규칙이 걸린 이유(`reasons`)를 함께 넣는다. `method: "llm"`으로 저장.
5. **`confidence < 0.6`이면 카드로 자동 승격하지 않는다.** 대시보드에 "확인 필요"로 보이고 lead가 수동 승격한다 (step 11·13).
6. `label === "decision" && confidence >= 0.6`이면 `enqueue("make_card", {itemId})`.
7. 임베딩은 이 task의 범위가 아니다 — **`enqueue("embed", ...)`를 넣지 마라.** 핸들러가 없어 `unknown_kind`로 실패한다. `items.embed_status`는 `pending`으로 남겨 둔다(별도 task가 따라잡는다).

### 실패 처리

LLM 호출이 3회 백오프 후에도 실패하면 **항목을 버리지 않는다.** `classifications`에 `label: "unclassified"`로 저장해 대시보드의 "분류 대기 N건"에 남긴다 (PRD §6-2·§6-10). 이 갱신은 step 6의 job 실패 매핑(`classify` → `unclassified`)과 **같은 결과여야 한다** — 두 경로가 다른 상태를 쓰면 대시보드가 어긋난다.

### 재분류와 카드의 관계

`classifications`를 다시 쓰더라도 **이미 만들어진 카드를 건드리지 마라** (PRD §6-12). 카드는 자기 생명주기를 가진다.

### `deadline_hint`

LLM이 준 값보다 **규칙이 뽑은 `deadlineHint`를 우선**한다. 정량 신호는 규칙이 더 정확하다는 것이 ADR-011의 전제다. 둘 다 없으면 `null`이고 카드에 "마감 미정"으로 나간다.

### 4,000자 상한

슬랙 메시지가 4,000자를 넘으면 **저장은 전체, 분류는 앞 4,000자**만 보낸다 (PRD §6-10 표). 자르는 위치를 프롬프트에 명시하지 말고 그냥 잘라 보낸다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
npx vitest run tests/pipeline/classify.test.ts --reporter=verbose
# 아래가 테스트 목록에 실제로 있어야 한다:
#   - 규칙이 결정 후보로 잡지 않으면 llm.structured 를 호출하지 않는다
#   - 규칙이 잡으면 llm.structured 를 정확히 1회 호출한다
#   - confidence 0.5 는 make_card 를 enqueue 하지 않는다
#   - label=decision & confidence 0.8 은 make_card 를 enqueue 한다
#   - LLM 실패 시 label=unclassified 로 저장하고 항목을 버리지 않는다
#   - embed job 을 enqueue 하지 않는다
#   - 4,000자 초과 본문은 앞 4,000자만 LLM 에 보낸다
#   - deadline_hint 는 규칙 값이 LLM 값보다 우선한다
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 테스트가 구현보다 먼저인가? (TDD 훅)
   - `lib/llm.ts`를 통해서만 LLM을 부르는가? (`groq-sdk` import가 없는가)
   - 규칙이 1차, LLM이 2차인 순서가 지켜졌는가? (ADR-011)
   - LLM 실패가 항목을 버리지 않는가?
   - job 실패 매핑(step 6)과 이 파이프라인의 실패 처리가 같은 상태를 쓰는가?
3. `phases/0-vertical-slice/index.json`의 step 9를 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 `classifyItem` 시그니처, 등록한 핸들러, confidence 임계값
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- 규칙이 잡지 않은 항목을 LLM에 보내지 마라. 이유: ADR-011의 비용 구조가 무너진다. 하루 200건 전부를 LLM에 보내면 §8-5의 상한을 넘긴다.
- `enqueue("embed", ...)`를 넣지 마라. 이유: 임베딩 모델이 D2에 확정되지 않았고(ADR-018) 핸들러가 없어 `unknown_kind`로 실패한다. 별도 task의 몫이다.
- LLM 실패 시 항목을 삭제하거나 조용히 넘기지 마라. 이유: PRD §6-10 — 대시보드 "분류 대기 N건"에 남겨야 한다.
- `confidence < 0.6`인 항목을 카드로 자동 승격하지 마라. 이유: 오탐 카드가 담당자 DM으로 간다. 임계 조정 순서는 PRD §11에 정해져 있다.
- 재분류가 기존 카드를 수정·삭제하게 만들지 마라. 이유: PRD §6-12 — 카드는 자기 생명주기를 가진다.
- 프롬프트에 마스킹 전 본문을 넣지 마라. 이유: `lib/llm.ts`가 이걸 감지해 throw한다 (step 5).
- 기존 테스트를 깨뜨리지 마라.
