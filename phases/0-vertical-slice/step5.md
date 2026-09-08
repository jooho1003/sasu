# Step 5: llm-gateway

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` **§3.3 LLM 호출 지점은 하나** — 이 step의 명세다. strict json_schema 제약 3가지가 여기 있다
- `/docs/ARCHITECTURE.md` **§8**(`lib/llm.ts`는 **TDD 비대상**) · **§6 불변식 9**(로그 금지)
- `/docs/PRD.md` **§4 기술 스택**(모델 ID) · **§6-9 "로그에 남으면 안 되는 것"** · **§6-10 외부 의존성 표의 Groq 3행** · **§8-4 기술 제약** · **§8-5 비용**
- `/docs/PRD.md` **§6-1 `llm_calls` 테이블** — 기록할 컬럼의 원천
- `/docs/ADR.md` **ADR-011**(역할 분리) · **ADR-012**(structured output, 1.1 갱신 노트) · **ADR-020**(공동 키) · **ADR-028**(Groq 전환 — 트레이드오프 5개를 반드시 읽어라)
- 이전 step 산출물: `lib/contracts.ts`의 `toStrictJsonSchema()`(step 3) · `lib/supabase/service.ts`(step 4)

## 작업

`lib/llm.ts` 하나. **여기가 Groq을 부르는 유일한 지점이다.**

### 시그니처

```ts
export type LlmPurpose =
  | "classify" | "make_card" | "answer" | "summarize_meeting" | "generic_answer";

export type LlmResult<T> = {
  data: T;
  meta: { model: string; inputTokens: number; outputTokens: number; durationMs: number };
};

export const llm = {
  structured<T>(
    purpose: LlmPurpose,
    schema: z.ZodType<T>,
    prompt: { system: string; user: string },
    opts?: { deptId?: string; jobId?: string },
  ): Promise<LlmResult<T>>;
};
```

**호출부는 모델 ID를 모른다.** `purpose`가 모델을 고른다:

| purpose | 모델 |
|---|---|
| `classify` | `openai/gpt-oss-20b` |
| `make_card` · `answer` · `summarize_meeting` · `generic_answer` | `openai/gpt-oss-120b` |

모델 ID는 이 파일의 상수 두 개로만 존재한다. 다른 파일이 모델 이름을 알면 ADR-011의 역할 분리가 흩어진다.

### 호출 방식

Groq SDK(`groq-sdk`)의 chat completions에 `response_format: { type: "json_schema", json_schema: { name, schema, strict: true } }`. `schema`는 step 3의 `toStrictJsonSchema(name, zodSchema)` 결과를 그대로 넣는다.

시스템 프롬프트에는 **필드 순서를 명시적으로 요구하는 문장**을 넣어라(먼저 `citations`를 채우고 그다음 근거, 결론은 마지막). properties 순서가 생성 순서를 보장하지 않기 때문이다 (ADR-012 갱신 노트).

### 반드시 이 파일 안에서만 하는 것 5가지

1. **재시도** — 429·5xx·타임아웃은 지수 백오프로 최대 3회. 4xx(스키마·인증)는 재시도하지 않는다.
2. **스키마 불일치 재생성 1회** — 응답을 `schema.safeParse()`로 검증하고 실패하면 1회 재생성. 그래도 실패하면 `SchemaInvalidError`(`error_code: schema_invalid`).
3. **거절 판정** — Groq의 gpt-oss에는 `stop_reason: refusal`이 **없다** (ADR-028). 거절은 ① 파싱 결과의 `refused === true` ② `citations.length === 0` ③ 본문이 스키마 대신 거절 문장인 경우로 판정하고, 1회 재시도 후 `RefusalError`(`error_code: llm_refusal`).
4. **`llm_calls` 기록** — 매 호출마다 `purpose`·`model`·`input_tokens`·`output_tokens`·`cost_usd`·`duration_ms`·`dept_id`·`job_id`. service role 클라이언트로 insert한다. **기록 실패가 호출을 실패시키면 안 된다** — 기록은 best-effort로 감싼다.
5. **마스킹 확인** — 프롬프트(system + user)에 마스킹되지 않은 전화·이메일·주민번호·계좌 패턴이 남아 있으면 **호출 전에 throw**한다. 정규식은 step 7의 `lib/mask.ts`가 만들지만 이 step이 먼저이므로, 지금은 이 파일 안에 최소 패턴을 두고 step 7에서 `lib/mask.ts`로 옮겨 참조하도록 한다(그 이관은 step 7의 작업이다).

### 비용

Groq 단가는 아직 미확인이다 (PRD §10 #19). 단가 상수를 파일 상단 한 곳에 두고, 값이 없으면 `cost_usd`에 `null`을 기록한다. **추측한 숫자를 넣지 마라** — §8-5의 $100 상한을 잘못 계산하게 만든다.

### 로그

`console.log`로 프롬프트·응답 본문을 출력하지 마라. 남길 수 있는 것은 `purpose`·모델·토큰 수·소요 시간·에러 코드뿐이다 (ARCHITECTURE §6 불변식 9). 에러를 그대로 throw할 때도 메시지에 본문을 담지 마라.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
# 모델 ID가 이 파일 밖으로 새지 않았는가
grep -rn "gpt-oss" --include="*.ts" --include="*.tsx" . | grep -v "^./lib/llm.ts" | grep -v node_modules \
  && { echo "FAIL: 모델 ID가 llm.ts 밖에 있다"; exit 1; }
# Groq SDK 를 부르는 곳이 llm.ts 하나인가
grep -rn "groq-sdk" --include="*.ts" --include="*.tsx" . | grep -v "^./lib/llm.ts" | grep -v node_modules \
  && { echo "FAIL: llm.ts 밖에서 Groq SDK 를 부른다"; exit 1; }
# strict 모드로 부르는가
grep -q '"json_schema"' lib/llm.ts && grep -q "strict" lib/llm.ts || { echo "FAIL: strict json_schema 미사용"; exit 1; }
echo "OK: llm gateway"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다. API 키가 없어도 빌드·린트는 통과해야 한다(호출 시점에만 키를 읽는다).
2. 아키텍처 체크리스트:
   - Groq SDK import가 `lib/llm.ts` 한 곳뿐인가? (ARCHITECTURE §3.3)
   - 모델 상수 두 개가 이 파일 밖에 없는가?
   - 재시도·거절·스키마 불일치가 각각 다른 `error_code`로 구분되는가? (`llm_timeout` / `llm_refusal` / `schema_invalid` — PRD §6-1 `answers.error_code` 허용값)
   - 프롬프트·응답 본문을 로그에 남기지 않는가?
   - `llm_calls` insert 실패가 호출 결과를 뒤집지 않는가?
3. `phases/0-vertical-slice/index.json`의 step 5를 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 `llm.structured` 시그니처와 purpose→모델 매핑 (다음 step들이 이 시그니처만 보고 부른다)
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- 다른 파일에서 `groq-sdk`를 import하지 마라. 이유: 재시도·거절 처리·`llm_calls` 기록·마스킹 확인이 여기에만 있다 (ARCHITECTURE §3.3).
- 프롬프트나 LLM 응답 본문을 `console.log`·에러 메시지에 넣지 마라. 이유: Vercel 함수 로그에 남는다 (PRD §6-9).
- 추측한 토큰 단가를 상수에 넣지 마라. 이유: PRD §10 #19가 미확인이고, 틀린 단가는 $100 상한 판단을 망친다. 모르면 `null`이다.
- `.optional()`이 든 Zod 스키마를 그대로 넘기지 마라. 이유: strict 모드에서 400이 나거나 스키마가 무시된다 (step 3에서 이미 금지했다).
- 스트리밍 응답을 쓰지 마라. 이유: PRD §8-1 — 폴링으로 충분하고 SSE는 범위 밖이다.
- 이 파일에 단위 테스트를 붙이지 마라. 이유: ARCHITECTURE §8 — SDK 어댑터는 TDD 비대상이다.
- 기존 테스트를 깨뜨리지 마라.
