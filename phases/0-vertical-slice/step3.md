# Step 3: contracts-zod

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` **§3.6 계약은 `contracts.ts` Zod 단일 소스** · **§8 테스트 경계**(이 파일은 **TDD 대상**이다)
- `/docs/PRD.md` **§6-11 "컴포넌트 경계와 계약"** — `IngestItem`·`Classification`·`CardDraft`·`AnswerDraft`의 필드
- `/docs/PRD.md` **§6-2**(분류 스키마) · **§6-3 ②**(CardDraft) · **§6-5 ③**(AnswerDraft) · **§6-1 `meetings.summary`**(MeetingSummary)
- `/docs/PRD.md` **§8-4 기술 제약** — strict json_schema의 세 가지 제약이 여기 적혀 있다
- `/docs/ADR.md` **ADR-012**(structured output + 1.1 갱신 노트) · **ADR-028**(Groq 전환)
- 이전 step 산출물: `supabase/migrations/0001_schema_v1.sql`(step 1) — 컬럼 이름·허용값이 계약과 일치해야 한다

## 작업

**이 step은 TDD 대상이다.** `scripts/hooks/tdd-guard.sh`가 `tests/contracts.test.ts`가 없으면 `lib/contracts.ts` 생성을 차단한다. **테스트를 먼저 쓰고, 통과하는 구현을 쓴다.**

### 1. `tests/contracts.test.ts` (먼저)

검증할 것:
- 각 스키마가 정상 입력을 파싱하고, 필수 필드 누락·타입 불일치를 거부하는가
- `citations`가 최소 1개 required인가 (`CardDraft`·`AnswerDraft`)
- **`toStrictJsonSchema()`의 산출물이 Groq strict 요건을 만족하는가** — 이게 이 step의 핵심 테스트다:
  - 모든 object에 `additionalProperties: false`
  - 모든 object의 `required`가 `properties`의 키 전부를 포함 (optional 필드가 하나도 없어야 한다)
  - null이 정상인 필드는 `type: ["string","null"]` 같은 nullable union으로 표현
  - 중첩 object·array item에도 위 규칙이 재귀적으로 적용

### 2. `lib/contracts.ts` (그다음)

Zod 스키마 5개 + JSON Schema 변환기 1개.

```ts
export const IngestItem: z.ZodType<...>      // {source_id, external_ref, author_ext_id, author, spoken_at, content}
export const Classification: z.ZodType<...>  // {label, confidence, deadline_hint, assignee_hint, reasoning}
export const CardDraft: z.ZodType<...>       // citations 먼저 → background → recommendation
export const AnswerDraft: z.ZodType<...>     // citations 먼저 → answer → refused → refusal_reason
export const MeetingSummary: z.ZodType<...>  // {decisions[], deferred[], actions[]} 각 항목에 item_id 인용

export function toStrictJsonSchema(name: string, schema: z.ZodType): object
```

**필드 순서**: `citations`를 스키마의 첫 필드로 둔다. 다만 이건 강제가 아니라 관행이다 — json_schema의 properties 순서는 생성 순서를 보장하지 않는다 (PRD §8-4, ADR-012 갱신 노트). 순서는 스키마와 프롬프트 양쪽에 적고, 실제 방어는 step 12의 인용 문자열 검증이 한다. 주석으로 이 사실을 남겨라.

**nullable union**: `deadline_hint`·`assignee_hint`·`deadline`·`refusal_reason`처럼 null이 정상인 필드에 `.optional()`을 쓰지 마라. `.nullable()`을 써서 `["string","null"]`이 나오게 한다. 이유: Groq strict 모드는 모든 필드가 `required`여야 하고 optional을 허용하지 않는다 — optional을 쓰면 400이 나거나 스키마가 조용히 무시된다.

**허용값**: `label`은 `decision|action|info|chatter|unclassified`, `citations[].owner` 계열 값은 step 1의 SQL 주석과 일치해야 한다. 값을 새로 만들지 마라.

`toStrictJsonSchema`의 구현은 재량이다 — Zod v4의 `z.toJSONSchema()`가 있으면 그 결과를 후처리해 strict 요건을 채우고, 없으면 `zod-to-json-schema`를 의존성에 추가해 같은 후처리를 한다. **어느 쪽이든 위 테스트가 산출물을 검증한다.** 라이브러리가 무엇을 뱉는지 추측하지 말고 테스트로 확인하라.

### 3. 이 step에서 하지 않는 것

`lib/llm.ts`는 step 5다. 여기서는 스키마와 변환기만 만든다. Groq SDK를 import하지 마라.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

PRD §11 관련 행: 이 step은 "인용 없는 문장은 렌더하지 않는다"(ARCHITECTURE §3.5)의 스키마 쪽 절반이다. 아래가 테스트로 확인돼야 한다.

```bash
npx vitest run tests/contracts.test.ts --reporter=verbose
# 아래 케이스가 테스트 목록에 실제로 있어야 한다:
#   - citations 0개인 CardDraft 를 거부한다
#   - citations 0개인 AnswerDraft 를 거부한다
#   - toStrictJsonSchema 산출물의 모든 object 에 additionalProperties:false 가 있다
#   - toStrictJsonSchema 산출물에 optional 필드가 하나도 없다 (required == properties 키 전부)
#   - deadline_hint 가 null 을 허용한다 (nullable union)
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - `tests/contracts.test.ts`가 `lib/contracts.ts`보다 **먼저** 만들어졌는가? (TDD 훅이 강제한다)
   - 계약이 `lib/contracts.ts` 한 곳에만 있는가? 같은 타입이 다른 파일에 복제되지 않았는가 (ARCHITECTURE §3.6)
   - `.optional()`이 스키마에 하나도 없는가? (있으면 strict 모드에서 깨진다)
   - `label` 등 허용값이 step 1 SQL 주석과 일치하는가?
3. `phases/0-vertical-slice/index.json`의 step 3을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 export한 스키마 이름 목록과 `toStrictJsonSchema` 시그니처 (다음 step들이 이걸 그대로 쓴다)
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- 테스트 없이 `lib/contracts.ts`를 만들려 하지 마라. 이유: TDD 훅이 차단한다 (ARCHITECTURE §8, ADR-027).
- Zod 스키마에 `.optional()`을 쓰지 마라. 이유: Groq strict json_schema는 모든 필드가 required여야 한다 — null이 정상이면 `.nullable()`이다.
- `citations`를 optional이나 빈 배열 허용으로 만들지 마라. 이유: 인용 없는 출력은 존재해선 안 된다 (ARCHITECTURE §3.5).
- 같은 타입을 `lib/` 다른 파일이나 `app/`에 다시 선언하지 마라. 이유: 두 곳에 있으면 어긋나고, LLM 출력과 DB insert가 갈라진다.
- Groq SDK나 Supabase를 import하지 마라. 이유: 이 파일은 순수 계약이다. 의존성이 붙으면 테스트가 mock 없이는 안 돈다.
- 기존 테스트를 깨뜨리지 마라.
