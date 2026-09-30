# Step 3: recorder-flow

녹음 화면의 흐름을 알기 쉽게 만든다. 단계 표시, 비활성 이유, 복구 목록, 돌아가기, 폐기 위치, 입력 표시를 고친다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S3`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §6-5 웹 회의 녹음 · §8 테스트 경계
- `/docs/ADR.md` ADR-070(세션 상태·로컬 자료 없는 세션 폐기) · ADR-071
- `/docs/PRD.md` §3-4 REC-01·REC-03·REC-06 · §7 디자인 가이드
- `/docs/wording-guide.md`
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U08·U09·U10·U11·U12·U14·U15·U16)·§4
- `lib/recording/recorder-copy.ts`(step 0) — `recorderStage`, `missingTestConditions`, `missingStartConditions`, `sessionStateLabel`, `formatExpiry`, `signalDetected`
- `components/meeting-recorder.tsx`(step 2 반영본), `app/globals.css`의 `.meeting-recorder` 규칙, `.button` 계열 규칙
- `tests/review-controls/meeting-recorder.spec.ts`

## 작업

모두 `components/meeting-recorder.tsx`와 `app/globals.css`(`.meeting-recorder` 범위)에서 한다.

1. **단계 표시(U08)**: 제목 아래 `<ol className="recorder-steps">`에 `1 입력 확인` · `2 녹음` · `3 저장`을 둔다. `recorderStage()`로 현재 단계에 `aria-current="step"`을 준다(setup → 1, starting·recording·paused → 2, stopped·saving·done → 3). 390px 폭에서 한 줄 또는 줄바꿈으로 읽을 수 있어야 한다.
2. **비활성 이유(U09)**: `5초 테스트 녹음`과 `녹음 시작`이 비활성이면 바로 아래에 `missingTestConditions`·`missingStartConditions` 목록을 보여 준다. 버튼의 `aria-describedby`로 그 목록을 가리킨다. 조건이 채워지면 목록이 사라진다.
3. **복구 목록(U10)**:
   - 행의 버튼에 `button button-secondary`(작은 변형이 있으면 그것)를 준다.
   - 지금 열려 있는 세션(`selected?.id`)은 목록에서 뺀다.
   - 행 문구는 `**제목** · {sessionStateLabel(state)} · {formatExpiry(expires_at, now)}`로 한다.
   - `녹음 이어서 확인`의 이름을 `확인하고 저장`으로 바꾼다. 이유: 같은 세션으로 녹음을 이어 가지 않고 저장·폐기만 하기 때문이다.
   - 목록이 비었을 때의 문구는 유지한다. 녹음 중이면 목록 패널 전체를 접어 두고 "녹음이 끝나면 다시 보여 줍니다"로 대신한다.
4. **돌아가기(U11)**: 세션을 연 상태이고 녹음 중·시작 중이 아니면 `새 녹음 화면으로` 버튼을 둔다. 누르면 `selected`·키·로컬 정보·세그먼트·스냅샷 상태를 비우고 양식으로 돌아간다. **세션을 폐기하지 않는다.** 세션은 목록에 남는다.
5. **폐기 분리(U12)**: 열린 세션 패널의 `녹음 폐기`를 패널 맨 아래로 옮긴다. 구분선과 간격을 두고, 위험 동작 모양(보조·빨간 글자 등)과 설명 "이 기기의 녹음과 서버 세션을 모두 지웁니다"를 준다. 목록 행의 `녹음 폐기`도 같은 모양을 쓴다. 확인은 지금처럼 폐기 전에 한 번 받는다.
6. **입력 표시(U14·U15·U16)**:
   - 녹음 방식 라디오에 같은 `name="recording-mode"`를 준다.
   - 각 `<meter>`에 `aria-label`("마이크 입력 크기"·"컴퓨터 소리 입력 크기")을 준다.
   - 미터 옆 `입력 감지`/`소리 확인 필요`는 입력별 최근 15개(약 1.5초) 크기 기록을 `useRef`로 두고 `signalDetected(history)`로 정한다. 테스트 미터와 녹음 중 미터 모두 같다.
   - 5초 테스트 뒤 안내를 모드별로 쓴다. 마이크: 내 목소리가 들리는지. 컴퓨터 소리 + 마이크: 컴퓨터 소리와 내 목소리가 모두 들리는지.

### 테스트 (`tests/review-controls/meeting-recorder.spec.ts`)

`녹음 이어서 확인` 기대값을 `확인하고 저장`으로 고친다. 아래 사례를 더한다.

1. 제목을 비우면 `녹음 시작`이 비활성이고 "제목" 조건이 보인다. `aria-describedby`가 그 목록을 가리킨다. 제목을 넣으면 그 조건이 사라진다.
2. 단계 표시의 `aria-current="step"`이 양식 → 녹음 → 종료 뒤 저장 단계로 옮겨 간다.
3. 녹음 중에는 목록에 현재 세션이 없다. 새로고침 뒤 목록 행 버튼이 `button` 클래스를 가진다.
4. 세션을 연 뒤 `새 녹음 화면으로` → 양식이 다시 보이고 `POST /recordings/*/discard` 요청이 0건이며 그 세션이 목록에 남는다.
5. 라디오 두 개의 `name`이 같다. 미터마다 접근 가능한 이름이 있다(`getByRole("meter", { name: /마이크 입력 크기/ })`).

캡처: `docs/verification/recording-ux-2026-09-29/s3-form-1440.png`, `s3-form-390.png`, `s3-recovery-list-1440.png`.

## 코드 관계와 구조 확인

- Graft(README §4, `{N}=3`): 전후 `graft grep "녹음 이어서 확인|확인하고 저장|녹음 폐기|type=.radio|<meter"`로 이름 변경이 이 파일과 테스트 밖으로 퍼지지 않았는지 확인한다(`tests/e2e/recording-product.spec.ts` 포함). `graft-s3-before.txt`·`graft-s3-after.txt`.
- Archify: 해당 없음.

## Acceptance Criteria

```powershell
npm run e2e:review-controls
npm run e2e:recording
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build; git restore next-env.d.ts
npm run test -- --maxWorkers=2 --testTimeout=15000
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md §2 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - 새 `lib/` 모듈이 생겼다면 `tests/` 미러 테스트가 있는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 3을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "단계 표시·비활성 이유·복구 목록 이름(확인하고 저장)·새 녹음 화면으로·폐기 위치·입력 표시 변경, 캡처·Graft 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `새 녹음 화면으로`에서 세션을 폐기하거나 로컬 자료를 지우지 마라. 이유: 나중에 목록에서 다시 열어 저장할 수 있어야 한다(ADR-070, PRD REC-03).
- 폐기 확인을 없애지 마라. 이유: 폐기는 되돌릴 수 없다.
- 녹음 중 목록을 접는다고 목록 데이터 조회(`refresh`)를 없애지 마라. 이유: 끝난 뒤 바로 보여 줘야 한다.
- 던지는 오류 코드와 서버 응답 문자열을 바꾸지 마라. 이유: `recover()`가 `recording_unavailable`로 분기한다.
- 시작 순서(ADR-071)·저장·복구 로직을 바꾸지 마라.
- 테스트를 지우거나 `skip`하지 마라.
- 검증 빌드 없이 `npm run build`를 돌리지 마라.
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
