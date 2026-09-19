# Step 3: retro-draft-job

`retro_draft` 잡을 파이프라인에 등록하고, 초안 생성 → 인용 검증 → 저장 → Slack DM까지 잇는다. 라우트·화면은 없다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-6 (RET-04) · `/docs/ARCHITECTURE.md` §3.2·§3.3·§3.5·§6-4 불변식 25
- `docs/planning/개발_회고_자동화_설계.md` §5 — 프롬프트 규칙·청크·알림
- `lib/jobs.ts` (`JobKind`·`registerHandler`·`SAFE_ERROR_CODES`·`FAILURE_OWNER_MAPPINGS`·`sweepPendingRows`) · `lib/worker.ts` (`registerWorkerHandlers`)
- `lib/llm.ts` (`LlmPurpose`·`structured`·`FIELD_ORDER_INSTRUCTION`) · `lib/contracts.ts` `RetroDraft` (step 1)
- `lib/pipeline/card.ts`·`lib/pipeline/document-summary.ts` — 프롬프트 구성·검증·실패 처리 원형
- `lib/pipeline/review-material.ts` — `claim_/finish_` 펜싱 호출 형태
- `lib/pipeline/send-slack.ts:131-299` — `openDirectMessage`+`postMessage` 조합·에러 코드
- `lib/retro/{verify,chunk}.ts` (step 1)

## 작업

1. `lib/jobs.ts`: `JobKind`에 `"retro_draft"`. `SAFE_ERROR_CODES`에 `retro_no_citations`·`retro_claim_missed` 추가. `FAILURE_OWNER_MAPPINGS`에 `retro_draft → retro_days(status='failed', status_reason=code)`. `sweepPendingRows()`에 `retro_days.status='drafting' and updated_at < now()-2min → failed/llm_timeout`.
2. `lib/llm.ts`: `LlmPurpose`에 `"retro_draft"`(생성 모델). 다른 변경 없음.
3. `lib/pipeline/retro-draft.ts` (**테스트 먼저** `tests/lib/pipeline/retro-draft.test.ts`, `llm`·Supabase mock):
   - `draftRetro({dayId, revision})`: service 클라이언트로 `claim_retro_draft` → null이면 `retro_claim_missed`로 조용히 종료(no-op) → 활동을 `chunkRetroActivities`로 나눠 청크마다 `llm.structured("retro_draft", RetroDraft, {system, user}, {deptId, jobId})` → `mergeRetroDrafts` → `verifyRetroDraft` → `finish_retro_draft(day, revision, title, body, topics, null)`; `valid=false`면 `finish_retro_draft(..., 'retro_no_citations')`가 `needs_review`로 만든다. LLM 에러는 `LlmGatewayError.error_code`를 `p_error`로.
   - 프롬프트 `system`: 설계 §5 규칙(1인칭 평서문·활동에 없는 사실 금지·`web_visit`는 "찾아본 것"으로만·`highlight`는 외부 공개 전제·quote는 활동 원문에서 그대로 복사). `user`: `[A-<n>] <kind> · <at KST> · <title> — <text>` 줄 목록. 활동 id는 `A-<n>` 별칭으로 넣고 응답의 `activity_id`를 실제 uuid로 되돌린다(uuid 오타 방지).
   - `registerRetroDraftHandler()` → `lib/worker.ts`에 import·호출.
4. 알림: `finish_retro_draft`가 `draft`를 만들었을 때만 `members.slack_user_id`(같은 dept·user)를 조회해 DM. 텍스트 `"{M}월 {D}일 회고 초안이 준비됐어요 · 활동 {N}건"` + 버튼 링크 `${APP_URL}/d/${dept}/retros/${dayId}`. `slack_not_configured`·`slack_dm_unavailable`은 삼킨다(초안은 남는다). `needs_review`일 때는 `"회고 초안을 만들지 못했어요 — 활동 {N}건을 확인해 주세요"`.
5. 로그: `retro_draft day=<id> rev=<n> activities=<N> chunks=<k> dropped=<d> status=<…>`만. 제목·본문·quote 금지.

## Acceptance Criteria

```bash
npm run test -- tests/lib/pipeline/retro-draft.test.ts tests/lib/jobs.test.ts   # 통과: claim null no-op · 청크 2개 병합 · 인용 0 → needs_review · LLM 타임아웃 → failed/llm_timeout · DM 실패 무시
npm run lint && npx tsc --noEmit
```

## 금지사항

- Groq SDK를 직접 부르지 마라. 이유: CRITICAL — `llm.structured` 하나.
- 사용자 세션 클라이언트를 잡 안에서 쓰거나, service 클라이언트로 `retro_days`를 직접 update하지 마라. 이유: 상태 전이는 `claim_/finish_` RPC 펜싱으로만(검토함과 동일).
- 검증에서 탈락한 항목을 "인용 없음" 표시로 남기지 마라. 이유: 불변식 25 — 렌더도 저장도 하지 않는다.
- DM 본문에 회고 문장·활동 제목을 넣지 마라. 이유: `leads_only`/`self` 내용이 Slack에 남는다. 건수와 링크만.
