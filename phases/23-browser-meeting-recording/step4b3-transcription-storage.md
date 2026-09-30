# Step 4-B3: 전사 창 순서 처리와 시각·신뢰도 저장

## 읽어야 할 파일

- `docs/PRD.md` §3-4 ACC-01·§8·§11
- `docs/ARCHITECTURE.md` §6·§8
- `docs/ADR.md` ADR-057·070·072
- `docs/planning/웹회의_녹음_설계.md` §11.2
- `docs/02-design/features/browser-meeting-recording.design.md` 4-B3 대조 목록
- `phases/23-browser-meeting-recording/step4b2-transcription-window.md`
- `lib/pipeline/review-material.ts`, `lib/recording/transcription-window.ts`, `lib/contracts.ts`
- `supabase/migrations/0034_reviewed_materials.sql`, `0037_review_access_controls.sql`, `0060_review_recording_segments.sql`

## 작업

1. 새 migration에서 `review_parts.last_word_end_seconds`를 추가한다. `audio_segments` 창 claim은 앞 창 `done`을 요구하고 앞 창 마지막 소유 단어 끝의 다음 창 상대 시각만 반환한다. 단어·segment 원문을 DB에 저장하지 않는다.
2. `finish_review_recording_part(part, lease, sections, error, lastWordEnd)`는 기존 원본 가용성·권한·lease 검사 뒤 성공한 창의 마스킹된 sections와 숫자를 저장하고, 다음 창 job을 다시 예약한다. 마지막 창은 기존 자료 완료 로직이 인덱스 순서로 조립한다. 중복 job·지난 lease는 작업하지 않는다. 실패하면 다음 창을 깨우지 않는다.
3. 대기 중인 후속 녹음 창은 2분 sweep에서 제외한다. 선행 창이 완료되고 2분 이상 실행되지 않은 창은 기존 실패 처리에 남는다. 재추출은 시각 숫자를 초기화한다. 일반 파일 업로드·ASK·회고 경로는 바꾸지 않는다.
4. 워커의 `audio_segments` 분기만 `llm.transcribeAudio(includeTimestamps: true)`와 `projectTranscriptionWindow`를 쓴다. `ReviewSection` 계약에 nullable `confidence`와 `boundary_review`를 추가한다. 저장 전 마스킹한 sections 외 공급자 원문은 버린다.
5. SQL 격리 테스트·공급자 mock 워커 테스트·중복/재시도/철회/원본 만료 검사를 실행한다. 성능은 합성 2창·실제 Groq 2창의 완료 시간을 기록하고, 30창 운영 시간은 별도 게이트로 남긴다.

## 구조·코드 관계

- Graft로 `finish_review_segment → jobs → processReviewPart → finish_review_part → reviewed_materials` 호출·데이터 관계의 전후를 확인한다.
- Archify로 순서 처리·대기·재시도·철회 흐름을 그린다. 도구가 없으면 대체 구조도를 남기고 실제 Archify 결과 누락을 표시한다.
- 산출물은 `docs/verification/browser-meeting-recording/accuracy-step4b3.md`에 연결한다.

## Acceptance Criteria

```bash
node scripts/verify-security-sql.mjs <pglite-설치-경로>
npx vitest run tests/pipeline/review-material.test.ts tests/recording/transcription-window.test.ts tests/contracts.test.ts
npm run lint
npm run build
npm run test -- --maxWorkers=2 --testTimeout=15000
```

- 2창 경계에서 앞 창 마지막 단어가 60.3초에 끝나면 뒤 창 0.0~0.3초 시작 단어는 저장되지 않는다.
- 뒤 창 job이 먼저 실행되면 LLM·DB 원문 쓰기 0건이며, 앞 창 완료 후 새 job이 처리한다.
- 실패·지난 lease·동의 철회·원본 만료 때 `ready`로 바뀌지 않는다. 재추출 후 이전 시각이 재사용되지 않는다.
- 일반 파일 업로드·ASK·회고 음성의 응답 형식과 처리 순서는 유지된다.

## 금지사항

- 전사 원문·word·segment 배열을 DB·로그에 쓰지 마라. 이유: 저장 전 마스킹 원칙 위반이다.
- 다음 창을 선행 완료 전에 claim하지 마라. 이유: 경계 중복 판정에 필요한 마지막 단어 끝을 모른다.
- 요청 경로에서 service role을 사용하지 마라. 이유: 권한 경계는 서버·RLS가 집행한다.
- 운영 DB에 migration을 적용하지 마라. 이유: phase 23 실제 기기·성능·사용자 승인 게이트 전이다.
