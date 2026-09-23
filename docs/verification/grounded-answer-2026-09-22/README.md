# ASK 근거 확인 보완 검증 — 2026-09-22

상태: 코드 구현·로컬 검증과 **실제 로컬 Supabase → Next.js → 브라우저 E2E 완료**. 운영 DB·배포는 미적용이다. Graft/Archify 실행은 미검증으로 남긴다. 이 기록은 운영 완료 보고가 아니다.

## 변경 결과

- 결정 검색: 최신 3건 제한을 제거하고 질문 벡터·단어로 관련 결정을 최대 8건 가져온다. `can_see()`·사용자 일치·채널 공개 범위·정정 이전 결정 제외는 SQL에서 집행한다.
- 원문 확인: 문서·회의 인용과 Slack 링크 실패를 `/d/[dept]/evidence/[id]`로 연결한다. 세션·멤버십·RLS·삭제·소스 활성 상태를 적용한 API가 저장된 마스킹 원문만 반환한다.
- 답변: AI는 관련 문단을 선택하고 코드는 완전한 문단만 번호와 함께 조립한다. 자유 서술 `answer` 필드를 출력 스키마에서 제거했다. 문단 일부·출처 중복·검색 밖 ID는 재선택 후 거절한다.
- 인용 번호: `citations.ordinal`을 `complete_answer`에서 원자 저장하고 웹·Slack 모두 같은 순서로 읽는다. 기존 완료 RPC의 잠금·멱등·권한은 유지한다.
- 설명: PRD §3·§6-5·§8, ADR-066, ARCHITECTURE와 AI-DEVELOPMENT에 선택 이유·방법을 반영했다. [보완 원고](../../submission/개발과정_보완설명_2026-09-22.md)는 381자이며 기존 제출 완료본은 보존한다.

## 실제 실행 결과

| 명령·검증 | 결과 | 근거·범위 |
|---|---|---|
| 최초 신규 테스트 | 구현 모듈 없음 1 suite + 동작 5건 실패 | [red.txt](red.txt), 구현 전에 실행 |
| 중간 집중 검사 | 77 통과·2 실패 | [focused.txt](focused.txt), 옛 answer 필드 fixture와 부분 인용 fixture를 새 계약에 맞춤 |
| `npm run lint` | 통과, 문구 차단 0·경고 77 | [lint.txt](lint.txt) |
| `SASU_VERIFY_BUILD=1 npm run build` | 통과 | [build.txt](build.txt), Next.js 16.3.4·타입·페이지 생성 |
| `npm test` | **138파일, 1,352개 통과** | [unit.txt](unit.txt), 최종 fixture·비선택 원문 조회 경계 포함 |
| `node scripts/verify-security-sql.mjs D:/바이브코딩/.sasu-qa-db` | **240 검사·권한 조합 2,016개 통과** | [sql.txt](sql.txt), 격리 PGlite, 0053 적용, pg_cron/pg_net 제외 |
| `node scripts/verify-grounded-answer-ui.mjs` | **8 검사 통과**, 1440/390px | [browser.json](browser.json), 실제 컴포넌트·앱 CSS, API 가상 응답, 외부 요청 차단 |
| `SASU_ANSWER_EVAL_ISOLATED=1 npx vitest run --config vitest.eval.config.ts tests/evals/answer-live.eval.ts` | **7/7 통과**, Groq 7회 | [model.txt](model.txt), [원시 결과](../evaluation-results/answer-grounded-live.json), 검색·임베딩·저장·telemetry 모의, Slack 발송·원격 DB 쓰기 0 |
| TDD guard | 통과 | [tdd-guard.txt](tdd-guard.txt), 새 `lib/answer-grounding.ts`의 선행 테스트 |
| `git diff --check` | 통과 | 공백 오류 0 |
| `node scripts/review-qa.mjs grounded-answer-test --reporter=line` | **실제 DB E2E 1개 통과, 34.9초** | [상세 기록](live/README.md), [결과](live/result.json), 자동 워커 질문 4건, 실제 Groq 5회·Voyage, RLS·Auth·브라우저 연결 |

SQL 첫 검사에서 한 출처를 두 번 인용한 fixture가 기존 `citations_owner_item_unique`에 걸렸다. 실제 생성 경로에서도 같은 실패가 가능하므로 문단 검증과 프롬프트에 출처 중복 거절을 추가했다. 인용 순서 SQL 검사는 서로 다른 두 출처를 사용하도록 수정했으며, 별도 파이프라인 회귀로 중복 출처가 저장에 도달하지 않음을 확인했다.

## 사용자 흐름 화면

- [1440px 질문·근거](ask-1440.png) · [390px 질문·근거](ask-390.png)
- [1440px 원문](evidence-1440.png) · [390px 원문](evidence-390.png)
- [1440px 열람 거부](evidence-hidden-1440.png) · [390px 열람 거부](evidence-hidden-390.png)

질문 입력→출처 번호와 원문 보기→원문 화면 이동을 확인했다. 다시 열 때 404이면 기존 원문을 남기지 않는다. `<script>` 모양의 문자열도 텍스트로 표시되고 실행되지 않으며 390px 가로 넘침이 없다. 화면의 원문은 검증용 가상 자료다.

## 판단과 검증의 한계

- 실제 모델 7건은 독립 검수되지 않은 합성 스모크 평가다. 업무 전체 정확도·검색 품질·모든 원문의 사실성을 인증하지 않는다. 7번은 줄바꿈된 조건·부정 표현 유지, 5·6번은 무관/빈 근거 거절을 확인한다.
- 새 답변은 원문 문단 추출이므로 자연스러운 요약·추천이 줄어든다. 문단 선택의 적합성과 실제 업무 결정은 사람이 확인한다. 기존 저장 답변·카드의 자유 서술까지 이 방식으로 소급 검증된 것은 아니다.
- 후속 요청에서 Docker를 기동해 실제 로컬 Supabase·Next 서버·브라우저를 연결했다. 합성 자료를 시드하고 질문·검색·답변·원문·RLS를 검증했다. 운영 환경과 Slack 전달, 자료 업로드 과정은 이 실행에 포함하지 않았다. [실연결 검증](live/README.md)
- Graft·Archify 실행 도구를 확인하지 못했다. 실제 소스 검색·호출 관계·Mermaid 구조 검토로 확인한 범위와 누락을 [dependencies.md](dependencies.md)에 기록한다. 도구 실행 완료로 표시하지 않는다.

## 운영 반영 순서 — 아직 미실행

1. 승인된 QA/운영 DB에 `0053_answer_decision_search.sql`을 앱보다 먼저 적용한다. 앱이 새 RPC·ordinal을 사용하므로 순서가 필수다. 기존 앱과의 DB 호환은 유지된다.
2. 새 앱 배포 후 승인된 QA 조직에서 웹·Slack DM·채널의 질문→결정→원문 열람을 실제 연결로 확인한다. 오래된 결정·부서원/팀장 권한·문서/회의·정정·삭제를 포함한다.
3. 운영 반영은 AGENTS.md·ADR-049에 따른 사용자 승인 후 실행한다. 현재 세션에는 Vercel CLI가 없어 설치가 권장된다(`npm i -g vercel`). 설치·배포·운영 DB 적용은 이번 작업에서 실행하지 않았다.
4. 앱 롤백 시 이전 앱으로 되돌리고, 추가 검색 함수와 nullable ordinal 컬럼은 남겨 파괴적 DB 롤백을 피한다. 기존 저장 기록은 수정하지 않는다.
