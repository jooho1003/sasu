# Step 4: agent-role-demo-seed

## 읽어야 할 파일

- `/docs/ADR.md` **ADR-038**, ADR-019 (게스트는 합성 데이터)
- `/docs/PRD.md` §6-7 게스트 모드, §5 S6·S8 행, §11 "게스트"·"부서 역할" 행
- `/docs/ARCHITECTURE.md` §4.5 게스트 모드
- `scripts/seed-demo.ts` 전체와 `tests/seed-demo.test.ts` (개발팀 부서 id·소스 id 상수 패턴, 멱등 truncate 방식)
- `app/demo/d/[dept]/layout.tsx`, `app/demo/d/[dept]/page.tsx`, `app/demo/d/[dept]/ledger/page.tsx` (게스트 읽기 전용 렌더 방식)
- `components/agent-roles.tsx` (step 3, 점수표 렌더를 재사용할 수 있으면 재사용)
- `lib/agent-role.ts` (`verifyAgentRoleEvaluation`, `weightedScore`)

## 작업

### 1. 시드 (`scripts/seed-demo.ts`)

게스트 **개발팀** 부서에 아래 데이터를 추가한다. 모든 id는 기존 방식대로 고정 상수로 둔다.

**문서 소스 3개** — `kind:"document"`, `visibility:"dept"`, 이름은 "지원서 — 지원자 A/B/C (합성)"

- 소스마다 `document_summaries` 1행(`summarized`, 간단한 합성 요약)과 items 2~4개를 만든다.
- 내용은 전부 합성이다. 실존 인물·회사·학교명을 쓰지 않는다. 이메일·전화번호도 넣지 않는다.
- 지원자 A: Next.js App Router + Supabase RLS로 사내 도구를 만든 경험, 결정 기록 문서화 습관이 원문에 명시돼 있다.
- 지원자 B: 백엔드 경험은 많지만 프로젝트에 쓰는 스택 언급이 없다.
- 지원자 C: 프론트엔드 위주이고 협업·문서화 근거가 거의 없다.

**역할 1개** — "백엔드 개발자 서류 검토 (합성)"

- `visibility:"dept"` (게스트가 볼 수 있어야 함). `created_by`는 기존 시드의 개발팀 lead 사용자.
- 지시문: 개발팀 원칙 문서(시드에 있는 것)와 어울리는 인재상 2~3문장
- 기준 3개
  - `talent_fit`: "인재상 부합", 가중치 3
  - `stack_usage`: "프로젝트 스택 활용", 가중치 4
  - `collaboration`: "협업·문서화", 가중치 2

**사전 결과 3행** — `agent_role_results`

- `status:"completed"`
- 각 기준의 `citations[].quote`는 **해당 지원자 items content에 실제로 포함된 문자열**이어야 한다.
- 근거가 없는 기준은 `score:null`, `evidence:"no_evidence"`로 둔다. B의 `stack_usage`, C의 `collaboration`이 여기에 해당한다.
- `weighted_score`는 `weightedScore()`로 계산한 값을 저장한다. 손으로 쓰지 않는다.

시드는 service role 스크립트이므로 RPC를 거치지 않고 insert한다. 기존 truncate·재생성 멱등성을 유지하고, 새 테이블도 데모 org 범위로 먼저 지운다.

### 2. 게스트 화면

`app/demo/d/[dept]/roles/page.tsx`를 만든다.

- 읽기 전용이다. 역할 만들기·적용·보관 UI가 없다.
- 고정 문구 "AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다."를 둔다.
- 데이터 읽기는 기존 게스트 페이지와 같은 방식으로 한다.
- LLM 호출 0회, 쓰기 0건이다.
- 게스트 레이아웃의 부서 nav에 "역할" 링크를 추가한다. 역할이 없는 부서는 빈 상태 문구를 쓴다.

### 3. 테스트 (`tests/seed-demo.test.ts` 확장)

- 사전 결과의 모든 quote가 해당 소스 items content에 포함되는지
- `weighted_score === weightedScore(criteria)`인지
- 결과 JSON에 `pass`·`fail`·`hire`·`recommend` 같은 키가 없는지
- 시드 문자열에 이메일·전화 패턴이 없는지 (`lib/mask.ts`의 `MASK_PATTERNS`로 검사)

## Acceptance Criteria

```bash
npx vitest run tests/seed-demo.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC 커맨드를 실행한다.
2. 체크리스트: 게스트 라우트가 `lib/llm.ts`를 import하지 않는가 (`grep -rn "lib/llm" app/demo` 0건) · 우리 팀 실데이터 문자열이 없는가.
3. `phases/4-agent-roles/index.json`의 step 4를 갱신한다.

## 금지사항

- 운영 DB에 시드를 실행하지 마라. 이유: 운영 반영은 승인 노드(O1)다.
- 합성 지원자에게 나이·성별·출신지를 쓰지 마라. 이유: 데모가 직무 무관 특성 평가처럼 보이면 안 된다.
- 합격/불합격을 연상시키는 색·뱃지를 게스트 화면에 넣지 마라.
