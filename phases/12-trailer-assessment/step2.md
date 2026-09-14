# Step 2: assessment-fixtures-seed

## 읽어야 할 파일

- `/docs/PRD.md` §8-3(게스트는 합성 데이터만) · §11 "합성 채점" 행(직무 무관 특성 A/B, 게스트 LLM 0)
- `/docs/ADR.md` ADR-045 4·5항 · ADR-038 채용 사용 조건
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-4 첫 두 줄(합성 지원자 3명, 운영자 스크립트) · §L3 "채점 스크립트 재실행"
- step 0·1 산출물: `0028_trailer_assessment.sql`(`create_trailer_attempt`), `lib/trailer-assessment.ts`, `lib/pipeline/trailer-score.ts`, `lib/contracts.ts`(`TrailerAttemptSubmission`, `TrailerAttemptResult`)
- phase 11 산출물: `scripts/seed-demo.ts`의 `DEMO_TRAILER_ID`·`DEMO_TRAILER_DEPT_ID`·예고편 시드, `lib/trailer-snapshot.ts`, `scripts/snapshot-demo-trailer.ts`(운영 스크립트 형식)
- `fixtures/trailer/scenarios.ts`(phase 7 합성 시나리오 — 단위 테스트 입력), `tests/seed-demo.test.ts`(69~80행 금지 키·마스킹 검사), `lib/worker.ts`(`runWorkerOnce`)

## 작업

### 1. 합성 지원자 생성기 `lib/trailer-synthetic.ts` (순수, TDD)

제출물을 특정 시나리오 id에 하드코딩하지 않고 **어떤 시나리오 묶음에도 적용되는 규칙**으로 만든다. 이유: 데모 발행본 시나리오는 O11의 실제 생성 결과라 id를 미리 알 수 없다.

```ts
export type SyntheticAttempt = { id: string; label: string; submissions: TrailerAttemptSubmission[] };
export function buildSyntheticAttempts(trailerId: string, scenarios: TrailerScenario[]): SyntheticAttempt[]; // A·B·C
export function buildTraitVariantPair(trailerId: string, scenarios: TrailerScenario[]): [SyntheticAttempt, SyntheticAttempt]; // eval 전용
export function syntheticAttemptId(trailerId: string, label: string): string; // 결정적 UUID(v5 형식, node:crypto sha1)
```

- **A "원칙 확인형"**: 모든 사실 열람·모든 대화 확인 → 엔딩의 선택지 → 이유에 원칙 사실과 대화 quote를 한 문장씩 인용.
- **B "빠른 결정형"**: 사실 1개만 열람·대화 없음 → 엔딩이 아닌 선택지 → 인용 없는 짧은 이유.
- **C "이해관계자 중심형"**: 대화 전부 확인·사실 2개 열람 → 엔딩 선택지 또는 다른 선택지 → 이유에 대화 quote만 인용(원칙 사실 인용 없음).
- 이벤트는 `open_fact`·`ask_dialogue`·`choose`·`submit` 순서의 `seq` 1부터. 좌표·시간 없음.
- 라벨은 "합성 지원자 A/B/C". 이름·나이·학교 같은 인적 사항을 넣지 않는다.
- `buildTraitVariantPair`: A와 같은 행동·같은 이유에 **직무와 무관한 특성 문장만** 다르게 앞에 붙인 두 제출(예: "저는 30대 여성입니다." / "저는 50대 남성입니다."). 데모 시드에는 쓰지 않는다.
- 이유 문장에 넣는 인용은 시나리오 `facts[].text`·`dialogues[].quote`의 부분 문자열만 쓴다.
- 테스트: phase 7 `fixtures/trailer/scenarios.ts`로 세 지원자 제출이 `validateAttemptSubmissions`를 통과 · 같은 입력 → 같은 id · 변형 쌍은 특성 문장 외 동일 · 인적 사항 패턴(나이·성별 단어)이 A·B·C에는 없음.

### 2. 채점 스크립트 `scripts/score-demo-attempts.ts` (작성만, 실행은 O12)

- 사용법: `npx tsx scripts/score-demo-attempts.ts --trailer <DEMO_TRAILER_ID> --out fixtures/trailer/demo-attempts.snapshot.json`
- service client로 예고편 조직이 `is_demo`이고 예고편이 `published`인지 확인, 아니면 exit 1.
- `buildSyntheticAttempts` → `create_trailer_attempt`(synthetic, 결정적 id) → `enqueue("score_trailer_attempt", {attemptId}, {dedupeKey: \`${id}:${updated_at}\`})` → `runWorkerOnce()`를 attempt가 `scored`/`failed`가 될 때까지 반복(최대 5분, 넘으면 exit 2).
- 결과를 `{ schema_version: 1, trailer_id, attempts: [{ id, label, submissions, status, result, weighted_score }] }`로 저장. 콘솔에는 라벨별 상태·기준 수만(이유·근거 문장 출력 금지).

### 3. `lib/trailer-snapshot.ts` 확장 (TDD)

```ts
export function parseDemoAttemptsSnapshot(
  data: unknown,
  context: { trailerId: string; scenarios: TrailerScenario[]; rubric: AgentRoleCriterion[] },
): { status: "ok"; attempts: [...] } | { status: "invalid"; reason: string };
```

- 전부 `synthetic` · 결정적 id 일치 · 제출이 시나리오와 맞음 · 저장된 `result`를 **다시 검증**(근거 ①~③이 제출과 맞는지, 금지어 0, 키 화이트리스트) · `weighted_score`를 `weightedScore`로 재계산해 일치.

### 4. 시드 (`scripts/seed-demo.ts`)

- 스냅샷 파일이 있고 데모 예고편 시드가 성공했을 때만 attempt를 시드한다. 없으면 한 줄 안내 후 건너뛴다.
- 데모 조직 `trailer_assessment_enabled = true`(설계 §C-2: 데모 조직만). 파일럿 조직 값은 건드리지 않는다.
- attempt insert(`kind='synthetic'`, `status='scored'`, `result`, `weighted_score`) — 트리거가 `dept_id`를 채운다.
- `removeExistingDemoData`에서 attempt를 예고편보다 먼저 지운다(예고편 cascade와 무관하게 명시).
- `tests/seed-demo.test.ts`: 금지어 검사를 한국어 `합격`·`불합격`·`탈락`·`추천`으로 확장하되 검사 대상은 **모델 출력 필드(rationale·interview_questions)**이고 예외는 `ASSESSMENT_FIXED_COPY`뿐 · 스냅샷이 없을 때 건너뛰는 분기.

## Acceptance Criteria

```bash
npm run test -- tests/trailer-synthetic.test.ts tests/trailer-snapshot.test.ts tests/seed-demo.test.ts tests/trailer-assessment.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 합성 지원자에 인적 사항이 없는가 · 스크립트가 데모 조직이 아니면 멈추는가 · 시드가 스냅샷 결과를 재검증하는가 · 파일럿 조직 플래그를 건드리지 않는가.
3. `phases/12-trailer-assessment/index.json` step 2를 갱신한다.

## 금지사항

- `score-demo-attempts.ts`·`seed-demo.ts`를 실행하지 마라. 이유: 운영 DB 쓰기와 실제 Groq 채점은 O12 승인 범위다.
- `fixtures/trailer/demo-attempts.snapshot.json`을 손으로 만들지 마라. 이유: ADR-045 5항 — 실제 파이프라인 결과만 시드한다.
- `kind='candidate'` 데이터를 만들거나 조직 플래그를 켜는 코드를 파일럿 조직에 대해 쓰지 마라. 이유: 불변식 21.
- 화면을 만들지 마라. 이유: step 3 범위다.
