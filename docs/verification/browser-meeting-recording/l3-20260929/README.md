# phase 23 L3 제품·데모 E2E — 2026-09-29

`/pdca analyze browser-meeting-recording` §2.7의 L3(미실행)을 채운 기록이다. 실제 기기·실제 회의 결과가 아니라 **합성 음성 파일 + 실제 로컬 서버·Supabase·Storage·워커·Groq 전사**다.

## 대상과 환경

| 항목 | 값 |
|---|---|
| 코드 | 커밋 `659f131`(G-1 포함)의 격리 worktree. 원본 작업 트리의 다른 세션 미커밋 변경(phase 33·step4-B·migration 0063)은 포함하지 않음 |
| DB | 로컬 `review-qa` Supabase(`127.0.0.1:54321`). 원격 DB는 쓰지 않음 |
| 환경 변수 | Supabase URL·anon·service role 키는 로컬 `review-qa` 값만 사용. 원본 `.env`에서는 모델 키(`GROQ_API_KEY`·`VOYAGE_API_KEY`·`OPENAI_API_KEY`·`EMBEDDING_*`)만 가져옴. `RECORDING_KEY_SECRET`은 실행마다 새 난수, Slack·Notion·회고 연결 변수는 제거. worktree에 `.env` 파일 없음 |
| 외부 호출 | 합성 음성(`tests/fixtures/synthetic-meeting-ko.wav`) 전사와 요약·임베딩이 Groq·Voyage로 전송됨 |
| 서버 | `next build` → `next start`(127.0.0.1:3200), Chrome |

## 로컬 QA DB 준비 (로컬 전용)

1. `review-qa`에는 번호 정리 전 이름(`0056_review_recording_sessions`·`0057_review_recording_segments`)으로 적용 기록이 있어 `setup`이 커밋된 0059를 다시 적용하려다 `recording_session_migration_requires_empty_legacy_recordings`로 멈췄다(트랜잭션 롤백, 변경 없음).
2. 0059·0060 파일의 함수 25개 본문을 설치된 `prosrc`와 비교했다. 24개 동일, `authorize_review_access` 1개는 주석(`ADR-069` → `ADR-070`)만 다름 → 기능상 같다고 판정하고 `review_qa_migrations`에 새 이름 2행을 기록했다.
3. `node scripts/review-qa.mjs setup`으로 HEAD의 0061·0062만 적용(0063 미적용 확인). 합성 사용자 생성 단계는 이미 있는 계정 때문에 `local_user_create_failed`로 끝났지만 필요한 시드(부서 `22222222-…222`의 동의한 부서장 `review-lead`)는 이미 있었다.
4. 조직 녹음 스위치: 원래 `org_settings` 행 없음(꺼짐) → 실행 동안 `browser_recording_enabled=true` 행 추가 → **실행 뒤 행 삭제로 복구**(확인: 0행).

## 결과

`npx playwright test --config playwright.recording-product.config.ts` — **8 통과 · 0 실패 · 0 skip** (1.1분, build 31.2초)

| # | spec | 사례 | 판정 대상 |
|---|---|---|---|
| 1 | demo-meeting-recorder | 심사위원은 로컬 녹음을 재생·내려받고 합성 전사와 분리해 본다 | V11 (DB·Storage·jobs·llm_calls 증가 0, `SASU_TEST_DOCKER_DB_CONTAINER=supabase_db_review-qa`) |
| 2 | demo-meeting-recorder | 마이크 거절 뒤에도 준비된 합성 회의를 끝까지 체험한다 | REC-05 |
| 3 | demo-reviewer | 공개 링크가 심사위원 계정으로 연결되고 전체 기능을 연다 | 게스트 |
| 4 | demo-reviewer | 각 기능 화면이 데이터를 불러온 뒤에도 오류 화면으로 바뀌지 않는다 | 게스트 |
| 5 | demo-reviewer | 심사 계정의 앱 요청과 직접 DB 변경을 모두 거부한다 | 게스트 무쓰기 |
| 6 | demo-reviewer | 390px에서도 기능 지도와 추천 시작점이 잘리지 않는다 | 반응형 |
| 7 | demo-reviewer | 결정·기록·질문·자료 검토를 브라우저 안에서 끝까지 체험한다 | 게스트 |
| 8 | recording-product | authenticated production build records and saves synthetic audio through real local services | 로그인 → 녹음 → 저장 → 구간 업로드·검증 → 전사 → 편집·확정 → 요약(인용 1개 이상)·분류, CSP 위반 0 |

화면: [product-local-synthetic.png](product-local-synthetic.png)(확정 뒤 검토 화면) · [demo-local.png](demo-local.png). 테스트가 기본 경로에 다시 찍은 스크린샷은 원본 트리의 같은 파일(다른 세션 미커밋)과 부딪히지 않도록 이 폴더에 새 이름으로 옮겼다.

## 판정하지 않은 것

- V01~V06 실제 기기(마이크·Meet/Zoom 탭 소리), V13 제공사 확인, V14 CSP 강제 — 사람 게이트
- phase 33·step4-B가 더해진 트리의 L3 — 다른 세션이 별도로 실행(`docs/verification/recording-ux-2026-09-29/README.md` §6, 9/9)
