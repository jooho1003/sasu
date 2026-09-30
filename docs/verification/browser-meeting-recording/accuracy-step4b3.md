# Step 4-B3 전사 창 순서·저장 실행 기록

2026-09-29 · [PRD ACC-01](../../PRD.md) · [ADR-072](../../ADR.md) · [설계 대조 목록](../../02-design/features/browser-meeting-recording.design.md) · [step 명세](../../../phases/23-browser-meeting-recording/step4b3-transcription-storage.md)

## 결과

`audio_segments` 자료의 뒤 창은 앞 창이 `done`일 때만 claim한다. 첫 예약 job이 너무 일찍 도착하면 전사 호출 없이 끝나고, 앞 창을 마치는 SQL 트랜잭션이 다음 job을 새로 넣는다. 워커는 60+1초 WAV를 Groq에 보내 단어 시각으로 겹친 부분을 제거한 뒤 마스킹한 section과 마지막 단어 끝 시각 **숫자만** 저장한다. 2분 sweep은 앞 창을 기다리는 후속 창을 실패 처리하지 않는다. 재추출은 그 숫자를 지운다.

새 migration은 `0063_review_transcription_windows.sql`이다. 운영 DB에는 적용하지 않았다. 기존 단일 파일 자료·ASK·회고 음성은 기존 전사 경로를 사용한다.

## 실행 기록

| 검사 | 결과 |
|---|---|
| 워커 테스트 TDD 초기 | 새 mock 기대 4개 실패 확인 |
| `npx vitest run tests/pipeline/review-material.test.ts tests/recording/transcription-window.test.ts --maxWorkers=2` | 44개 통과 |
| `node scripts/verify-security-sql.mjs <격리 PGlite>` | 278개 통과, 권한 행렬 2,016 assertion. 0063 포함. `pg_cron`/`pg_net` 전용 0004는 격리 DB에서 제외 |
| SQL 녹음 창 fixture | 뒤 창 조기 claim 거절, 대기 sweep 보존, 60.3초→다음 창 0.3초 cutoff, 마스킹 거절, lease 중복 완료 거절, 다음 job 1건 추가, 재추출 숫자 초기화, 철회·원본 만료 후 완료 거절, RPC 실행 권한 확인 |
| `npm run test -- --maxWorkers=2 --testTimeout=15000` | 153개 파일, 1,679개 통과 |
| `npm run lint` | 통과, 기존 문구 검사 비차단 경고 79건 |
| `npm run build` | Next.js 16.3.4 빌드·TypeScript·정적 페이지 생성 통과 |

로컬 Supabase URL과 service key를 셸에서만 지정하고 `npx tsx scripts/verify-transcription-window-pair.ts`를 실행했다. 저장소의 합성 26.23초 WAV를 반복하여 60초+16초 원본을 만들고, 실제 제품의 WAV 조립·Groq `verbose_json`·순수 변환을 두 창에 적용했다. 첫 창 1,443ms(96 words, 17 sections, 마지막 소유 단어 끝 60.94초), 둘째 창 709ms(25 words, 5 sections), 공급자 호출 합계 **2,152ms**였다. 반복 합성 음성이므로 일반 회의의 품질·처리 시간 추정치로 사용하지 않는다. 스크립트는 전사 문장·키를 출력하지 않는다.

## 코드 관계·구조 검토

- Graft 구현 전 기준: 이전 4-B2 작업 후 그래프의 `processReviewPart`가 `lib/pipeline/review-material.ts`에 있고, 자료 검토 화면·계약을 참조함을 확인했다. 구현 후 현재 스냅샷은 614개 파일, 2,927개 노드, 7,426개 엣지다. `graft callers projectTranscriptionWindow`는 `processReviewPart`와 순수 테스트를, `graft callers processReviewPart`는 워커 테스트를 표시했다. SQL RPC는 Graft의 TypeScript 호출 그래프에 직접 인덱싱되지 않아 위 PGlite fixture로 계약을 검증했다.
- [Archify 시퀀스 명세](step4b3-transcription.sequence.json) · [HTML 구조도](step4b3-transcription.html): 조기 job, claim, Groq, 마스킹 저장, 다음 job, 실패·철회, 재추출 경로를 표시했다. `validate`·`check`·`browser-check` 모두 pass, 레이아웃 오류·경고 0이다.

## 남은 게이트

이 검사는 격리 SQL과 실제 Groq 2창을 각각 확인한 것이다. 이후 0063을 로컬 DB에 적용하고 실제 Storage·DB·Groq 워커 2창 통합 검사를 통과했다([후속 기록](accuracy-step4b4.md)). 브라우저 제품 전체 흐름의 **이번 코드 재실행**, 30창 소요 시간, 실제 기기 V01~V06·정량 V20, 제공사/CSP/운영 승인은 아직 실행하지 않았다. 따라서 phase 23과 ACC-01의 전체 완료 판정은 보류한다.
