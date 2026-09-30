# Step 4-B2: 전사 창의 단어 소유·시각·신뢰도 계산

## 읽어야 할 파일

- `docs/PRD.md` §3-4 ACC-01·§8·§11
- `docs/ARCHITECTURE.md` §6 불변식·§8 TDD
- `docs/ADR.md` ADR-057·070 결정 7
- `docs/planning/웹회의_녹음_설계.md` §11.2
- `docs/02-design/features/browser-meeting-recording.design.md`
- `phases/23-browser-meeting-recording/step4b1-transcription-metadata.md`
- `lib/llm.ts`, `lib/reviews.ts`, `lib/pipeline/review-material.ts`, `lib/contracts.ts`

## 작업

`lib/recording/transcription-window.ts`의 순수 함수 `projectTranscriptionWindow(data, windowIndex, previousLastWordEndInWindow)`와 `projectTranscriptionWindows(windows)`를 TDD로 구현한다. 창 i는 시작 시각 60초 미만인 단어를 소유한다. 다음 창은 앞 창의 마지막 소유 단어 끝보다 먼저 시작한 단어를 버린다. 병렬 작업의 완료 순서와 무관하게 인덱스 순서로 조립한다. 단어에 속한 segment의 `avg_logprob < -1.0` 또는 `no_speech_prob > 0.6`이면 `confidence: low`로 판정하고, 원본 녹음 타임라인의 시작·끝 시각을 붙인다. 단어 시각이 없으면 segment 규칙으로 처리하고 경계를 `boundary_review`로 표시한다. 저장 후보 텍스트는 마스킹한다.

이번 step은 변환 함수·테스트만 다룬다. `processReviewPart`는 병렬 작업이므로 앞 창의 결과를 기다리게 하지 않는다. 저장·검토 화면 연결은 후속 4-B3에서 조립 시점의 원자적 전이를 설계한 뒤 구현한다.

## 코드 관계와 구조 확인

- Graft 전후 그래프에서 `llm.transcribeAudio` → `processReviewPart`와 새 변환 함수의 참조 범위를 확인한다. 산출물: `docs/verification/browser-meeting-recording/accuracy-step4b2.md`.
- 이 step은 기존 실행 흐름을 바꾸지 않으므로 Archify 구조도는 새로 만들지 않는다. 저장·job 흐름을 바꾸는 4-B3에서 그린다.

## Acceptance Criteria

```bash
npx vitest run tests/recording/transcription-window.test.ts
npx tsc --noEmit --pretty false
npm run lint
npm run build
npm run test -- --maxWorkers=2 --testTimeout=15000
```

- 60+1초 경계의 앞·뒤 창에서 중복 단어가 0개다. 완료 순서를 바꿔도 결과가 같다.
- 낮은 신뢰와 단어 시각 누락은 각각 `confidence`와 `boundary_review`로 구분된다.
- 이메일이 단어 두 조각으로 나뉘어도 반환 텍스트에 원문 조각을 남기지 않는다.
- 이 순수 함수의 통과를 ACC-01의 저장·화면·실기기 완료로 표시하지 않는다.

## 금지사항

- 워커의 병렬 완료 순서에 의존하지 마라. 이유: 앞 창 완료 전 다음 창이 끝날 수 있다.
- 단어 시각이 없는 경계를 중복 0으로 단정하지 마라. 이유: segment 시각만으로 소유 단어를 가릴 수 없다.
- 마스킹 전 전사 텍스트·단어를 DB·로그에 쓰지 마라. 이유: 원문 보존 정책 위반이다.
