# Step 1: review-part-failure-reason

## 읽어야 할 파일
- `/AGENTS.md` · `/docs/ADR.md` ADR-093(결정 2) · `/docs/PRD.md` §8 "작업 실패 처리"
- `/docs/02-design/features/pipeline-failure-recovery.design.md` §2-2·§8 U5~U8
- `lib/pipeline/review-material.ts`(`processReviewPart` 30~169행)
- `supabase/migrations/0063_review_transcription_windows.sql`(`finish_review_recording_part` — 검증 raise가 `finish_review_part` 호출보다 먼저, `p_error`가 있으면 구간 failed·다음 구간 예약 없음), `supabase/migrations/0034_reviewed_materials.sql`(`finish_review_part` 기본형 — lease·상태 확인 후 `p_error`면 구간 `failed`·자료 `failed(status_reason=p_error)`)
- `tests/pipeline/review-material.test.ts`

## 작업
1. 테스트 먼저: U5~U8을 `tests/pipeline/review-material.test.ts`에 추가하고 red를 확인한다. 녹음(`original_layout: "audio_segments"`)·일반 파일 각각 최소 1건.
2. `processReviewPart`의 마무리 단계:
   - 1차 호출은 지금과 같다.
   - `finish.error`가 있으면 같은 RPC를 같은 `p_part`·`p_lease`로 `p_sections: []`, `p_error: finishErrorCode(finish.error)`, 녹음이면 `p_last_word_end: null`로 다시 부른다. 2차에 `error`가 없으면 return, 있으면 `throw new Error("review_completion_failed")`.
   - `finishErrorCode`: 오류 `message`가 정확히 `transcription_boundary_invalid` 또는 `transcription_sections_invalid`면 그 값, 아니면 `review_completion_failed`.
   - 1차 `data === false`면 `console.warn("review_part_finish_rejected", { partId })` 후 return.
3. lint·test·build.

## Acceptance Criteria
```bash
npx vitest run tests/pipeline/review-material.test.ts
npm run lint && npm run test
npx next build --webpack
```

## 금지사항
- migration·SQL 함수를 추가하거나 바꾸지 마라. 이유: 기존 마무리 RPC의 `p_error` 경로가 같은 일을 한다(ADR-093 대안 C·D).
- RPC 오류의 message·details 원문을 `p_error`·로그에 넣지 마라. 이유: 원문 비저장·로그 규칙. 허용 코드 세 개만 쓴다.
- 새 lease를 만들어 다시 claim하지 마라. 이유: 동시 실행 경계가 바뀐다.
- 성공 경로의 RPC 호출 수를 바꾸지 마라.
- 훅 우회·커밋·푸시 금지.
