# Step 1: recorder-start

ADR-071을 구현한다. `녹음 준비` → `입력 장치 선택하고 녹음 시작` 두 번 누르던 것을 `녹음 시작` 한 번으로 합친다. 순서는 **입력 선택 → 서버 세션 → 키 → 저장소 사전 검사 → 캡처**다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S1`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §6-5 웹 회의 녹음 불변식 30(세션이 먼저, 샘플은 세션·키가 있을 때만 저장)~34 · §8 테스트 경계
- `/docs/ADR.md` ADR-070 결정 1·2 · **ADR-071 전체**
- `/docs/PRD.md` §3-4 REC-01·REC-06(1.18 문구) · §11 웹 회의 녹음 행
- `docs/planning/웹회의_녹음_설계.md` §4.1 마지막 두 문단(사전 검사 실패 시 즉시 폐기, 2026-09-29 시작 순서)
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U08)·§3·§4
- `lib/recording/recorder-copy.ts`(step 0) — `missingStartConditions`, `recorderErrorText`
- `components/meeting-recorder.tsx` 전체 — 특히 `prepare()`(:277-302), `begin()`(:322-391), `run()`(:210-215), `keyFor()`, 렌더의 `prepared` 분기(:517)
- `lib/recording/browser/inputs.ts`(`captureInputs`), `lib/recording/browser/storage.ts`(`probeRecordingStore`, `acquireCaptureLock`), `lib/recording/browser/capture.ts`(`startRecording`)
- `tests/review-controls/meeting-recorder.spec.ts`, `tests/e2e/recording-product.spec.ts`, `scripts/review-controls-lab/main.tsx`

## 작업

### `components/meeting-recorder.tsx`

`prepare()`와 `begin()`을 하나의 `start()`로 합친다.

```ts
async function start(): Promise<void>
```

1. 조건 확인: `missingStartConditions(...)`가 비어 있지 않으면 첫 항목으로 오류를 던지고 끝낸다(입력 창을 열지 않는다).
2. **첫 번째 `await`는 `captureInputs(mode)`여야 한다.** `getDisplayMedia`는 클릭의 사용자 동작이 살아 있을 때만 열린다. 이 앞에 `fetch`·`refresh()`·`setTimeout` 같은 비동기 작업을 두지 마라. `run(start)`는 `setBusy` 등을 동기로 부른 뒤 `task()`를 호출하므로 이 조건을 지킨다.
3. 입력 선택이 실패하거나 취소되면 세션을 만들지 않고 오류를 보여 준다.
4. `crypto.randomUUID()` → `POST ${base}/recordings`(현재 `ReviewRecordingStart` 본문 그대로) → `keyFor(id)` → `probeRecordingStore(scope(id), key)` → `startRecording(...)`. 기존 `begin()`의 캡처 이후 처리(프로필 저장소, 장치·트랙 이벤트, 미터·프로필 타이머, wake lock)는 그대로 옮긴다.
5. 4의 어느 단계든 실패하면 `stopInputs(inputs)`로 트랙을 모두 멈춘다. 세션을 만든 뒤였다면 `POST /recordings/[id]/discard`를 곧바로 보낸다(실패는 무시, 목록 폐기 버튼·24시간 만료가 정리). 이미 `startRecording`이 돌았다면 `interrupt("recording_setup_failed")`.
6. 키는 입력 선택 뒤 **한 번만** 받는다. `begin()`에 있던 "입력 선택 뒤 키 재확인"(두 번째 `keyFor`)은 지운다. 이유: ADR-071 — 선택 뒤에 세션·키를 만들므로 검사가 이미 최신이다.
7. 2~4가 진행되는 동안 `starting` 상태를 두고 화면에 `녹음 준비 중`(role="status")을 보여 주며 양식 입력과 버튼을 잠근다. 이 동안 들어온 소리는 어디에도 모으지 않는다.
8. `prepared` 상태, `녹음 준비` 버튼, `입력 장치 선택하고 녹음 시작` 버튼, 준비 완료 안내(`준비됐습니다. …`)를 없앤다. 양식의 주 버튼은 `녹음 시작` 하나다. 비활성 조건은 지금과 같다(동의·테스트 확인·제목). 이유를 보여 주는 UI는 step 3이 한다.
9. 복구(`recover`)·마이크 다시 선택(`reselectMicrophone`, 여기의 `keyFor`는 유지)·저장·폐기는 바꾸지 않는다.

### 테스트

- `tests/review-controls/meeting-recorder.spec.ts`를 새 흐름으로 고친다. `녹음 준비`·`입력 장치 선택하고 녹음 시작` 대신 `녹음 시작`을 누른다. 시작 뒤 키 요청 수 기대값은 2 → **1**, 복구 뒤 3 → **2**다. `step2-prepared-synthetic.png` 캡처 줄은 지우고 `docs/verification/recording-ux-2026-09-29/s1-recording-synthetic.png`(녹음 중 화면)를 남긴다. `step2-recovered-synthetic.png`는 phase 23 기록이므로 경로를 유지한다.
- 같은 파일에 사례를 더한다. 입력은 `addInitScript`로 합성한다(기존 방식). 만든 스트림은 `window`에 모아 두고 `track.readyState`를 확인한다.
  1. `getUserMedia`가 `new DOMException("Permission denied", "NotAllowedError")`로 거부 → `POST /recordings` **0건**, 화면에 오류(`role="alert"`)가 보이고 버튼을 다시 누를 수 있다.
  2. `POST /recordings`가 403 → 만든 트랙이 모두 `ended`, 캡처 시작 없음.
  3. 키 route가 403 → `POST /recordings/*/discard` **1건**, 트랙 모두 `ended`.
  4. 정상 흐름에서 `녹음 준비` 버튼이 없다(`toHaveCount(0)`).
- `tests/e2e/recording-product.spec.ts`의 흐름도 `녹음 시작` 한 번으로 고친다. 이 파일은 로컬 Supabase가 있어야 돌므로 **실행은 step 8에서** 한다. 여기서는 타입 검사(`npm run build`)만 통과하면 된다.

## 코드 관계와 구조 확인

- Graft(README §4, `{N}=1`): 구현 전후 `graft grep "prepare|begin|keyFor|captureInputs|probeRecordingStore" `를 `components/meeting-recorder.tsx` 중심으로 비교하고, `graft callers captureInputs --depth 2`로 다른 호출자(녹음 실험실 등)가 영향받지 않는지 확인한다. `graft-s1-before.txt`·`graft-s1-after.txt`.
- Archify: 해당 없음. 구성 요소 경계는 같고 한 컴포넌트 안의 호출 순서만 바뀐다(README §3). 요약에 그 사유를 적는다.

## Acceptance Criteria

```powershell
npm run e2e:review-controls
npm run e2e:recording
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build; git restore next-env.d.ts
npm run test -- --maxWorkers=2 --testTimeout=15000
```

판정 기준(ADR-071 영향 절): 공유·마이크 취소 시 `POST /recordings` 0건 · 세션 생성 실패 시 남은 트랙 0개 · 키·사전 검사 실패 시 `discard` 1건 · 정상 시작의 키 요청 1건 · 복구 흐름 기존과 같음.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md §6-5 불변식 30: 첫 샘플이 세션·키·사전 검사 뒤에만 저장되는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙(요청 경로 service role 금지 · 로그에 원문 금지 · 비밀값)을 위반하지 않았는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 1을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "start() 순서, 없앤 버튼·상태, 바뀐 테스트 기대값(키 요청 1/2), 캡처·Graft 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `captureInputs` 앞에 `await`를 두지 마라. 이유: 사용자 동작이 끊기면 `getDisplayMedia`가 거부된다(ADR-071 배경).
- 입력 선택 전에 서버 세션을 만들지 마라. 이유: 취소한 사용자의 세션이 24시간 한도를 차지한다(ADR-071).
- 세션·키·사전 검사가 끝나기 전의 소리를 버퍼에 모으거나 저장하지 마라. 이유: 불변식 30.
- 던지는 오류 코드와 서버 응답 문자열을 바꾸지 마라. 이유: `recover()`가 `recording_unavailable`로 분기한다(`meeting-recorder.tsx:317`).
- 서버 route·SQL·migration을 고치지 마라. 이유: ADR-071은 화면의 호출 순서만 바꾼다.
- 테스트를 지우거나 `skip`하지 마라. 기대값을 새 흐름에 맞춰 고친다.
- 검증 빌드 없이 `npm run build`를 돌리지 마라(`SASU_VERIFY_BUILD=1`, 끝나면 `next-env.d.ts` 복원).
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
