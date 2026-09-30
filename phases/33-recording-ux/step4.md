# Step 4: segment-player

구간 원본 플레이어의 탐색 요청 폭주를 막고 배치를 정리한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S4`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §6-5 웹 회의 녹음(구간 접근권) · §8 테스트 경계
- `/docs/ADR.md` ADR-058(단회 접근권·분당 60건) · ADR-070 결정 6(구간마다 접근 허가 1건, 플레이어는 필요한 구간만)
- `/docs/PRD.md` §3-4 REC-04 · §11 웹 회의 녹음 행(V08·V17)
- `/docs/wording-guide.md`
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U05·U17)·§4
- `components/recording-segment-player.tsx` 전체, `components/review-detail.tsx`의 사용처(:487, `segmentSeek`)
- `lib/review-access.ts`(분당 제한 문구 `원본 요청이 많습니다…`)
- `tests/review-controls/recording-segments.spec.ts`, `tests/review-controls/access.spec.ts`

## 작업

`components/recording-segment-player.tsx`만 고친다(테스트 제외).

1. **탐색 확정 시점(U05)**: 슬라이더의 `onChange`는 표시 위치(`position`)만 바꾼다. 재생 중일 때 탐색 확정은 아래 두 경우뿐이다.
   - 포인터: `onPointerDown`에서 끄는 중 표시를 켜고, `onPointerUp`/`onPointerCancel`에서 한 번 `playAt(position)`.
   - 키보드(화살표·Home·End·PageUp/Down): 마지막 입력 뒤 300ms가 지나면 한 번 `playAt(position)`.
   끄는 동안 원본 요청은 0건이다. 재생 중이 아니면 위치만 바꾼다(지금과 같음). `seekRequest`(구간 `m:ss부터 듣기`)는 즉시 탐색한다.
2. **취소**: `playAt`마다 `AbortController`를 만들고, `fetchBuffer`의 `fetch`에 `signal`을 넘긴다. `stop()`과 새 `playAt`은 이전 컨트롤러를 `abort()`한다. `AbortError`는 오류로 보여 주지 않는다. 이미 서버에 도착한 요청은 취소해도 접근 허가가 기록될 수 있으므로 1이 주된 방어다.
3. **배치(U17)**: 한 줄에 `[원본 듣기]` · 슬라이더 · `m:ss / m:ss`(현재 / 전체)를 둔다. 슬라이더에 `aria-label="녹음 시각"`과 `aria-valuetext="m분 s초 / 전체 m분 s초"` 형식의 값을 준다. 내려받기 버튼은 그 아래 줄에 따로 둔다. 390px에서는 버튼과 슬라이더가 두 줄로 나뉘어도 된다. 슬라이더 폭은 남은 공간을 채운다.
4. 버튼 이름 `원본 듣기`·`원본 불러오는 중`·`듣기 잠시 멈추기`·`전체 녹음 음성 파일 내려받기`·`원본 결합 중`과 안내 문구는 유지한다. 테스트와 검토 화면이 쓴다.

### 테스트 (`tests/review-controls/recording-segments.spec.ts`)

기존 사례는 그대로 통과해야 한다. 아래 사례를 더한다.

1. 3구간(예: 150초) 픽스처로 재생 시작 → 요청 기록을 비운다 → 슬라이더에 포인터를 누른 채 여러 위치로 옮긴다(`page.mouse.down/move/up` 또는 `dispatchEvent`로 pointerdown → input 여러 번 → pointerup) → 놓은 뒤 새 `play_original` 요청이 **2건 이하**(현재·다음 구간)이고, `원본 요청이 많습니다` 알림이 없다.
2. 키보드로 슬라이더에 포커스 → `ArrowRight` 10번 빠르게 → 300ms 뒤 새 요청이 2건 이하.
3. 전체 길이 표시: 150초 픽스처에서 `/ 2:30`이 보이고 슬라이더 `aria-valuetext`에 전체 길이가 들어 있다.

캡처: `docs/verification/recording-ux-2026-09-29/s4-player-1440.png`, `s4-player-390.png`.

## 코드 관계와 구조 확인

- Graft(README §4, `{N}=4`): 전후 `graft callers RecordingSegmentPlayer`(JSX라 비어 있으면 `graft grep "<RecordingSegmentPlayer"`)와 `graft grep "original\\?action=play_original"`로 요청 경로가 이 파일에만 있는지 확인한다. `graft-s4-before.txt`·`graft-s4-after.txt`.
- Archify: 해당 없음.

## Acceptance Criteria

```powershell
npm run e2e:review-controls
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build; git restore next-env.d.ts
npm run test -- --maxWorkers=2 --testTimeout=15000
```

판정 기준(V17 관련): 끄는 동안 원본 요청 0건, 놓은 뒤 2건 이하. 분당 60건 제한 응답(429 픽스처)의 `1분 후` 알림은 기존 `access.spec.ts`대로 유지된다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md §2 디렉토리 구조를 따르는가?
   - ADR-058·070 결정 6(구간 번호 요청, 서명 URL·목록 조회 없음)을 지키는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 4를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "탐색 확정 규칙(포인터 놓을 때·키보드 300ms), AbortController, 배치·aria-valuetext, 요청 수 테스트 결과, 캡처·Graft 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 서명 URL·Storage 목록 조회·여러 구간 한꺼번에 받기를 쓰지 마라. 이유: ADR-058·ADR-070 결정 6. 필요한 구간만 번호로 받는다.
- 원본 route·`lib/review-access.ts`·SQL의 분당 제한을 바꾸거나 늘리지 마라. 이유: 제한은 보안 경계다. 요청을 줄이는 쪽으로 고친다.
- 재생 중 미리 받는 구간을 2개(현재·다음)보다 늘리지 마라. 이유: 긴 녹음이 메모리를 차지하지 않게 하는 기존 설계다(`:70`, `:83` 주석).
- 버튼 이름과 안내 문구를 바꾸지 마라(4번). 이유: `review-detail`·검토 테스트가 쓴다.
- 테스트를 지우거나 `skip`하지 마라.
- 검증 빌드 없이 `npm run build`를 돌리지 마라.
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
