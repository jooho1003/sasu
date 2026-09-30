# Step 4-B1 전사 메타데이터 계약 실행 기록

2026-09-29 · 원천: [PRD ACC-01](../../PRD.md), [상세 설계 §11.2](../../planning/웹회의_녹음_설계.md), [세부 step](../../../phases/23-browser-meeting-recording/step4b1-transcription-metadata.md).

## 변경과 경계

- `lib/llm.ts`의 `transcribeAudio()`에 선택형 `includeTimestamps`와 마스킹을 검사하는 `prompt`를 추가했다. 기본 ASK 호출은 Groq `json` 요청을 유지한다. 시각 요청은 `verbose_json`과 word·segment granularity를 보내고, 반환된 시작·끝 시각과 segment 확률 값을 런타임에 검증한다. 잘못된 공급자 응답은 원문을 노출하지 않는 `schema_invalid`로 거절한다.
- 호출자 세 곳(ASK, 회고 음성, 자료 워커)은 계속 `data.text`만 읽는다. 이번 step은 segment·word를 DB 또는 화면에 연결하지 않았다. 따라서 정확률 향상이나 ACC-01 완료를 주장하지 않는다.
- API 형식은 [Groq API Reference](https://console.groq.com/docs/api-reference)와 설치된 `groq-sdk` 타입을 대조했다. 실제 반환 형식은 아래 합성 WAV 호출로 확인했다.

## TDD·실행 결과

| 검사 | 결과 |
|---|---|
| 신규 공급자 mock 테스트, 구현 전 | 4개 실패 확인 |
| `npx vitest run tests/llm-transcription.test.ts`, 구현 후 | 4개 통과: ASK 기본 형식, 시각·확률 반환, 미마스킹 prompt 차단, 잘못된 시각 거절 |
| `npx tsc --noEmit --pretty false` | 통과 |
| `npm run lint` | 통과. 문구 검사 비차단 경고 79건 |
| `npm run test -- --maxWorkers=2 --testTimeout=15000` | 152개 파일, 1,668개 통과 |
| `npm run build` | Next.js 16.3.4 프로덕션 빌드·TypeScript·정적 페이지 생성 통과 |

`scripts/verify-transcription-metadata.ts`를 로컬 Supabase URL·service key와 Groq key가 설정된 셸에서 실행했다. 저장소에 포함된 **합성** 16kHz mono, 26.23초 WAV만 전송했다. 실제 Groq 응답에서 텍스트 길이 **167자**, segment **4개**, word **42개**, 첫 segment 시작 **0초**, 마지막 segment 끝 **25.38초**를 확인했다. 스크립트는 전사 내용·키를 출력하지 않고, 로컬 `llm_calls` 기록 경로를 사용한다. `NEXT_PUBLIC_SUPABASE_URL`이 localhost/127.0.0.1이 아니면 실행을 거절한다. 20분 실기기 정확도 측정은 수행하지 않았다.

제품 호출자가 아직 새 옵션을 사용하지 않아 이 하위 step에서는 브라우저 E2E를 재실행하지 않았다. 새 계약의 공급자 실제 응답과 기존 호출자의 전체 단위 테스트·빌드를 검증했다.

## 의존 관계 확인

- 변경 전 Graft 스냅샷: 548개 파일, 2,445개 노드, 6,144개 엣지. `transcribeAudio`·`sectionsFromText`·`processReviewPart` 검색으로 ASK·회고·자료 워커의 텍스트 사용을 확인했다.
- 변경 후 Graft 스냅샷: 549개 파일, 2,449개 노드, 6,150개 엣지. `graft check` 통과. 같은 검색에서 기존 세 호출자와 신규 테스트만 확인했다. `graft callers transcribeAudio`는 객체 속성 호출을 incoming edge로 인덱싱하지 않아 검색 결과로 보완했다.
- 반환 계약 확장 외 구성 요소·실행 흐름 변화가 없어 Archify 새 구조도는 만들지 않았다. segment 저장과 화면 이동을 연결하는 후속 step에서 갱신한다.

## 다음 4-B 작업

경계 중복 제거와 시각 매핑·신뢰도 저장, 부서 용어집, 근거 보존 요약 병합, 낮은 신뢰 구간 UI, V20 실기기·합성 자료 정량 측정이 남아 있다. 이 작업이 끝나기 전까지 phase 23과 ACC-01은 완료가 아니다.
