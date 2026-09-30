# step1-C 요약 — 2026-09-25

녹음 저장부터 구간 검증·전사 연결·구간 접근권·파기까지 서버 경로를 구현했다. Codex 한도 소진으로 Claude가 직접 실행했고, 균형 티어 노드(워커·라우트·실제 Storage·구조도)는 sonnet 서브에이전트가 맡았으며 메인이 모든 결과를 다시 읽고 검토했다. 플랜: `.claude/plans/recording-segment-verification-2026-09-25.*`.

- SQL `0060_review_recording_segments.sql`: `review_original_segments`, 저장·finalize·claim/finish·구간 접근권 RPC, 형식별 원본 가용성, 구간 INSERT 정책, 구간 경로 결속 접근권 소비, `review_action` 재포장, 저장 중 녹음의 폐기·만료·취소·철회 파기.
- 계약 `lib/contracts.ts`, 워커 `lib/pipeline/review-material.ts`(`verify_review_segment`·전사 창 메모리 조립·구간/접두사 파기), API save·finalize·원본 `segment`·검토 상세 `segments`, 공통 함수 `lib/recording/recording-routes.ts`.
- 검증: 격리 SQL 277(새 18)·돌연변이 6/6, 단위 145파일·1,592, lint·build, 실제 로컬 Supabase 0059·0060 적용과 Storage 통합 18(LLM 0·외부 요청 0), Archify 9/9, Graft 전후 그래프. 기록: `docs/verification/recording-segments-2026-09-25/README.md`.
- 다음 step이 알아야 할 것: 클라이언트 흐름은 `POST /recordings` → `/key` → 녹음 → `/save`(manifest v1 + capture v1) → 응답의 `path`에 구간 업로드(409는 업로드됨) → `/finalize` → `GET /reviews/[id]`의 `segments`로 다시 올릴 구간 확인 → 세션 `completed`면 로컬 삭제. 구간 재생은 `GET /reviews/[id]/original?action=play_original&segment=N`. ReviewDetail `retry()`는 구간 자료에서 `parts/` 업로드 대신 `POST /reviews/[id]/parts`만 불러야 한다(step2).
- 남은 게이트: step0 실제 기기 V01~V06, 운영 DB `input_method<>'upload'` 0건 확인 뒤 0058~0060 적용 승인, step2 녹음 화면, 실제 동시 트랜잭션 경합·실제 Groq 전사 확인.
