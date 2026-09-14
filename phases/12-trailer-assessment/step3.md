# Step 3: assessment-score-table

## 읽어야 할 파일

- `/docs/PRD.md` §7 디자인 가이드 · §11 "합성 채점" 행(기본 정렬 = 제출 순, 게스트 LLM 0)
- `/docs/ADR.md` ADR-038 채용 사용 조건(참고용 문구) · ADR-045 4항·법적 한계
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-4 "점수표 화면 고정 문구"·"순위처럼 보이지 않게" · §C-5 S19 "합성 지원자 점수표 탭" · S6 보강
- step 1·2 산출물: `lib/trailer-assessment.ts`(`ASSESSMENT_FIXED_COPY`), `lib/contracts.ts`(`TrailerAttemptResult`, `TrailerAttemptSubmission`), `lib/features.ts`(`trailerScoresMode`)
- phase 11 산출물: `app/(auth)/d/[dept]/trailers/[id]/page.tsx`, `app/demo/d/[dept]/trailers/page.tsx`, `components/trailers/*`
- 기존 점수표 UI: `components/agent-roles.tsx`, `app/demo/d/[dept]/roles/page.tsx`("근거 없음 (0점 반영)" 표기)

## 작업

### 1. `components/trailers/attempt-scores.tsx`

```ts
export function AttemptScores(props: {
  attempts: { id: string; label: string; createdAt: string; submissions: TrailerAttemptSubmission[]; result: TrailerAttemptResult | null; weightedScore: number | null; status: "scoring" | "scored" | "failed" }[];
  scenarios: TrailerScenario[];
  mode: "scores" | "full";
}): JSX.Element;
```

- 상단 고정 문구(항상 렌더, `ASSESSMENT_FIXED_COPY`에서 가져온다): "합성 지원자 · 참고용 · 최종 판단은 담당자" / "합격·불합격·추천은 표시하지 않습니다".
- **기본 정렬은 제출 순**(라벨 A·B·C, `createdAt` 오름차순). 점수순은 사용자가 [점수순으로 보기]를 눌렀을 때만. 첫 행 강조·자동 펼침·"1위" 같은 표시를 하지 않는다.
- 지원자 행: 라벨 · 총점(소수 둘째 자리, "/ 5") · [상세 보기](접힘 기본).
- 상세: 기준마다 라벨·가중치·점수·이유·근거. 근거 표시 — ① 이유 인용은 해당 시나리오 이유 문장에서 인용 구간을 강조 ② 이벤트는 "사실 「label」 확인"·"대화 「question」 확인" 같은 문장으로 ③ 선택 사실은 사실 label. `no_evidence`는 "근거 없음 (0점 반영)".
- `mode === "full"`일 때만 면접 확인 질문과 그 근거("확인하지 않은 대화: 「question」" 등)를 보여 준다. `scores`면 섹션 자체가 없다(컷 ①).
- `scoring`은 "채점 중", `failed`는 "채점하지 못했습니다(status_reason 한국어)".

### 2. 배치

- 부서장 S19: `trailerScoresMode() !== "off"`이고 그 예고편에 attempt가 1개 이상일 때만 [합성 지원자 점수표] 탭. 세션 클라이언트로 `trailer_attempts`를 읽는다(RLS가 부서장만 보이게 한다). 쓰기 버튼 없음.
- 게스트 `/demo/d/[dept]/trailers`: 같은 조건으로 탭. public 클라이언트(anon 데모 읽기). LLM·쓰기 0.
- 시나리오 id가 제출과 맞지 않는 attempt는 렌더하지 않고 "표시할 수 없는 채점 결과" 한 줄로 대신한다(fail-closed).

### 카피 규칙

- 쓰지 않는 표현: "적합도", "합격 가능성", "추천", "순위", "1위", "AI가 거른다", "평가 결과"(대신 "채점 결과·참고용").
- `rg`로 확인할 때 `ASSESSMENT_FIXED_COPY`의 "합격·불합격·추천은 표시하지 않습니다"는 예외로 둔다.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
rg -n "적합도|합격 가능성|순위|1위|AI가 거" components/trailers "app/(auth)/d/[dept]/trailers" "app/demo/d/[dept]/trailers"   # 결과 0줄
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 기본 정렬이 제출 순인가 · 점수순이 명시적 선택일 때만인가 · `scores` 모드에서 면접 질문 DOM이 없는가 · 고정 문구가 항상 보이는가 · 게스트 탭이 public 클라이언트만 쓰는가.
3. `phases/12-trailer-assessment/index.json` step 3을 갱신한다.

## 금지사항

- 점수를 화면에서 재계산하지 마라. 저장된 `weighted_score`만 표시한다. 이유: 총점은 코드(워커)가 한 번 계산한다.
- 점수에 따라 색·배지로 등급을 매기지 마라. 이유: 순위·합불처럼 읽힌다(설계 §C-4).
- 실제 지원자(`candidate`) 전용 화면·초대 버튼을 만들지 마라. 이유: 불변식 21.
- 운영 DB에 attempt를 만드는 수동 확인을 하지 마라. 이유: O12 승인 범위다.
