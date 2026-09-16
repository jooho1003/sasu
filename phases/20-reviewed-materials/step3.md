# Step 3: tts-verification

## 읽어야 할 파일
- docs/PRD.md §11, docs/verification/continuity-production-2026-09-16.md
- scripts/generate-review-audio.ps1, tests/e2e/support/auth.ts

## 작업
합성 한국어 TTS 파일과 정답 문장을 만든다. 로컬 Supabase·실제 Groq를 연결한 앱에서 업로드부터 끝 구간 전사, 편집·저장·재접속·확정·중지·삭제를 완주한다. 변환 결과의 핵심 사실/마지막 문장과 실패 사례를 기록한다. 합성 API와 실제 연동 결과를 구분하고 스크린샷·쿼리로 남긴다.

## Acceptance Criteria
`npm run lint`, `npm run build`, `npm test`, 해당 E2E와 SQL 검사. 실행 결과를 docs/verification에 기록하고 phase 상태를 갱신한다. 결과 없이 completed로 표시하지 않는다.

## 실행 결과
개발 및 격리 검증 완료. [실행 증거](../../docs/verification/reviewed-materials-2026-09-16/README.md)를 참조한다. 운영 배포·정기 백업 설정은 완료 범위에 포함하지 않는다.
