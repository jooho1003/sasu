# Step 1: assessment-scoring

## 읽어야 할 파일

- `/docs/PRD.md` §8-4(strict json_schema) · §11 "합성 채점 (ADR-045)" 행 · §11 "부서 역할 (ADR-038)" 행(같은 점수 규칙)
- `/docs/ARCHITECTURE.md` §3.3 · §3.5 · §6-2 불변식 21
- `/docs/ADR.md` ADR-038(점수식: 전체 가중치 분모, 근거 없음 0점) · ADR-045 4항
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-2 `events[]` · §C-4 채점 프롬프트·검증 ①~④·금지어 · §L3 "채점 결과에 합불·추천 표현" · §L5 3
- step 0 산출물: `supabase/migrations/0028_trailer_assessment.sql`
- `lib/agent-role.ts`(6~12행 `AGENT_ROLE_SYSTEM_GUARD`, 17~25행 `VerifiedCriterion`, 109~120행 `weightedScore`), `tests/agent-role.test.ts`, `lib/pipeline/agent-role.ts`(파이프라인 패턴)
- `lib/contracts.ts`(`TrailerScenario`, `AgentRoleCriterion`), `lib/trailer.ts`, `lib/trailer-generation.ts`(`DEFAULT_TRAILER_RUBRIC`), `lib/llm.ts`(`LlmPurpose`, 거절 판정 248~258행), `lib/jobs.ts`, `lib/worker.ts`, `lib/features.ts`, `lib/mask.ts`

## 작업

새 `lib/` 모듈은 테스트를 먼저 쓴다.

### 1. 플래그 (`lib/features.ts`)

`export function trailerScoresMode(env?): "off" | "scores" | "full"` — `SASU_TRAILER_SCORES_MODE`. 정확히 `scores`·`full`일 때만 그 값, 나머지는 `off`. `scores`는 기준별 점수·근거만, `full`은 면접 확인 질문까지(컷 ①).

### 2. 계약 (`lib/contracts.ts`)

- `TrailerAttemptEvent = strictObject({ seq: int ≥ 1, kind: enum("open_fact","ask_dialogue","choose","submit"), ref: TrailerId })` — 이동·시간·좌표 필드 없음(설계 §C-2).
- `TrailerAttemptSubmission = strictObject({ scenario_id, choice_id, reason (1~1000자), fact_ids, events: array(TrailerAttemptEvent).max(200) })`
- `TrailerScoreDraft`(LLM 응답, strict json_schema 호환 — 길이·정규식 제약 없음, 모든 필드 required, null이 정상인 필드는 nullable): `{ criteria: [{ key, score: int|null, rationale: string|null, evidence: [{ scenario_id, kind: "reason_quote"|"event"|"fact", quote: string|null, seq: int|null, fact_id: string|null }] }], interview_questions: [{ question, basis: [{ scenario_id, kind: "reason_quote"|"event"|"fact"|"unchecked_dialogue"|"unchecked_fact", ref: string|null, quote: string|null, seq: int|null }] }] }`. 최상위에 `citations` 키를 두지 않는다(`llm.ts`의 거절 판정).
- `TrailerAttemptResult`(저장용 strict): `{ rubric_snapshot: AgentRoleCriterion[], criteria: [{ key, label, weight, score: int|null, rationale: string|null, evidence_status: "ok"|"no_evidence", evidence: [...] }], interview_questions: [...] }` — 합격·추천·순위 필드 없음.

### 3. `lib/trailer-assessment.ts` (순수, TDD)

```ts
export const ASSESSMENT_FIXED_COPY: readonly string[]; // 화면 고정 문구(금지어 검사 예외 목록)
export const ASSESSMENT_FORBIDDEN_WORDS: readonly string[]; // 합격, 불합격, 탈락, 추천
export function validateAttemptSubmissions(scenarios: TrailerScenario[], submissions: unknown): TrailerAttemptSubmission[]; // 실패 시 error_code "attempt_invalid"
export function uncheckedRefs(scenario: TrailerScenario, submission: TrailerAttemptSubmission): { dialogueIds: string[]; factIds: string[] };
export function verifyTrailerScore(
  draft: TrailerScoreDraft,
  input: { rubric: AgentRoleCriterion[]; scenarios: TrailerScenario[]; submissions: TrailerAttemptSubmission[] },
): TrailerAttemptResult;
export function buildTrailerScorePrompt(input: { rubric; scenarios; submissions }): { system: string; user: string };
```

- **점수 근거로 인정하는 것은 ①~③뿐**: ① `reason_quote` — `quote`가 그 시나리오 제출 `reason`의 부분 문자열 ② `event` — `seq`가 그 제출 `events`에 존재 ③ `fact` — `fact_id`가 그 제출 `fact_ids`에 존재. `scenario_id`가 제출에 없으면 무효.
- ④ 확인하지 않은 대화·사실(`uncheckedRefs`)은 **면접 확인 질문의 근거로만** 인정한다. 점수 근거에 들어오면 무효 처리한다.
- 기준: 모르는 key·중복 key는 버린다. `score`·`rationale`이 null이거나 유효 근거가 0개면 `no_evidence`(점수는 null로 저장, 총점에서 0점 반영). 기준표의 모든 key가 결과에 한 번씩 나타나게 채운다(모델이 빠뜨린 기준은 `no_evidence`).
- 금지어 사후 검사: `rationale`에 `ASSESSMENT_FORBIDDEN_WORDS`가 있으면 그 기준을 `no_evidence`로 바꾸고 `rationale`을 null로. 면접 질문에 있으면 그 질문을 버린다. **모델 출력에는 예외가 없다.** `ASSESSMENT_FIXED_COPY`는 화면 상수 전용 예외 목록이다.
- 면접 질문은 유효 근거가 1개 이상인 것만 남긴다.
- `buildTrailerScorePrompt`: `system` = `AGENT_ROLE_SYSTEM_GUARD` + 예고편 규칙(근거 형식 ①~④의 의미, 합격·탈락·추천·순위 금지, 이동 경로·시간은 판단하지 않음) · `user` = 기준표·가상화 사실집·제출물(선택·이유·사실 id·이벤트)의 JSON, 모든 텍스트 `mask()` 적용. 직무와 무관한 특성 가드는 `system`에 고정하고 사용자 입력으로 덮어쓸 수 없다(ADR-038).

### 4. `weightedScore` 타입 일반화 (`lib/agent-role.ts`)

시그니처를 `weightedScore(criteria: ReadonlyArray<{ score: number | null; weight: number; evidence: "ok" | "no_evidence" }>)`로 넓힌다. 계산식은 바꾸지 않는다. 예고편 결과는 `evidence_status`를 `evidence`로 옮겨 넘긴다. `tests/agent-role.test.ts`는 수정 없이 통과해야 한다.

### 5. job `score_trailer_attempt`

- `lib/llm.ts`: `LlmPurpose`에 `"trailer_score"`(기본 120b).
- `lib/pipeline/trailer-score.ts` — `registerTrailerScoreHandler()`, payload `{attemptId}`:
  1. service client로 attempt(`status='scoring'`이 아니면 종료)와 예고편(`scenarios`, `rubric`, `schema_version`)을 읽는다. `schema_version !== 1`이면 `attempt_invalid`.
  2. `validateAttemptSubmissions` → `llm.structured("trailer_score", TrailerScoreDraft, prompt, { deptId })` 1회 → `verifyTrailerScore` → `weightedScore`.
  3. 총점 null(유효 기준 0개) → `status='failed'`, `status_reason='citation_invalid'`.
  4. 아니면 `update … set status='scored', result, weighted_score where id and status='scoring' and updated_at=<읽은 값>`.
- `lib/jobs.ts`: `JobKind` 추가 · `FailureOwnerMapping.table`에 `"trailer_attempts"` · 매핑 `status='failed'`, `status_reason=<errorCode>` · `SAFE_ERROR_CODES`에 `attempt_invalid` · 스윕: `scoring`이 `updated_at` 기준 10분 넘으면 `failed`·`timeout`.
- `lib/worker.ts` 등록, `tests/worker.test.ts` 갱신.
- 로그에 제출 이유·시나리오·모델 출력 금지. attempt id·기준 수·오류 코드만.

### 6. 테스트

- `tests/trailer-assessment.test.ts`: ①②③ 각각 유효/무효 · ④가 점수 근거면 무효, 면접 질문 근거면 유효 · 빠진 기준 채움 · 금지어 기준 → `no_evidence`·rationale null · 금지어 질문 제거 · 결과에 `pass`·`hire`·`rank` 같은 키 없음 · 프롬프트 `system`에 가드 포함, `user`에 마스킹 전 이메일 없음
- `tests/pipeline/trailer-score.test.ts`(모킹): 정상 → scored · 유효 기준 0 → failed `citation_invalid` · 상태 불일치 → LLM 0회
- `tests/features.test.ts`, `tests/jobs.test.ts`, `tests/worker.test.ts` 확장

## Acceptance Criteria

```bash
npm run test -- tests/trailer-assessment.test.ts tests/pipeline/trailer-score.test.ts tests/agent-role.test.ts tests/features.test.ts tests/jobs.test.ts tests/worker.test.ts tests/contracts.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 총점을 코드가 계산하는가 · 점수 근거가 지원자 본인의 이유·이벤트·선택 사실로만 검증되는가 · 금지어 예외가 화면 상수에만 적용되는가 · 새 job이 등록·실패 매핑·스윕 세 곳에 있는가.
3. `phases/12-trailer-assessment/index.json` step 1을 갱신한다.

## 금지사항

- 실제 Groq를 호출하지 마라. 이유: 실제 채점 평가는 step 4의 합성 eval, 데모 채점은 O12다.
- 모델에게 총점·합불·순위를 출력하게 하지 마라. 이유: 검증할 수 없는 수치가 결정처럼 읽힌다(ADR-038 기각 ②).
- `AGENT_ROLE_SYSTEM_GUARD` 내용을 약하게 바꾸지 마라. 필요한 예고편 규칙은 뒤에 덧붙인다.
- 화면·스크립트·시드를 만들지 마라. 이유: step 2·3 범위다.
