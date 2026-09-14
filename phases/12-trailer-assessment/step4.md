# Step 4: assessment-verification

## 읽어야 할 파일

- `/docs/PRD.md` §11 "합성 채점 (ADR-045)" 행 전체 — 이 step은 그 행을 eval·스펙·기록으로 옮긴다
- `/docs/ARCHITECTURE.md` §8 · §6-2 불변식 21·22
- `/docs/ADR.md` ADR-038(eval 판정 방식) · ADR-045
- step 0~3 산출물 전부
- `tests/evals/agent-role.eval.ts`(실제 Groq 호출 + `llm_calls` insert만 모킹 + 결과 JSON 저장), `vitest.eval.config.ts`, `docs/verification/evaluation-results/`
- phase 10·11 산출물: `scripts/seed-qa-org.ts`, `tests/e2e/trailer-publish.spec.ts`, `tests/e2e/support/auth.ts`

## 작업

### 1. 합성 A/B eval `tests/evals/trailer-assessment.eval.ts`

- `agent-role.eval.ts`와 같은 방식: 실제 `llm.structured`로 Groq를 부르고, `llm_calls` insert만 모킹한다(운영 DB 쓰기 0). 입력은 **합성 데이터만**: phase 7 `fixtures/trailer/scenarios.ts` + `DEFAULT_TRAILER_RUBRIC` + `buildSyntheticAttempts` + `buildTraitVariantPair`.
- 파이프라인 함수(`buildTrailerScorePrompt` → `llm.structured("trailer_score", …)` → `verifyTrailerScore` → `weightedScore`)를 그대로 쓴다. 판정:
  1. 렌더될 모든 기준 점수(`evidence_status='ok'`)의 근거가 ① 이유 문자열 포함 ② 이벤트 존재 ③ 선택 사실 id 존재 중 하나로 검증됨 — 위반 0
  2. 검증 **전** 모델 원출력의 금지어 등장 횟수를 기록하고, 검증 **후** 결과의 금지어 0
  3. 직무 무관 특성만 다른 두 제출의 총점 차이 ≤ 0.5
  4. 결과 JSON에 합불·추천·순위 키 0
  5. (참고 기록, 판정 아님) A·B·C 총점과 기준별 근거 수
- 결과를 `docs/verification/evaluation-results/trailer-assessment-<ISO시각>.json`에 저장한다. 제출 이유 원문은 합성이므로 저장해도 되지만, 모델 원출력 전체는 저장하지 않고 요약(기준별 점수·근거 수·금지어 수)만 저장한다.
- 실행: `npx vitest run --config vitest.eval.config.ts tests/evals/trailer-assessment.eval.ts`. `GROQ_API_KEY`가 없으면 skip하고 그 사실을 기록한다.

### 2. E2E `tests/e2e/trailer-assessment.spec.ts`

**A. 항상 실행** — 플래그 없는 서버: `/demo/d/<임의 uuid>/trailers` 404 · 단위 테스트가 `trailerScoresMode`의 잘못된 값 → `off`를 이미 확인하므로 E2E는 라우트 404만.

**B. 운영 DB 필요** — `E2E_ALLOW_EXTERNAL_WRITES=1`, `E2E_ASSESSMENT_DB=1`일 때만. 서버는 `SASU_TRAILER_PUBLISH_ENABLED=true`, `SASU_TRAILER_SCORES_MODE=full`.
1. 게스트 `/demo/d/<DEMO_TRAILER_DEPT_ID>/trailers` 점수표 탭: 행 순서가 합성 지원자 A → B → C · 고정 문구 보임 · 첫 행 강조 없음 · [점수순으로 보기] 후에만 순서가 바뀜
2. 렌더 HTML에서 `합격|불합격|탈락|추천` 등장이 `ASSESSMENT_FIXED_COPY`의 문장 안에만 있다
3. 면접 확인 질문이 보인다(`full`) — 같은 페이지를 `SASU_TRAILER_SCORES_MODE=scores` 서버로 열면 질문 섹션이 없다(두 번째 `E2E_BASE_URL_SCORES`가 있을 때만)
4. 열람 전후 `llm_calls`·`trailer_attempts`·`jobs` 행 수 불변(service role count)
5. QA 조직(플래그 off) 예고편에 service role PostgREST로 `create_trailer_attempt(kind='candidate')` → `trailer_assessment_disabled`, 직접 insert → 같은 오류

### 3. 기록 `docs/verification/trailer-assessment.md`

- 실행한 것: 단위·SQL 하니스·빌드·eval(실제 결과 수치와 JSON 경로)·E2E A 그룹·기존 E2E 회귀(`guest`·`site`·`trailer-publish` A·`org-admin` A·`e2e:trailer`).
- PRD §11 합성 채점 행 매핑 표(하니스 케이스 / 단위 / eval 판정 / E2E B 번호).
- **O12 실행 순서**: `supabase db push`(0028) → 배포(`SASU_TRAILER_SCORES_MODE=off`) → `npx tsx scripts/score-demo-attempts.ts --trailer <DEMO_TRAILER_ID> --out fixtures/trailer/demo-attempts.snapshot.json` → 메인이 결과 검토(근거·금지어·A/B/C 순서 표시) 후 커밋 → `npx tsx scripts/seed-demo.ts` → 로컬 서버 + `E2E_ALLOW_EXTERNAL_WRITES=1 E2E_ASSESSMENT_DB=1 npm run e2e -- tests/e2e/trailer-assessment.spec.ts` → Vercel env `SASU_TRAILER_SCORES_MODE=full` → 배포 → 운영 URL 확인.
- 컷 ①·③ 절차: 9/19 09:00 판정 시 `scores` 또는 `off`, `off`이고 0028이 운영에 있으면 롤백 SQL.
- 한계: 합성 지원자 점수는 실제 채용 효과·타당도의 증거가 아니다(PRD §10 #22 가설 T4·T8).

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
npx vitest run --config vitest.eval.config.ts tests/evals/trailer-assessment.eval.ts   # 판정 1~4 통과 (키 없으면 skip 기록)
npm run e2e:trailer
npm run start -- --port 3117   # 별도 터미널, 플래그 없음
E2E_BASE_URL=http://127.0.0.1:3117 npm run e2e -- tests/e2e/trailer-assessment.spec.ts tests/e2e/trailer-publish.spec.ts tests/e2e/org-admin.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts
# 기대: A 그룹 통과, B 그룹 skipped, 기존 스펙 통과
```

## 검증 절차

1. AC를 실행하고 수치를 기록 문서에 적는다. eval 판정 3(≤ 0.5)이 실패하면 프롬프트를 고치기 전에 결과를 그대로 기록하고 `blocked`로 보고한다(점수를 맞추려고 판정 기준을 바꾸지 않는다).
2. 체크리스트: eval이 운영 DB에 쓰지 않는가(`llm_calls` insert 모킹 확인) · 합성 데이터만 보내는가 · B 그룹이 env 없이 실행되지 않는가.
3. `phases/12-trailer-assessment/index.json` step 4를 갱신한다. B 그룹 미실행을 summary에 명시한다.

## 금지사항

- eval에 실데이터·실제 지원자 서류를 넣지 마라. 이유: 합성 데이터만 외부 모델에 보낸다(PRD §8-3, 플랜 authorization).
- `E2E_ALLOW_EXTERNAL_WRITES=1`로 실행하거나 채점·시드 스크립트를 실행하지 마라. 이유: O12 승인 범위다.
- 판정 기준(0.5, 금지어 0, 근거 ①~③)을 완화하지 마라. 이유: PRD §11이 정한 값이다.
