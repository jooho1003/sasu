# Step 2: trailer-gate-jobs

## 읽어야 할 파일

- `/docs/ARCHITECTURE.md` §3.2 무거운 일은 job · §3.3 LLM 호출 지점은 하나 · §6 불변식 9 · §6-2 불변식 20 · §8
- `/docs/ADR.md` ADR-045 1항 · ADR-028(strict json_schema)
- `/docs/PRD.md` §8-4 기술 제약(Groq strict json_schema: required + nullable)
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-3 생성 입력·출력·발행 검사 · §L2 데이터 흐름 "예고편 생성"·"발행 검사" 행, 고칠 것 2·3·5·8 · §L3 "원칙 문서가 너무 김"·"사실집에 없는 fact"·"원문을 거의 그대로 복사"
- step 0·1 산출물: `supabase/migrations/0027_trailer_publish.sql`, `tests/fixtures/trailer-approval.json`
- `lib/contracts.ts`(`TrailerScenario`, `AgentRoleCriterion`, `toStrictJsonSchema`, Admin 계약), `lib/trailer.ts`(`validateScenario`), `lib/mask.ts`(`mask`, `MASK_PATTERNS`), `lib/llm.ts`(46~55행 `LlmPurpose`, 122~128행 모델, 130~139행 `assertPromptIsMasked`, 248~258행 거절 판정), `lib/jobs.ts`(7~19행 `JobKind`, 31~41·77~164행 `FAILURE_OWNER_MAPPINGS`, 49~50행·273~317행 스윕, 52~74행 `SAFE_ERROR_CODES`, 319행 `enqueue`), `lib/worker.ts`, `lib/features.ts`
- 기준 파이프라인: `lib/pipeline/agent-role.ts`와 `tests/pipeline/agent-role.test.ts`, 원칙 문서 로딩 `lib/pipeline/card.ts` 593~633행, `tests/worker.test.ts`

## 작업

새 `lib/` 모듈은 테스트를 먼저 쓴다.

### 1. `lib/features.ts`

`export function trailerPublishEnabled(env?): boolean` — `SASU_TRAILER_PUBLISH_ENABLED === "true"`일 때만 true.

### 2. `lib/trailer-gate.ts` (순수, TDD)

```ts
export type GateRule = "overlap" | "proper_noun" | "mask" | "schema";
export type GateViolation = { path: string; rule: GateRule };
export function trailerTextFields(scenarios: TrailerScenario[]): { path: string; text: string }[];
export function runTrailerGate(
  scenarios: unknown,
  input: { sourceTexts: string[]; properNouns: string[] },
): { passed: boolean; violations: GateViolation[] };
export function trailerApprovalItems(scenarios: TrailerScenario[]): { id: string; path: string; text: string }[];
```

- 경로 표기: `scenarios[0].title`, `scenarios[0].facts[2].text`, `scenarios[1].dialogues[0].quote` 등. 텍스트 필드 전부(제목·요약·사실 label/text·대화 question/quote·선택지 label·엔딩 quote).
- 겹침: 공백을 한 칸으로 정규화하고 앞뒤를 자른 뒤, 시나리오 텍스트와 입력 원문 사이에 **연속 20자 이상 같은 구간**이 있으면 `overlap`. 19자는 통과, 20자는 위반(경계 테스트 필수).
- 고유명사: 2자 이상 명사가 필드에 포함되면 `proper_noun`(라틴 문자는 대소문자 무시).
- 마스킹: `MASK_PATTERNS` 중 하나라도 맞으면 `mask`.
- 스키마: 배열이 아니거나 1~3개가 아니거나 `validateScenario`가 던지거나 시나리오 id가 겹치면 `schema`(경로 `scenarios` 또는 `scenarios[i]`). 스키마 위반이 있으면 나머지 검사는 건너뛴다.
- 결과에 원문 조각을 넣지 않는다. `{path, rule}`만.
- `trailerApprovalItems`의 id 순서·형식은 `tests/fixtures/trailer-approval.json`의 `expected_item_ids`와 같아야 한다(SQL `private.trailer_approval_item_ids`와 같은 규칙).

### 3. `lib/trailer-generation.ts` (순수, TDD)

```ts
export const DEFAULT_TRAILER_RUBRIC: AgentRoleCriterion[]; // 4개: principle_check · stakeholder_check · tradeoff · decision_clarity
export function selectPrincipleText(chunks: string[], limit?: number): string; // 순서대로 12,000자까지
export function buildTrailerGeneratePrompt(input: {
  scenarioId: string;
  decision: { outcome: string; rationale: string };
  cardTitle: string | null;
  principles: string;
  previousErrorCode?: string;
}): { system: string; user: string };
export function draftToScenario(scenarioId: string, draft: TrailerGenerationDraft): unknown;
```

- **입력 타입이 곧 경계다**: 결정의 `outcome`·`rationale`, 카드 `title`, 원칙 텍스트만 받는다. 슬랙·회의 원문(items 본문 중 원칙 소스가 아닌 것), 카드 `background`, 인용 quote를 받는 필드를 만들지 않는다(불변식 20).
- `user`에 들어가는 모든 텍스트는 `mask()`를 거친다. 이유: `llm.ts`가 마스킹되지 않은 프롬프트를 거부한다.
- `system` 규칙: 회사·인물·수치·제품명을 가상으로 바꾼다 · 입력 문장을 20자 이상 그대로 옮기지 않는다 · 대화·엔딩의 `quote`는 같은 시나리오 `facts[].text`의 부분 문자열 · `facts[].place`와 `dialogues[].place`는 계약의 enum · 선택지 2~5개 · 엔딩은 선택지 하나와 사실 하나를 가리킨다 · 합격·평가·정답 표현 금지.
- `previousErrorCode`가 있으면 오류 코드만 알려 준다(검증 메시지 원문·입력 조각을 되먹이지 않는다).

### 4. 계약 (`lib/contracts.ts`)

- `TrailerGenerationDraft`: LLM 응답용 느슨한 스키마. `TrailerScenario`와 같은 필드 구조지만 길이·정규식·배열 개수 제약을 두지 않는다(strict json_schema 호환). 모든 필드 required. 최상위 키 이름으로 `citations`를 쓰지 않는다(`llm.ts`가 빈 `citations` 배열을 거절로 본다).
- `TrailerGateReport`: `strictObject({ passed: boolean, violations: array(strictObject({ path: string, rule: enum })) })`
- step 1에서 키가 늘어난 `AdminOverview`에 `trailer_publish_enabled`, `published_trailers`를 추가한다.

### 5. job 두 개

- `lib/llm.ts`: `LlmPurpose`에 `"trailer_generate"` 추가(모델은 기본 120b).
- `lib/pipeline/trailer-inputs.ts`: `loadTrailerInputs(client, trailer)` — service client로 결정(`outcome`·`rationale`·`request_id`·`dept_id`·`visibility`), 카드 `title`, 원칙 소스(`is_principles`·`active`·`visibility='dept'`·같은 부서)의 items 본문(`deleted_at` null, 생성순)을 읽는다. 결정이 다른 부서이거나 `dept`가 아니면 `trailer_decisions_invalid`로 던진다(SQL 검사의 방어적 재확인).
- `lib/pipeline/trailer-generate.ts` — `registerTrailerGenerateHandler()`, job `generate_trailer` `{trailerId}`:
  1. 행이 없거나 `status !== "generating"`이면 아무것도 하지 않는다.
  2. 결정마다 순차로 `llm.structured("trailer_generate", TrailerGenerationDraft, prompt, { deptId })` 1회 → `draftToScenario` → `validateScenario`. 실패하면 오류 코드를 넣어 **1회만** 재시도, 그래도 실패면 `error_code: "invalid_scenario"`로 던진다. 전부 성공해야 다음으로 간다(설계 §L2 고칠 것 3).
  3. `update trailers set scenarios, status='checking' where id and status='generating' and updated_at=<읽은 값>` → 0행이면 종료(그 사이 재생성·삭제됨). 갱신된 `updated_at`을 받아 `enqueue("check_trailer_gate", {trailerId}, { dedupeKey: \`${id}:${updatedAt}\` })`.
- `lib/pipeline/trailer-gate.ts` — `registerTrailerGateHandler()`, job `check_trailer_gate` `{trailerId}`:
  1. `status !== "checking"`이면 종료.
  2. `loadTrailerInputs`로 원문(결정·카드 제목·원칙 텍스트, 마스킹 전·후 둘 다)과 고유명사(그 부서 멤버 표시 이름·조직명·부서명·그 부서 소스 제목·`banned_terms`)를 모은다.
  3. `runTrailerGate` → `rpc("record_trailer_gate", { p_trailer, p_report, p_passed, p_seen_updated_at })`. `"stale"`이면 행을 다시 읽어 여전히 `checking`일 때만 새 `updated_at`으로 재enqueue.
- `lib/jobs.ts`: `JobKind`에 두 종류 추가 · `FailureOwnerMapping.table`에 `"trailers"` 추가 · 두 kind 모두 `trailers`의 `status='failed'`, `status_reason=<errorCode>`로 매핑 · `SAFE_ERROR_CODES`에 `invalid_scenario`·`trailer_decisions_invalid`·`timeout` 추가 · 스윕에 `trailers`의 `generating`·`checking`이 `updated_at` 기준 **10분** 넘으면 `failed`·`timeout`.
- `lib/worker.ts`에 두 핸들러 등록, `tests/worker.test.ts` 기대 목록 갱신.
- 로그에 시나리오·원문·고유명사를 쓰지 않는다. trailer id·결정 수·오류 코드만.

### 6. 테스트

- `tests/trailer-gate.test.ts`: 19/20자 경계 · 공백 정규화 · 고유명사 · 마스킹 · 스키마 위반 시 다른 검사 생략 · 결과에 원문 없음 · 승인 항목 id가 골든 픽스처와 일치
- `tests/trailer-generation.test.ts`: 기준표 4개·가중치 1~5 · 원칙 12,000자 상한 · 프롬프트에 마스킹 전 이메일·전화번호 없음
- `tests/pipeline/trailer-generate.test.ts`(service client·`llm.structured`·`enqueue` 모킹): 결정 3건 → LLM 3회 · 첫 응답 무효 → 1회 재시도 후 성공 · 두 번 무효 → `invalid_scenario` · `status` 불일치면 LLM 0회 · 조건부 update 0행이면 enqueue 0
- `tests/pipeline/trailer-gate.test.ts`: `record_trailer_gate` 인자에 원문 조각 없음 · `stale` → 재enqueue 1회 · 상태가 바뀌었으면 재enqueue 0
- `tests/jobs.test.ts`: 10분 스윕 · 실패 매핑

## Acceptance Criteria

```bash
npm run test -- tests/trailer-gate.test.ts tests/trailer-generation.test.ts tests/pipeline/trailer-generate.test.ts tests/pipeline/trailer-gate.test.ts tests/worker.test.ts tests/jobs.test.ts tests/features.test.ts tests/contracts.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: LLM 호출이 `llm.structured` 하나뿐인가 · 생성 입력에 원시 발언·카드 배경·인용 quote가 들어갈 수 있는 경로가 없는가 · 해시를 TS에서 계산하지 않는가 · 새 job 종류가 워커 등록·실패 매핑·스윕 세 곳에 모두 있는가.
3. `phases/11-trailer-publish/index.json` step 2를 갱신한다.

## 금지사항

- 실제 Groq를 호출하는 테스트나 스크립트를 실행하지 마라. 이유: 실제 생성은 O11(승인)의 데모 스냅샷에서만 한다.
- Groq SDK를 `lib/llm.ts` 밖에서 부르지 마라. 이유: 재시도·거절·`llm_calls`·마스킹 확인이 거기에만 있다.
- 워커에서 `record_trailer_gate`를 거치지 않고 `gate_passed_hash`·`approval_hash`를 직접 쓰지 마라. 이유: 검사 통과 기록은 SQL 한 곳이다.
- 라우트·화면을 만들지 마라. 이유: step 3 이후 범위다.
- `lib/trailer.ts`의 `validateScenario` 동작을 바꾸지 마라. 이유: phase 7 합성 체험의 계약이다.
