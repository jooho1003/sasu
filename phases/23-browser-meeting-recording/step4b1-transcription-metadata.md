# Step 4-B1: Groq 전사 메타데이터 계약

원천: [PRD ACC-01](../../docs/PRD.md) · [상세 설계 §11.2](../../docs/planning/웹회의_녹음_설계.md) · [bkit 설계 어댑터](../../docs/02-design/features/browser-meeting-recording.design.md). 이 step은 정확률 강화 4-B의 첫 개발 단위다.

## 작업

1. `lib/llm.ts`의 `transcribeAudio()`에 시각 요청 옵션과 향후 용어집용 마스킹 검증 prompt를 추가한다. 기본 ASK 음성은 기존 `json` 요청을 유지한다.
2. 시각 요청은 Groq `verbose_json`에 `timestamp_granularities: ["word", "segment"]`를 사용한다. segment 시작·끝·평균 로그 확률·무음 확률과 word 시작·끝을 검증하고 반환한다. 원문·키를 로그에 쓰지 않는다.
3. 공급자 mock 단위 테스트를 먼저 실패시키고 통과시킨다. 합성 회의 WAV의 실제 Groq 응답에서는 전사 내용 대신 길이·구간 수·단어 수·시각 범위만 기록한다.
4. Graft 변경 전후 관계와 lint·build·전체 단위 테스트를 남긴다.

## 완료 경계

ASK·회고·자료 워커는 이번 step에서 추가 필드를 사용하지 않는다. 단어 경계 중복 제거, `sections[].confidence` 저장, 검토 화면 이동, 용어집·병합·V20 수치는 후속 4-B에서 구현한다. 이 step 결과를 정확률 향상이나 PRD ACC-01 완료로 표시하지 않는다.

## 검증

`npx vitest run tests/llm-transcription.test.ts`, `npx tsc --noEmit --pretty false`, `npm run lint`, `npm run build`, `npm run test -- --maxWorkers=2 --testTimeout=15000`.
