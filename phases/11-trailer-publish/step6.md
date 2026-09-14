# Step 6: trailer-demo-seed

## 읽어야 할 파일

- `/docs/PRD.md` §6-7 게스트 모드 · §8-3(게스트는 합성 데이터만) · §10 #25 · §11 "예고편 발행" 행의 "데모 발행본 원문 겹침 0건"
- `/docs/ARCHITECTURE.md` §6 불변식 10 · §6-2 불변식 20
- `/docs/ADR.md` ADR-045 5항("데모 시나리오는 실제 파이프라인 실행 결과를 스냅샷으로 시드")
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-1 게스트·제출 행 · §C-5 S6 보강 · §L1 고칠 것 3
- step 0~5 산출물: `0027_trailer_publish.sql`(트리거가 `scenarios_hash`를 계산), `lib/trailer-gate.ts`, `lib/trailer-generation.ts`, `lib/pipeline/trailer-inputs.ts`, `lib/pipeline/trailer-generate.ts`, `lib/trailer-public.ts`, `components/trailers/*`, `app/(auth)/d/[dept]/trailers/[id]/page.tsx`
- `scripts/seed-demo.ts`(9~16행 고정 id, 77~402행 부서 데이터, 404~442행 삭제 순서, 598~624행 역할 시드 패턴), `tests/seed-demo.test.ts`, `app/demo/page.tsx`, `app/demo/d/[dept]/layout.tsx`, `app/demo/d/[dept]/roles/page.tsx`(게스트 읽기 패턴)
- `scripts/setup-worker-cron.ts`(운영 스크립트 출력·종료 코드 패턴)

## 작업

### 1. 생성 루프 재사용

`lib/pipeline/trailer-generate.ts`의 결정별 생성·재시도·검증 루프가 워커 핸들러 안에 묶여 있으면 `export async function generateTrailerScenarios(inputs, opts): Promise<TrailerScenario[]>`로 뽑는다. 워커 핸들러는 이 함수를 호출하고, 기존 테스트는 수정 없이 통과해야 한다.

### 2. 스냅샷 스크립트 `scripts/snapshot-demo-trailer.ts` (작성만, 실행은 O11)

- 사용법(머리 주석): `npx tsx scripts/snapshot-demo-trailer.ts --dept <demo dept uuid> --decisions <id,id[,id]> --out fixtures/trailer/demo-trailer.snapshot.json`
- service client로 부서가 **`is_demo` 조직**인지 확인하고 아니면 즉시 종료(exit 1). 이유: 실데이터를 스냅샷 파일로 저장소에 남기면 안 된다.
- `loadTrailerInputs` → `generateTrailerScenarios`(실제 `llm.structured`) → `runTrailerGate`(고유명사: 데모 조직명·부서명·데모 멤버 표시 이름·소스 제목) → JSON 저장: `{ schema_version: 1, dept_id, decision_ids, scenarios, gate_report, generated_at }`.
- 검사 위반이 있으면 파일은 쓰되 exit 2와 "검사 위반 N건 — 검토 필요"를 출력한다. DB에는 쓰지 않는다(`llm_calls` 기록은 `llm.ts`가 한다).
- 시나리오 본문을 콘솔에 출력하지 않는다(개수·위반 수만).

### 3. `lib/trailer-snapshot.ts` (순수, TDD)

```ts
export function parseDemoTrailerSnapshot(
  data: unknown,
  context: { sourceTexts: string[]; properNouns: string[]; knownDecisionIds: string[] },
): { status: "ok"; snapshot: DemoTrailerSnapshot } | { status: "invalid"; reason: string };
```

- `schema_version === 1` · 시나리오 계약 통과 · `decision_ids`가 시드의 데모 결정 id에 포함 · **시드 시점에 `runTrailerGate`를 다시 돌려 통과**(스냅샷에 적힌 `gate_report`를 믿지 않는다) · 시나리오 텍스트에 "합격"·"불합격"·"탈락"·"추천"·"적합도" 0개.
- `reason`에는 규칙 이름만 넣는다.

### 4. 데모 발행본 시드 (`scripts/seed-demo.ts`)

- `fixtures/trailer/demo-trailer.snapshot.json`이 **있을 때만** 시드한다. 없으면 "데모 예고편 스냅샷 없음 — 건너뜀" 한 줄을 출력하고 나머지 시드는 계속한다.
- `parseDemoTrailerSnapshot`이 `invalid`면 예고편 시드를 중단하고 exit 1(다른 데모 데이터는 이미 들어간 상태로 둔다 — 순서상 예고편 시드는 마지막).
- 순서: 데모 조직 `trailer_publish_enabled = true` → `trailers` insert(고정 UUID `DEMO_TRAILER_ID`, `status='review'`, `scenarios`, `source_decision_ids`, `rubric = DEFAULT_TRAILER_RUBRIC`, `created_by = DEMO_DEV_LEAD_ID` 또는 해당 부서 데모 부서장) → 트리거가 만든 `scenarios_hash`를 읽는다 → `gate_report`, `gate_passed_hash = scenarios_hash`, `approved_item_ids = trailerApprovalItems(...)`의 id 전부, `approval_hash = scenarios_hash`, `approved_by/at`, `status='published'`, `published_at`, `slug = DEMO_TRAILER_SLUG`(`"onsaemiro2026demotrail"`, 22자 `[a-z0-9]`)로 update.
- 해시를 TS에서 계산하지 않는다. 데모용 우회 RPC를 만들지 않는다(service role 시드 경로만 쓴다).
- `removeExistingDemoData`가 부서보다 먼저 데모 `trailers`·`trailer_generation_counters`를 지운다.
- export: `DEMO_TRAILER_ID`, `DEMO_TRAILER_SLUG`, `DEMO_TRAILER_DEPT_ID`.

### 5. 게스트 화면 `app/demo/d/[dept]/trailers/page.tsx`

- `trailerPublishEnabled()` false → `notFound()`. `createPublicSupabaseClient()`로 그 데모 부서의 `trailers`와 원문 결정(anon 데모 읽기)을 읽는다. `revalidate = 60`.
- S19를 읽기 전용으로 보여 준다: 좌 원문(결정·카드 제목) · 우 가상화본(편집 없음) · 검사 결과("원문 20자 겹침 0 · 고유명사 0 · 개인정보 형식 0") · "공개 승인 M / M" · 고정 문구 "자동 검사는 수치·전략이 가상화됐는지 판단하지 못합니다" · [체험하기 →](`/t/<slug>`) · 상단 "게스트 모드 · 읽기 전용 · 합성 사례".
- 예고편이 없으면 "이 부서에는 데모 예고편이 없습니다".
- 게스트 부서 내비(`app/demo/d/[dept]/layout.tsx`)에 "예고편" 링크를 플래그 on일 때 추가하고, `/demo`에 "채용 예고편 만드는 과정 →"(`/demo/d/<DEMO_TRAILER_DEPT_ID>/trailers`) 카드를 플래그 on일 때만 추가한다.

### 6. 테스트

- `tests/trailer-snapshot.test.ts`: 정상 스냅샷 ok · 겹침 20자 포함 → invalid(`overlap`) · 모르는 결정 id → invalid · 금지어 → invalid · `schema_version` 2 → invalid. 픽스처는 테스트 안의 합성 데이터로 만든다(실제 스냅샷 파일에 의존하지 않는다).
- `tests/seed-demo.test.ts`: 스냅샷 파일이 없을 때 예고편 시드를 건너뛰는 분기 · 삭제 순서에 `trailers`가 `departments`보다 먼저 · `DEMO_TRAILER_SLUG`가 `[a-z0-9]{22}`.

## Acceptance Criteria

```bash
npm run test -- tests/trailer-snapshot.test.ts tests/seed-demo.test.ts tests/pipeline/trailer-generate.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 스냅샷 스크립트가 데모 조직이 아니면 멈추는가 · 시드가 스냅샷의 검사 결과를 믿지 않고 다시 검사하는가 · 게스트 화면이 public 클라이언트만 쓰고 LLM·쓰기가 없는가 · 해시를 TS에서 계산하지 않는가.
3. `phases/11-trailer-publish/index.json` step 6을 갱신한다.

## 금지사항

- `snapshot-demo-trailer.ts`·`seed-demo.ts`를 실행하지 마라. 이유: 실제 Groq 호출과 운영 DB 쓰기는 O11 승인 범위다.
- `fixtures/trailer/demo-trailer.snapshot.json`을 손으로 만들거나 LLM 없이 채우지 마라. 이유: ADR-045 5항 — 실제 파이프라인 결과만 시드한다. 파일은 O11에서 생긴다.
- 파일럿 조직의 `trailer_publish_enabled`를 켜지 마라. 데모 조직만 켠다. 이유: PRD §10 #25.
- phase 7의 `fixtures/trailer/scenarios.ts`를 데모 발행본으로 쓰지 마라. 이유: 원장에서 만든 발행본이 아니므로 "원장 → 검사 → 발행" 시연이 거짓이 된다.
