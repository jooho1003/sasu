# Phase 32 · ADR-067 검증 기록

2026-09-23. 기존 step0·9/22 기록을 보존하며 step1~4를 직접 실행했다. 시작 시 phase30·31 등 다른 작업의 미커밋 변경이 있어 `git add -A`를 수행하는 `execute.py`는 사용하지 않았다. 커밋·운영 반영은 하지 않았다.

## Step1: 번호로 근거 선택

- `AnswerSelection`은 근거 번호와 시작/끝 문단 번호만 받는다. `Citation`·`CardDraft`·LLM 단일 게이트웨이는 이 작업에서 변경하지 않았다.
- `paragraphSpans`가 기존 빈 줄 분리/trim 규칙의 offset을 만든다. `resolveSelections`는 조건부터 예외까지 원문을 한 번에 slice하므로 CRLF·중간 빈 줄을 보존한다. 번호·범위·중복 오류를 모아 고정 한국어 사유로 재시도하며, 실패 소진 시 기존 `citation_invalid` 거절로 끝난다.
- 모델에 번호 붙은 문단 배열을 JSON 한 번으로 전달한다. 원문을 `content`와 `paragraphs`로 중복 전송하지 않으며 ID·visibility도 보내지 않는다.
- 본문은 `관련 부서 기록 N개를 찾았습니다. 아래 원문을 확인해 주세요.`로 저장한다. 웹·Slack에서 원문은 인용에 한 번만 나온다. 2,400자 인용 8개도 Slack 상한 안에서 표시하는 회귀 테스트를 추가했다.
- 원문 포함 여부를 기존 `verifyAnswerCitations`로 다시 검증한 뒤 기존 저장 RPC를 호출한다. 이미 저장된 답변은 소급 변환하지 않는다.
- TDD: [selection-red.txt](selection-red.txt) → [selection-unit.txt](selection-unit.txt). 이후 전체 관련 테스트 [117건](targeted-unit.txt) 통과.

### 수정 전후 실제 모델 평가

수정 전 A08~A10은 **2/3**이었다([before.json](before.json)). A09에서 일반 한도와 예외가 함께 제공되지 않는 문제가 재현됐다. 최초 새 구현은 **9/10**([after-attempt1.json](after-attempt1.json)). 기대값은 유지하고, 예외 문단이 앞 규칙을 가리키면 기본 규칙부터 함께 선택하도록 일반 지시를 한 차례 보완했다. 최종 **10/10**([결과 JSON](../evaluation-results/answer-selection-live.json), [실행 출력](after.txt)). 허용된 수정 2회 중 1회만 사용했다.

| 사례 | 수정 전 → 최종 | 호출 수 | 입력 토큰 | 출력 토큰 |
|---|---|---:|---:|---:|
| A08: 긴 문서 | 통과 → 통과 | 1 → 1 | 3,401 → 2,153 | 420 → 531 |
| A09: 같은 출처의 조건·예외 | 실패 → 통과 | 2 → 1 | 1,946 → 979 | 1,216 → 390 |
| A10: 혼합 근거 12개 | 통과 → 통과 | 1 → 1 | 1,511 → 1,352 | 523 → 459 |
| A08~A10 합계 | 2/3 → 3/3 | 4 → 3 | 6,858 → 4,484 | 2,159 → 1,380 |

동일 3사례의 입력은 약 34.6%, 출력은 약 36.1% 줄었다. 모델 재시도와 추론량은 실행마다 달라질 수 있다. 최종 전체는 호출 12회, 입력 11,900·출력 6,298이며 [사례별 전체 표](model-comparison.md)를 보존했다. 모의 검색/저장 + 실제 Groq의 **합성 스모크**로, 업무 정확도나 독립 검수 결과가 아니다.

## Step2: 결정 검색 단어

- `0054_decision_search_terms.sql`만 추가했다. 한국어 조사 한 번 제거(남은 길이 2 미만이면 원래 단어 유지), 중복 단어의 마지막 위치 기준 최근 32개를 사용한다.
- 후보 권한 WHERE, can_see, scope, 정정 제외, 점수 0.65/0.35, 의미 유사도 0.25, 정렬·한도·권한은 유지했다. candidates CTE부터 grants까지 0053과 **문자열 동일**([비교 기록](sql-permission-comparison.txt)).
- 회귀 검사를 먼저 추가한 [sql-red.txt](sql-red.txt)에서 조사 포함 질문의 누락을 확인했다. 초기 0054 생성 과정의 JavaScript 치환 문자열 처리 실수로 SQL 문법 검사가 실패했다([기록](sql-migration-failure.txt)). 치환을 함수로 바꿔 SQL을 수정했으며, 잘못된 SQL은 로컬 실DB나 운영 DB에 적용하지 않았다.
- 최종 PGlite **243검사·2,016권한 조합 통과**([sql-final.txt](sql-final.txt)). 조사, 이전 단어 40개 뒤의 최신 질문, security definer/anon·authenticated·service_role 권한을 검사한다. `0004_worker_cron.sql`은 PGlite의 pg_cron/pg_net 부재로 기존 하니스처럼 제외했다.

## Step3: 인용한 원문 강조

- 웹·즉시 Slack·내구성 Slack의 내부 원문 링크에 `?answer=<ID>`를 넣었다. 원문·질문 텍스트는 URL에 넣지 않는다. 기존 외부 Slack/Notion 링크는 유지한다.
- 원문 API는 세션의 활성·미삭제 항목을 먼저 읽는다. 유효한 답변 UUID가 있으면 기존 citations RLS로 해당 답변/항목의 quote만 읽는다. 새 권한 판단을 앱에 복제하지 않았다.
- 인용이 없거나 조회 오류·예외·불일치이면 동일한 원문을 `highlight: null`로 반환한다. 원문 자체가 숨겨진 경우에는 인용을 조회하지 않고 404다.
- React 텍스트 노드로 첫 일치 범위를 `<mark>` 표시하고 중앙으로 스크롤한다. 원문 속 HTML도 텍스트다. 원문 요청과 상태 key에 answer ID를 포함한다.
- 안내 문구는 쉬운말 규칙에 맞춰 “답변에 쓰인 원문”으로 표현했다. 강조가 없을 때는 “저장된 원문”으로만 안내해 타인의 질문 존재를 드러내지 않는다. 긴 자료는 저장 조각 한 부분임을 안내한다.
- TDD: [highlight-red.txt](highlight-red.txt) → [targeted-unit.txt](targeted-unit.txt). 문구 검사 [2파일·차단/경고 0](highlight-wording.txt).
- 실제 컴포넌트/CSS와 합성 API로 화면 **12검사 통과**([browser.json](browser.json), [ui.txt](ui.txt)). 기존 8검사에 정확한 강조·강조 없이 읽기를 추가했다. 1440/390px, 원문 중복 없음, HTML 비실행, 숨긴 원문, 가로 넘침 없음, 외부 요청 0건을 확인했다.
- 콜드 Vite 빌드가 최초 30초 탐색 제한을 넘긴 [시작 실패](ui-startup-failure.txt)는 탐색 제한을 120초로 조정했다. 인용 카드가 `<q>`인데 `<blockquote>`로 가정한 [선택자 실패](ui-selector-failure.txt)는 렌더링된 원문이 한 번인지 검사하도록 고쳤다. 제품 동작을 완화하지 않았다.
- 화면: [데스크톱 답변](ask-1440.png) · [데스크톱 원문](evidence-1440.png) · [모바일 답변](ask-390.png) · [모바일 원문](evidence-390.png) · [원문 차단](evidence-hidden-390.png). 모바일 강조 화면은 이미지로 직접 확인했다.

## Step4: 전체 검증

| 명령 | 결과 | 실행 기록 |
|---|---|---|
| `npm run lint` | 통과, wording 차단 0·경고 77 | [lint.txt](lint.txt) |
| `SASU_VERIFY_BUILD=1 node scripts/review-qa.mjs build` | 프로덕션 빌드·TypeScript 통과 | [build.txt](build.txt) |
| `npm run test -- --maxWorkers=2 --testTimeout=30000` | 139파일·1,383검사 통과 | [unit.txt](unit.txt) |
| `node scripts/verify-security-sql.mjs D:/바이브코딩/.sasu-qa-db` | 243검사 통과 | [sql-final.txt](sql-final.txt) |
| `node scripts/verify-grounded-answer-ui.mjs` | 12검사 통과 | [ui.txt](ui.txt) |
| `node scripts/review-qa.mjs setup` | 로컬 0054 적용·Auth 준비 통과 | [local-setup.txt](local-setup.txt) |
| `node scripts/review-qa.mjs grounded-answer-test --reporter=line` | 실제 E2E 1건 통과, 약 2분·질문 5건 자동 완료 | [live/test.txt](live/test.txt), [결과](live/result.json) |

빌드는 review-qa 래퍼가 **로컬 URL/인증 정보**를 설정한 뒤 같은 Next 프로덕션 빌드를 실행했다. 검사 순서는 lint → build → 전체 unit → SQL final → UI → 로컬 DB E2E다. Windows에서 녹음 시뮬레이션의 시간 제한 변동을 피하려고 전체 테스트 worker 2개·timeout 30초를 사용했으며 테스트 기대값은 바꾸지 않았다. 이후 변경한 검증 스크립트는 [추가 ESLint](final-test-lint.txt)로 확인했다.

### 실제 로컬 연결 결과

Docker Supabase PostgreSQL·Auth·RLS·pgvector·PostgREST, Next 개발 서버 `localhost:3011`, Chromium, 실제 Groq·Voyage를 연결했다. API 가로채기나 모의 DB는 없다. 합성 부서에 문서·회의·비공개 자료·교육 조건/예외와 2020년 결정을 시드했다. 사용자 읽기는 세션/RLS를 통과하며 service client는 합성 fixture 설정·검증에만 사용한다.

- 질문 → 202 → after 워커 → 고정 안내 본문·인용 순서 저장 → 화면 표시. 질문 **5건**이 모두 자동 완료됐으며 수동 워커 트리거는 쓰지 않았다.
- 문서·회의·오래된 결정의 링크, 새로고침 후 재열람, 원문이 한 번만 표시됨을 확인했다.
- 질문자의 원문 링크는 200 + 정확한 mark, 다른 멤버의 동일 링크는 **동일한 200 + 원문 + mark 없음**이었다.
- 조건/예외 질문은 거절이 아닌 **done**, `error_code: null`이었다. 일반 한도와 예외 두 문단을 한 인용으로 저장·강조했다([화면](live/conditions-exception-evidence.png)). 이미지도 직접 확인했다.
- 비공개·다른 부서·다른 질문자의 답변 차단, 팀장 권한 회수, 원문 제거 후 404, 팀원 390px 넘침 없음, 브라우저 오류 0을 확인했다.
- 실행 기록: [live/README.md](live/README.md). 로컬 합성 자료는 후속 확인용으로 보존했다.

| 실제 연결 사용량 | 9/22 | 이번 실행 |
|---|---:|---:|
| 질문 수 | 4 | 5 |
| Groq 호출 | 5 | 5 |
| 입력 토큰 | 5,707 | 6,102 |
| 출력 토큰 | 4,094 | 3,232 |

출처는 이번 부서·실행 시작 시각으로 한정한 로컬 `llm_calls`의 [사용량 기록](live/llm-telemetry.json)이다. 교육 질문과 자료를 추가했으므로 **같은 사례끼리의 성능 비교가 아니다**. 최종 상태는 step1~3 `completed`, step4 `blocked`(로컬 검증 완료, 운영 승인 대기)다.

## 코드 검토와 한계

- [코드 관계·수동 흐름도](dependencies.md). Graft/Archify 도구가 없어 실제 실행 결과는 누락이다. 파일/호출처 검색과 수동 Mermaid만 사용했다.
- 모델이 선택한 문단의 적합성과 원문 사실성은 사람이 판단한다. 번호/원문 일치 검증이 의미적 정확성을 보장하지 않는다.
- 조각 경계에서 나뉜 조건은 검증하지 않았다. 앞뒤 조각 이동 기능도 없다.
- 의미 유사도 기준 0.25는 유지했다.
- Slack 실제 발송, 운영 DB·배포, 파일 업로드 경로는 이번 검증 범위가 아니다.
- 9/22 `grounded-answer-2026-09-22/`와 `answer-grounded-live.json`을 덮어쓰지 않았다. 모델 평가 보고서에는 ID·판정·사용량만 남겼다.

## 운영 반영 순서 — 아직 실행하지 않음

### 같은 날 후속 회귀 기록

phase31 문체 후속 작업에서 ASK A09가 다시 실패했다(9/10). 원시 결과를 보존하고, step1에서 허용한 두 번의 프롬프트 보완 중 남은 한 번으로 일반 기준/예외를 함께 고르는 번호 범위 예시를 추가했다. 동일 코드의 후속 평가 두 번은 각각 10/10이었다. **누적 보완 2/2회**이며 앞선 1회 기록은 그 시점의 결과다. 서버 원문 추출·검색·RLS·기대값은 유지했다. [후속 결과와 한계](../llm-style-followup-2026-09-23/README.md). 운영 승인 대기 상태는 동일하다.

### 반영 순서

1. 사용자 승인 후 승인된 QA/운영 DB에 **0053 → 0054** 적용. 앱보다 먼저이며 기존 앱과 호환된다.
2. 앱 배포.
3. 승인된 QA 조직에서 웹·Slack DM·채널 질문 → 결정 → 원문 강조를 확인.
4. 롤백 시 앱만 되돌리고 추가 함수·nullable 컬럼은 남긴다.

ADR-049·AGENTS.md와 phase32 step4에 따라 운영 반영은 사용자 승인 단계다. 로컬 검증이 끝나도 step4는 `blocked`로 남긴다.
