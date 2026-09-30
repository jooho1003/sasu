# Step 4-B2 전사 창 순수 변환 실행 기록

2026-09-29 · 원천: [PRD ACC-01](../../PRD.md), [상세 설계 §11.2](../../planning/웹회의_녹음_설계.md), [step 명세](../../../phases/23-browser-meeting-recording/step4b2-transcription-window.md).

## 변경과 경계

`lib/recording/transcription-window.ts`에 창별 단어 소유, 앞 창 마지막 단어 끝을 이용한 다음 창 중복 제거, 녹음 타임라인 시각, segment 신뢰도(`low`/`normal`/미상), 단어 시각 누락 경계 확인 표시를 넣었다. 창 배열은 인덱스로 정렬하고 빠진 인덱스는 거절한다. 공급자 단어가 이메일을 쪼개는 경우 전사 전체·segment 원문과 대조해 해당 묶음을 보수적으로 가린다. word·segment 배열이 모두 없으면 전사 본문을 보존하되 시각과 경계를 확인 대상으로 표시한다.

제품의 `processReviewPart`는 아직 `includeTimestamps`를 요청하지 않고 이 함수를 호출하지 않는다. 병렬 작업이 끝난 뒤 한 번만 조립·저장하는 계약을 구현해야 실제 자료의 `sections[]`에 시각·신뢰도가 들어간다. 이번 결과는 ACC-01, 경계 중복 0의 실제 자료 검증, 낮은 신뢰 UI의 완료 근거가 아니다.

## TDD·검증

| 검사 | 결과 |
|---|---|
| 신규 모듈 작성 전 테스트 | import 실패 확인 |
| 경계 조립 테스트 구현 전 | 신규 2건 실패 확인 |
| 쪼개진 이메일 보호 구현 전 | 신규 1건 실패 확인 |
| 메타데이터 배열 모두 비었을 때 구현 전 | 신규 1건 실패 확인 |
| `npx vitest run tests/recording/transcription-window.test.ts` | 9건 통과, 이후 일반 문장 보존 회귀 1건 추가. 최종 전체 검사에 10건 포함 |
| `npx tsc --noEmit --pretty false` | 통과 |
| `npm run lint` | 통과, 기존 문구 비차단 경고 79건 |
| `npm run build` | Next.js 16.3.4 프로덕션 빌드·TypeScript·정적 페이지 38건 통과 |
| `npm run test -- --maxWorkers=2 --testTimeout=15000` | 최종 153파일·1,678건 통과 |

새 함수에 제품 호출자가 없으므로 이번 step에서 제품 E2E와 실제 Groq 호출은 실행하지 않았다. 4-B1의 합성 WAV 실제 호출 기록은 [별도 기록](accuracy-step4b1.md)이다.

## 의존 관계

- Graft 0.19.0 전 그래프: 기존 작업 트리에서 새 모듈·테스트만 제외해 재구성. 549파일·2,449노드·6,150관계, `graft check` 통과.
- 후 그래프: 새 모듈·테스트 포함, 551파일·2,459노드·6,175관계, `graft check` 통과. `projectTranscriptionWindow`의 호출자는 새 조립 함수와 테스트뿐이다. `transcribeAudio`의 제품 호출자는 ASK·회고·자료 워커 그대로다. 작업 그래프는 Docker 컨테이너 `/work/sasu-b2-{before,after}-graph`에 있다.
- 실행 경로 변경이 없어 Archify 구조도는 이번에 만들지 않았다. 저장·job·자료 화면을 연결하는 다음 작업에서 작성한다.

## 후속 4-B3

`review_parts`가 병렬로 끝난 뒤에만 창을 인덱스 순서로 조립하도록 DB·job 상태 전이를 설계한다. 마스킹 전 word·segment 원문을 저장하지 않아야 한다. `ReviewSection` 계약과 재추출·재시도·동의 철회·원본 만료를 함께 검증하고, 낮은 신뢰/경계 확인 UI와 원본 위치 이동을 별도 화면 step에서 처리한다. 운영 migration·배포는 phase 23의 실제 기기 및 승인 게이트 뒤에만 한다.
