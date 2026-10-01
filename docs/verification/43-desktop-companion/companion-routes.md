# Step 6 — companion-routes 검증 기록

- 실행일: 2026-10-02 KST
- 범위: 데스크톱 동반 앱 E05~E13 Route Handler와 받은 일 정규화. 운영 DB, 배포, 외부 발신, LLM 호출은 수행하지 않았다.

## 구현 내용

- `lib/companion/inbox.ts`: 사용자 세션 클라이언트로 본인의 최근 24시간 답, 담당 카드, 팀장 본인의 최근 자료만 읽어 내용 없는 받은 일로 정규화한다. 영업 작업은 step 7 전까지 빈 배열이다.
- `lib/contracts.ts`: `CompanionInbox`·`CompanionTranscriptMeta`·자료 구간·질문 커서 스키마를 추가했다. 받은 일에는 질문 원문, 답 본문, 카드 배경을 넣지 않는다.
- `app/api/companion/**`: E05~E13 모두 `requireDeviceContext()`로 기기 세션을 확인하고 `jsonResult()`로 `Cache-Control: private, no-store`를 붙인다.
- 질문·답·카드·결정·회의 받아쓴 글은 각각 `startAsk`·`readAnswerView`·`loadCardView`·`decideCard`·`ingestTranscript`를 호출한다. Route Handler에 기존 업무 로직을 복제하지 않았다.
- 자료 등록과 구간 처리는 사용자 JWT의 `create_review`·`queue_review_part` RPC를 사용한다. 구간 작업은 기존 처리기 등록 후 `kickWorker()`로 시작한다.
- 회의 받아쓴 글은 `Content-Length`가 4MB를 넘으면 본문을 읽기 전에 `413 too_large`를 반환하며, 헤더가 없거나 틀린 경우에도 읽은 파일 크기를 다시 확인한다.

## TDD 및 로컬 API 검증

1. `tests/companion/inbox.test.ts`를 먼저 추가하고 구현 파일이 없는 실패를 확인한 뒤 `buildInbox()`와 `loadInbox()`를 작성했다.
2. 순수 정규화 테스트는 24시간 경계, 삭제 자료 제외, 응답 필드 제한을 확인한다.
3. 조회 테스트는 팀장 `needs_review`, 팀원 `open` 전용, 본인 답·자료 필터, 팀원의 자료 조회 생략, 데이터베이스 상세 비노출을 확인한다.
4. `scripts/verify-companion-api.mjs`는 격리 로컬 Supabase와 합성 시드만 사용했다. 웹 쿠키 경로와 앱 Bearer 경로의 답 2건이 같았고, 팀원 답의 `leads_only` 인용은 0건이었다.
5. 같은 카드를 앱에서 두 번 결정해 `decisions` 1건을 확인했다. 다른 부서 카드는 404, 담당자가 아닌 팀원 결정은 403이었다.
6. 받은 일에는 담당 카드와 본인 답만 있었고 다른 사용자 항목은 없었다. 팀원 회의·자료 등록은 403, 팀장 4MB 초과 회의는 413, 팀장 자료 등록→기기 세션 Storage 업로드→구간 작업은 201→202였다.
7. 기기 연결 해제 뒤 E05~E13 아홉 경로가 모두 401이었다. 검증 전후 `llm_calls` 행 수 차이는 0이었다.

로컬 API 결과:

```json
{"answerParity":2,"memberLeadsOnlyCitations":0,"decisionRows":1,"crossDepartmentCard":404,"memberDecision":403,"inboxIsolation":true,"memberTranscript":403,"oversizedTranscript":413,"memberReview":403,"reviewCreated":201,"reviewPart":202,"revokedRoutes":9,"llmCalls":0,"failed":0}
```

## 권한·구조 확인

- `app/api/companion/**`에서 service role 생성·키 참조는 0건이다. 전사 공용 함수 안의 기존 수집 어댑터 예외만 유지했다.
- E05~E13은 요청 본문·URL에서 부서를 받지 않는다. 자료 구간의 `dept_id` 조건도 `device.ctx.deptId`만 사용한다.
- Route Handler의 `console.log/error/warn`과 질문·파일 내용 로그는 0건이다.
- 카드·답·자료 조회는 사용자 JWT와 RLS를 사용하며 `can_see()` 판정을 TypeScript에 복제하지 않았다.
- 받은 일 응답은 허용 필드만 새 객체로 만들고 Zod strict 스키마로 다시 검사한다.

Graft 0.21.1을 격리 Node 22 컨테이너에서 저장소 복사본에 실행했다. 740/740 파일을 파싱해 3,367 nodes·8,446 edges를 만들었고 `graph check: OK`였다. `requireDeviceContext` 호출자는 E05~E13 Route Handler 전부와 기존 E01~E04·테스트였으며, `loadInbox` 호출자는 E05와 단위 테스트뿐이었다. 따라서 새 앱 경로가 기기 컨텍스트와 공용 함수 입구를 우회하지 않음을 확인했다.

## Acceptance Criteria

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/companion` | 3 files, 23 tests passed |
| `npm run lint` | 성공. 기존 ESLint 경고 2개와 wording 비차단 경고만 출력 |
| `npm run build` | 성공. TypeScript와 Next.js 16.3.4 production build 통과 |
| `npm run test` | 181 files, 1,827 tests passed |
| `node scripts/verify-companion-auth.mjs` | 11개 인증·연결·해제 항목, `failed: 0` |
| `node scripts/verify-companion-api.mjs` | E05~E13 시나리오, `llmCalls: 0`, `failed: 0` |
| `git diff --check` | 통과 |

운영 반영은 하지 않았다. 데스크톱 앱 본체와 배포 검증은 뒤 step의 범위다.
