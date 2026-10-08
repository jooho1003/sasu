# Step 0: document-summary-merge-fallback

## 읽어야 할 파일
- `/AGENTS.md` · `/docs/ADR.md` ADR-093(결정 1)·ADR-090 · `/docs/PRD.md` §8 "작업 실패 처리"
- `/docs/02-design/features/pipeline-failure-recovery.design.md` §2-1·§8 U1~U4
- `lib/pipeline/document-summary.ts`(`mergeVerifiedDocumentSummaries`·`summarizeDocument`), `lib/document-summary-check.ts`
- `tests/pipeline/document-summary.test.ts`(병합 함수 주입 테스트 98~136행 근처)

## 작업
1. 테스트 먼저: U1~U4를 `tests/pipeline/document-summary.test.ts`에 추가하고 red를 확인한다.
2. `mergeVerifiedDocumentSummaries(chunks, merge, onMergeFailure?)`: chunk가 2개 이상일 때 `merge(extracted)`가 throw하면 `onMergeFailure?.(error)`를 부르고 `extracted`를 결과로 쓴다. 결과는 지금처럼 `verifyDocumentSummary(output, items)`를 거친다.
3. `summarizeDocument`는 `onMergeFailure`로 `console.warn("document_summary_merge_fallback", { documentId: document.source_id, errorCode })`를 넘긴다. `errorCode`는 error의 `error_code` 문자열, 없으면 `"unknown"`.
4. lint·test·build.

## Acceptance Criteria
```bash
npx vitest run tests/pipeline/document-summary.test.ts
npm run lint && npm run test
npx next build --webpack
```
(이 PC의 로컬 Turbopack `next build`는 컴파일 단계에서 20분 넘게 멈춘다 — `--webpack`을 쓴다.)

## 금지사항
- chunk 추출 실패를 삼키지 마라. 이유: 검증된 결과가 없는 상태에서 성공으로 저장하면 빈 요약이 남는다(ADR-093 FR3).
- 대체본에서 `verifyDocumentSummary`를 건너뛰지 마라. 이유: 인용 없는 문장 비렌더 불변(CLAUDE.md CRITICAL).
- 로그에 문서 본문·모델 출력·error message를 넣지 마라. 이유: 로그 규칙(ID·길이·에러 코드만).
- LLM 호출 수·스키마·`status_reason` 값·DB를 바꾸지 마라.
- 훅 우회·커밋·푸시 금지.
