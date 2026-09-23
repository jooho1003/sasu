# Step 3: evidence-highlight

원문 화면(`/d/[dept]/evidence/[id]`)이 **질문자 본인에게는 답변에 인용된 부분을 표시**하도록 한다. 안내 문구도 실제 동작과 맞춘다. 근거: ADR-067 "원문 화면", PRD §3·§6-5 5항.

## 읽어야 할 파일

- `docs/ADR.md` ADR-067 · `docs/PRD.md` §3 "ASK 근거 확인 보완" 셋째 항목 · §6-5 5항 · `docs/ARCHITECTURE.md` §1 Q&A 줄
- `node_modules/next/dist/docs/01-app/` 안의 page `searchParams` 설명 — 이 저장소의 Next.js 16은 `searchParams`가 Promise다. 선례: `app/(auth)/d/[dept]/page.tsx` 11·20행
- 원문 화면: `app/(auth)/d/[dept]/evidence/[id]/page.tsx` · `app/api/d/[dept]/evidence/[id]/route.ts` · `components/evidence-detail.tsx` · `tests/evidence-read.test.ts`
- 링크를 만드는 곳:
  - `app/api/d/[dept]/answers/[id]/route.ts`의 `itemHref`
  - `lib/pipeline/answer.ts`의 `slackCitations` (step 1이 고친 파일이다. 링크 부분만 고친다)
  - `lib/pipeline/slack-answer-delivery.ts`의 `enriched.href`
- 권한: `supabase/migrations/0017_card_decision_boundaries.sql` 124~181행 `citations_owner_access`. 답변 인용은 `answers.asked_by = auth.uid()`인 본인만, 그리고 인용 항목을 볼 수 있을 때만 읽힌다.
- 화면 검사: `scripts/verify-grounded-answer-ui.mjs`
- 문구 규칙: `docs/wording-guide.md` · `node scripts/check-wording.mjs`

## 작업

### 1. 링크에 답변 id를 붙인다

원문 화면으로 가는 링크(문서·회의 인용, Slack 링크를 못 얻었을 때)를 `/d/{dept}/evidence/{itemId}?answer={answerId}`로 만든다. 모두 `encodeURIComponent`로 감싼다.
- `answers/[id]/route.ts`: `itemHref(item, deptId, answerId)`. Slack permalink·Notion 링크는 지금 그대로 둔다.
- `lib/pipeline/answer.ts`: `slackCitations`에 `answerId` 인자를 추가한다.
- `lib/pipeline/slack-answer-delivery.ts`: `row.answer_id`를 쓴다.

### 2. API — `app/api/d/[dept]/evidence/[id]/route.ts`

- 지금처럼 멤버십 확인 → 세션 클라이언트로 항목 조회(부서·삭제·소스 활성) 순서로 처리한다. 항목이 없으면 404를 내고, 이때 인용은 조회하지 않는다.
- `answer` 쿼리 값이 UUID 형식일 때만 **세션 클라이언트**로 조회한다: `citations.select("quote").eq("owner_kind","answer").eq("owner_id",answer).eq("item_id",id).maybeSingle()`. RLS가 질문자 본인만 통과시킨다.
- 응답에 `highlight: string | null`과 `kind`(소스 종류)를 더한다. `highlight`는 인용 행이 있고 `content.includes(quote)`일 때만 quote다. 그 밖(형식 오류·행 없음·조회 오류·원문 불일치)에는 `null`이고 상태는 200이다. 강조는 부가 기능이라 원문 열람을 막지 않는다.
- `Cache-Control: private, no-store`를 유지한다.

### 3. 화면

- `page.tsx`: `searchParams`에서 `answer`를 읽어(문자열 하나일 때만) `EvidenceDetail`에 `answerId`로 넘긴다. `requirePageMembership`의 되돌아올 경로에도 `?answer=`를 붙인다.
- `components/evidence-detail.tsx`:
  - `answerId`가 있으면 API에 `?answer=`로 전달한다. 상태 키에 `answerId`를 포함한다.
  - `highlight`가 원문에 있으면 첫 번째 위치를 기준으로 원문을 앞 / `<mark>` / 뒤로 나눠 렌더한다. 문자열 렌더만 쓰고 `dangerouslySetInnerHTML`은 쓰지 않는다. 불러온 뒤 `<mark>`를 화면 가운데로 스크롤한다. `<mark>`는 라이트·다크 모두에서 읽히도록 기존 CSS 변수(`--accent` 등)로 칠한다.
  - 안내 문구:
    - 강조 있음 → "표시한 부분이 답변에 인용된 원문입니다. 개인정보는 가려져 있습니다."
    - 강조 없음 → "저장된 원문입니다. 개인정보는 가려져 있습니다."
    - 소스 종류가 `slack_channel`이 아니면 한 줄 추가 → "긴 자료는 나뉘어 저장되어 이 화면에는 그중 한 부분만 보입니다."
    - 지금의 "답변에 쓰인 부분의 저장된 원문입니다"는 지운다(사실과 다르다).
  - 오류·로딩 문구와 "사수에게 묻기로 돌아가기"는 그대로 둔다.

### 4. 테스트 (먼저 작성)

- `tests/evidence-read.test.ts`에 추가한다.
  - `answer`가 UUID면 항목 조회 **뒤에** citations를 `owner_kind`·`owner_id`·`item_id` 조건으로 조회하고 `highlight`를 돌려준다.
  - quote가 원문에 없으면 `highlight: null`이다.
  - UUID가 아니면 citations를 조회하지 않는다.
  - citations 조회 오류면 200 + `highlight: null`이고 오류 내용을 노출하지 않는다.
  - 항목 404면 citations를 조회하지 않는다.
- 링크: `tests/pipeline/slack-answer-delivery.test.ts`와 답변 API를 다루는 테스트(`tests/answer-read-boundary.test.ts` 등)에서 원문 화면 링크가 `?answer={id}`를 포함하는지 단언한다.
- `scripts/verify-grounded-answer-ui.mjs`: 가상 응답에 `highlight`를 넣은 경우를 추가한다.
  - 1440·390px 스크린샷(`evidence-highlight-1440.png`·`-390.png`)을 `docs/verification/grounded-answer-selection-2026-09-23/`에 저장한다.
  - `<mark>` 텍스트가 quote와 같은지 확인한다.
  - `<script>` 모양 quote가 텍스트로만 보이는지 확인한다.
  - 390px에서 가로 넘침이 없는지 확인한다.

## 코드 관계와 구조 확인

- 원문 링크를 만드는 곳이 위 세 곳뿐인지 확인한다: `grep -rn "/evidence/" app lib components`.
- 도구(Graft/Archify)가 없으면 grep 결과로 대체하고 누락을 README "step3" 절에 적는다.

## Acceptance Criteria

```bash
npx vitest run tests/evidence-read.test.ts tests/pipeline/slack-answer-delivery.test.ts tests/answer-read-boundary.test.ts
node scripts/check-wording.mjs components/evidence-detail.tsx "app/(auth)/d/[dept]/evidence/[id]/page.tsx"   # 차단 0
node scripts/verify-grounded-answer-ui.mjs   # 기존 8개 + 강조 검사 통과, 스크린샷 저장
npm run lint && npm run test && npm run build
```

## 검증 절차

1. 위 AC를 실행하고, 결과를 README "step3" 절과 스크린샷으로 남긴다.
2. 체크리스트:
   - 원문 API에서 service role을 쓰지 않았는가?
   - 강조 여부를 앱 코드의 권한 판단이 아니라 citations RLS가 정하는가?
   - quote를 URL에 넣지 않았는가?
3. `phases/32-grounded-answer/index.json`의 step 3을 갱신한다.

## 금지사항

- 원문 API에서 service role 클라이언트를 쓰지 마라. 이유: 사용자 요청 경로다(CLAUDE.md CRITICAL). 강조 권한은 기존 citations RLS가 정한다.
- 새 RLS 정책·SQL 함수를 추가하지 마라. 이유: 기존 `citations_owner_access`로 충분하고, SQL 변경은 이 step 범위가 아니다.
- quote나 원문을 URL 쿼리에 넣지 마라. 이유: Slack 채널·브라우저 기록·Referer로 원문이 퍼진다. id만 넘긴다.
- 질문자가 아닌 사람에게 "이 원문이 누군가의 답변에 인용됐다"는 사실을 드러내지 마라(문구·상태 코드 차이 포함). 이유: 다른 사람의 질문 존재가 드러난다. 강조가 없을 때와 같은 화면을 보여 준다.
- `dangerouslySetInnerHTML`로 강조를 만들지 마라. 이유: 원문에 HTML 모양 문자열이 있을 수 있다.
- 앞뒤 조각 이동을 만들지 마라. 이유: 같은 자료 안의 항목 순서를 보장하는 키가 없다(ADR-067 후속 과제).
- `lib/pipeline/answer.ts`에서 링크 외의 로직(선택·검증·저장)을 바꾸지 마라. 이유: step 1 산출물이다.
