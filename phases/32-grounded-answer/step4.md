# Step 4: verification

step1~3 결과를 한 번에 다시 검증하고 기록한다. 로컬 실DB(Supabase·Auth·RLS·pgvector)와 실제 Next.js·브라우저·Groq·Voyage를 연결해 사용자 흐름을 확인한다. 끝나면 **blocked**로 멈춘다. 운영 반영은 사람이 판정한다.

## 읽어야 할 파일

- `docs/ADR.md` ADR-066 · ADR-067 · `docs/PRD.md` §3 "ASK 근거 확인 보완"(완료 기준) · §6-5 · §8
- `phases/32-grounded-answer/README.md` · `step1.md`~`step3.md`와 각 step의 `summary`
- `docs/verification/grounded-answer-selection-2026-09-23/README.md` (step1~3이 쓴 절)
- 9/22 기록(읽기만): `docs/verification/grounded-answer-2026-09-22/README.md` · `live/README.md`. 실DB E2E 실행 방법과 이전 실패 사례가 있다
- `tests/e2e/grounded-answer-live.spec.ts` · `scripts/review-qa.mjs`(`setup`·`dev`·`grounded-answer-test`, 마이그레이션 폴더를 읽어 0054도 적용한다)

## 작업

### 1. E2E 기록 경로와 검사 추가

- `tests/e2e/grounded-answer-live.spec.ts` 10행의 `output`을 `docs/verification/grounded-answer-selection-2026-09-23/live`로 바꾼다. 9/22 기록을 덮어쓰지 않기 위해서다.
- 아래 검사를 추가한다. 기존 검사(오래된 결정·문서/회의 원문·재열람 순서·팀장/팀원 권한·권한 회수·삭제·390px)는 그대로 둔다.
  - 완료 답변의 본문이 `answerLead(citations.length)`이고, 화면에서 근거 원문이 인용 카드에만 한 번 나온다.
  - 문서 인용의 원문 링크에 `?answer=`가 있다. 질문자가 열면 `<mark>` 텍스트가 해당 quote와 같다.
  - 같은 원문을 볼 수 있는 다른 멤버가 같은 링크를 열면 `<mark>`가 없고, 원문은 보이며, 응답 상태가 질문자와 같다(200).
  - 조건과 예외가 같은 문서의 다른 문단에 있는 합성 자료를 시드하고 그것을 묻는다. 완료되면 인용 하나에 두 문단이 모두 들어 있다. 모델이 거절하면 이 사례는 "거절 허용, 이유 기록"으로 처리한다. 첫 흐름 실패 기록(9/22 `first-flow-failure.txt`)처럼 테스트 가정이 틀린 경우를 구분한다.

### 2. 전체 검증 실행

아래 순서로 실행하고, 각 출력을 `docs/verification/grounded-answer-selection-2026-09-23/`에 파일로 남긴다.

```bash
npm run lint                                           > lint.txt
SASU_VERIFY_BUILD=1 npm run build                      > build.txt
npm run test                                           > unit.txt
node scripts/verify-security-sql.mjs D:/바이브코딩/.sasu-qa-db   > sql-final.txt
node scripts/verify-grounded-answer-ui.mjs             > ui.txt
node scripts/review-qa.mjs setup
SASU_VERIFY_BUILD=1 node scripts/review-qa.mjs dev     # 별도 프로세스, localhost:3011
node scripts/review-qa.mjs grounded-answer-test --reporter=line   > live/test.txt
```

- 실DB E2E에는 Docker(`review-qa` 인스턴스)·`GROQ_API_KEY`·`VOYAGE_API_KEY`가 필요하다. 없으면 나머지 검증을 모두 끝내고 이 항목만 **blocked**(사유: 실DB E2E 환경 없음)로 멈춘다.
- 실패하면 제품 코드 결함인지 테스트 가정 오류인지 먼저 가린다. 둘 다 원래 출력을 `*-failure.txt`로 보존하고 README에 원인을 적는다. 제품 코드를 고쳤다면 해당 step의 AC를 다시 실행한다.
- 로컬 `llm_calls`에서 이번 실행의 Groq 호출 수와 입력/출력 토큰을 모아 `live/llm-telemetry.json`에 남긴다. 9/22 값(5회, 입력 5,707·출력 4,094)과 비교한다.

### 3. 기록

`docs/verification/grounded-answer-selection-2026-09-23/README.md`를 완성한다.
- **변경 결과:** ADR-067의 네 가지(번호 범위 선택·연속 범위·고정 안내 본문·실패 코드 재시도) + 0054 + 원문 강조.
- **실제 실행 결과 표:** 명령 · 결과 · 근거 파일.
- **before/after:** step1 모델 평가, A08~A10 토큰, 실DB E2E의 토큰 비교.
- **판단과 검증의 한계:**
  - 합성 스모크일 뿐이다.
  - 문단 선택의 적합성과 원문의 사실성은 사람이 판단한다.
  - 조각 경계에서 나뉜 조건은 검증하지 않았다.
  - 앞뒤 조각 이동은 없다.
  - 의미 유사도 기준 0.25는 그대로다.
  - Slack 실제 발송·운영 DB·업로드 경로는 검증하지 않았다.
  - Graft/Archify 결과가 없으면 누락이라고 적는다.
- **운영 반영 순서 (아직 실행하지 않음):**
  1. 승인된 QA/운영 DB에 0053 → 0054 적용 (앱보다 먼저. 기존 앱과 DB 호환)
  2. 앱 배포
  3. 승인된 QA 조직에서 웹·Slack DM·채널 질문 → 결정 → 원문(강조) 확인
  4. 롤백 시 앱만 되돌리고 추가 함수·nullable 컬럼은 남긴다

### 4. 상태

- `phases/32-grounded-answer/index.json`의 step 4를 **blocked**로 둔다. `blocked_reason`: "검증 완료. 운영 DB(0053·0054) 적용·배포·운영 연결 E2E는 사용자 승인 대기(ADR-049)". `summary`에는 핵심 수치를 한 줄로 적는다.
- step1~3 요약과 이 기록이 맞지 않는 곳이 있으면 README에 적는다(자기 보고를 믿지 않는다).

## Acceptance Criteria

```bash
test -s docs/verification/grounded-answer-selection-2026-09-23/README.md
grep -c "" docs/verification/grounded-answer-selection-2026-09-23/unit.txt   # 비어 있지 않음
npm run lint && npm run test && npm run build
node scripts/verify-security-sql.mjs D:/바이브코딩/.sasu-qa-db
node scripts/verify-grounded-answer-ui.mjs
node scripts/review-qa.mjs grounded-answer-test --reporter=line    # 환경이 없으면 blocked 사유로 대체
git diff --stat -- docs/verification/grounded-answer-2026-09-22 docs/verification/evaluation-results/answer-grounded-live.json   # 0 (9/22 기록 보존)
```

## 금지사항

- 운영·QA DB에 마이그레이션을 적용하거나 배포하지 마라. 이유: 운영 반영은 사용자 승인 단계다(ADR-049, AGENTS.md). 이 step은 판정 재료만 만든다.
- Slack에 실제로 발송하지 마라. 이유: 외부 발신은 되돌릴 수 없다.
- 테스트를 통과시키려고 제품의 거절·인용 검증 로직을 약하게 만들지 마라. 이유: CLAUDE.md CRITICAL. 테스트 가정이 틀렸으면 가정을 고치고 그 사실을 기록한다.
- 9/22 검증 기록과 `answer-grounded-live.json`을 수정하지 마라. 이유: 보완 전 근거다.
- 합성 사례 결과를 업무 정확도로 적지 마라. 이유: 독립 검수되지 않은 스모크 평가다.
- 이 step을 `completed`로 끝내지 마라. 이유: 운영 반영 여부는 사람이 판정한다. 검증이 끝나면 `blocked`다.
