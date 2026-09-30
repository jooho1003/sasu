# Step 2: recorder-safety

녹음 중 사고를 막는다. 잘못 누른 종료, 모르고 떠나기, 다른 탭에서 모르는 중단, 안 보이는 오류, 스크린 리더 소음을 고친다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S2`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §6-5 웹 회의 녹음 · §8 테스트 경계(`components/`는 TDD 예외)
- `docs/02-design/features/recording-ux.design.md` §5.4 S2 화면 체크리스트·§9 검증 설계
- `/docs/ADR.md` ADR-070·ADR-071
- `/docs/PRD.md` §3-4 REC-02·REC-03 · §7 디자인 가이드
- `/docs/wording-guide.md`
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U01·U02·U03·U04·U06·U07·U13)·§3·§4
- `lib/recording/recorder-copy.ts`(step 0) — `recorderErrorText`, `stopReasonNotice`, `recorderStage`, `recorderTabTitle`
- `components/meeting-recorder.tsx`(step 1 반영본), `app/globals.css`의 `.meeting-recorder`·`.review-notice` 규칙(:41-81 부근), `components/workspace-shell.tsx`(사이드바 링크)
- `tests/review-controls/meeting-recorder.spec.ts`

## 작업

모두 `components/meeting-recorder.tsx`와 `app/globals.css`(`.meeting-recorder` 범위)에서 한다.

1. **종료 확인(U01)**: 녹음 중에는 `녹음 잠시 멈추기`/`녹음 다시 시작`을 주 버튼으로 둔다. `녹음 종료`는 보조 버튼으로 떨어뜨려 둔다(같은 줄 끝 또는 간격을 둔 별도 줄). `녹음 종료`를 누르면 곧바로 끝내지 않고 화면 안에 확인 영역을 연다. 문구는 "녹음을 끝낼까요? 끝내면 이 녹음은 이어서 할 수 없고 저장만 할 수 있습니다." 취지로 쓴다. 버튼은 `녹음 끝내기`와 `계속 녹음`, Esc는 `계속 녹음`과 같다. `window.confirm`은 쓰지 않는다.
2. **이탈 보호(U02)**: 녹음 중(recording·paused·stopping)에만 두 가지를 건다. 녹음이 끝나면 둘 다 뗀다.
   - `beforeunload` 리스너(`preventDefault()` + `returnValue = ""`).
   - `document`에 capture 단계 `click` 리스너. 같은 출처의 `a[href]` 이동(수정키 없음, `target` 없음, 다운로드 아님)을 `preventDefault()`하고, 페이지 위쪽에 "녹음 중에는 다른 화면으로 이동하지 않습니다. 녹음을 끝낸 뒤 이동해 주세요." 안내를 띄운다. 이유: Next `Link` 이동은 `beforeunload`가 없고, 언마운트 정리가 `interrupt("page_left")`로 녹음을 끊는다(:122-126). `← 올린 자료 확인`과 사이드바 링크 모두 해당한다. 수정키·새 탭 열기는 막지 않는다.
3. **탭 제목(U03)**: 마운트 때 원래 `document.title`을 기억한다. 녹음·일시정지 중에는 `recorderTabTitle(stage, 녹음 초, base)`로 초가 바뀔 때만 갱신한다. 녹음이 사용자 조작 없이 중단되면(`snapshot.reason`이 있고 사용자가 누른 종료가 아님) `⚠ 녹음 중단` 제목을 걸어 두고, 탭이 다시 보일 때(`visibilitychange` → visible) 원래 제목으로 돌린다. 사용자가 끝냈거나 언마운트될 때도 원래 제목으로 돌린다.
4. **알림 모양과 위치(U04·U07)**: 알림을 tone별 클래스로 나눈다: `recorder-notice`(info), `recorder-notice is-warning`, `recorder-notice is-error`. 색은 `globals.css`의 기존 색 변수를 우선 쓴다. 경고·오류 색이 없으면 `.meeting-recorder` 범위 안에서 정의하되, 글자 대비 4.5:1 이상이고 색만으로 구분하지 않게(앞에 "주의"·"오류" 같은 짧은 머리말) 한다.
   - `run()`이 어디서 불렸는지(`form`·`session`·`list`)를 받아, 오류(`role="alert"`)를 **그 패널 안**에 보여 준다. 표시 뒤 `tabIndex={-1}` 요소에 포커스를 줘 화면 안으로 스크롤되게 한다.
   - 오류 문구는 `recorderErrorText(cause)`로 **렌더 시점에** 바꾼다. 상태에는 원래 값을 둔다.
   - 중단 사유는 `stopReasonNotice(reason)`로 보여 준다. `duration_limit`은 info 모양이고 `role="status"`, 나머지는 warning이다. 기존 "녹음 중단 사유: {code}. 확인 저장된 구간만 복구합니다." 문장은 없앤다. 영문 코드를 화면에 쓰지 않는다.
   - `서버 상태: …`는 `sessionStateLabel(state)`로 바꾼다.
5. **녹음 상태 표시(U06)**: 녹음 중 패널 위쪽에 상태 칩(`녹음 중`·`잠시 멈춤`·`녹음 준비 중`)과 큰 타이머 `m:ss / 30:00`을 둔다. 타이머는 수집 샘플 수 기준으로 지금과 같이 계산한다. 그 아래 작은 글씨로 `이 기기에 저장됨 m:ss`를 둔다. `samples - persistedSamples`가 3초 이상이면 경고 "이 기기 저장이 n초 늦어지고 있습니다"를 띄운다. 29분 경고는 칩 옆에 경고 모양으로 둔다.
6. **스크린 리더(U13)**: 매초 바뀌는 타이머는 live region 밖에 둔다(`role="timer"`, `aria-live="off"`). 상태 변화(시작·일시정지·재개·중단·끝남·저장 지연 경고)만 알리는 시각적으로 숨긴 live region(`role="status"`) 하나를 둔다. 여기에 시간 숫자를 넣지 않는다.

### 테스트 (`tests/review-controls/meeting-recorder.spec.ts`)

기존 흐름의 기대 문구를 새 문구로 고친다. 예: `녹음 중단 사유: page_left` → `stopReasonNotice("page_left").text`의 핵심 구절, `이 기기에 확인 저장` → `이 기기에 저장됨`. 아래 사례를 더한다.

1. `녹음 종료` 한 번 → 아직 녹음 중(`녹음 잠시 멈추기` 보임), 확인 영역 보임 → `계속 녹음` → 확인 영역 사라짐, 녹음 계속 → 다시 `녹음 종료` → `녹음 끝내기` → 끝남.
2. 녹음 중 `page.close({ runBeforeUnload: true })`에서 `dialog.type() === "beforeunload"`가 발생한다. 녹음이 끝난 뒤에는 발생하지 않는다.
3. 녹음 중 `← 올린 자료 확인` 클릭 → 주소가 그대로이고 녹음 계속, 이동 안내가 보인다.
4. 녹음 중 `document.title`에 `녹음 중`이 들어 있다. 종료 뒤 원래 제목으로 돌아온다.
5. `role="status"` 요소들의 글자에 `\d+:\d\d` 형식의 시간이 없다.
6. 합성 오류(예: 키 route 403) 때 `role="alert"`가 누른 버튼과 같은 패널 안에 있고 영문 코드(`recording_`로 시작하는 문자열)가 화면에 없다.

캡처: `docs/verification/recording-ux-2026-09-29/s2-stop-confirm-1440.png`, `s2-stop-confirm-390.png`(390×844).

## 코드 관계와 구조 확인

- Graft(README §4, `{N}=2`): 전후 `graft grep "review-notice|role=.status|role=.alert|beforeunload|document.title"`와 `graft grep "<Link"`(이 화면에서 나가는 링크 목록)를 비교한다. `graft-s2-before.txt`·`graft-s2-after.txt`.
- Archify: 해당 없음(한 컴포넌트 안의 표시·이벤트 처리).

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
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (UI 한국어 단일, 로그에 원문 없음)
   - 새 `lib/` 모듈이 생겼다면 `tests/` 미러 테스트가 있는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 2를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "종료 확인·이탈 보호·탭 제목·알림 tone·타이머/live region 변경, 새 CSS 클래스 이름, 캡처·Graft 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 던지는 오류 코드와 서버 응답 문자열을 바꾸지 마라. 이유: `recover()`가 `recording_unavailable`로 로컬 자료 삭제를 분기한다. 변환은 렌더 때만 한다.
- 녹음 중이 아닐 때 `beforeunload`·링크 차단을 남겨 두지 마라. 이유: 저장이 끝난 뒤에도 이동을 막으면 화면에 갇힌다.
- 수정키 클릭·`target="_blank"`·다운로드 링크를 막지 마라. 이유: 새 탭 열기는 녹음을 끊지 않는다.
- `window.alert`·`window.confirm`을 새로 쓰지 마라. 이유: 확인 문구를 화면 안에서 설명하고 테스트하기 위해서다.
- 시작 순서(step 1, ADR-071)와 복구·저장 로직을 바꾸지 마라.
- `.review-notice`의 전역 모양을 바꾸지 마라. 이유: `review-detail.tsx`·`retention-console.tsx`도 쓴다. 새 클래스는 `.meeting-recorder` 범위에 둔다.
- 테스트를 지우거나 `skip`하지 마라.
- 검증 빌드 없이 `npm run build`를 돌리지 마라.
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
