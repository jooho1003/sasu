# Step 0 후속: 한 탭 녹음 판정을 Web Locks 하나로 (capture-lock)

- 날짜: 2026-09-29 · 출처: [`/pdca analyze browser-meeting-recording`](../../docs/03-analysis/browser-meeting-recording.analysis.md) §3 G-1 · 플랜: `.claude/plans/capture-lock-2026-09-29.*`
- 실행: `execute.py`는 `step{N}.md`만 읽으므로 이 파일은 세션이 직접 실행한다(Codex `gpt-5.6-terra`·medium). `phases/23-browser-meeting-recording/index.json` 등록은 다른 세션의 phase 23 미커밋 변경이 커밋된 뒤 한다.
- 전제: 작업 트리에 다른 세션의 미커밋 변경이 없어야 한다(`git status --short` 비어 있음). 이유: 이 step의 커밋에 남의 변경이 섞인다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 설계 의도를 파악하라:

- `/docs/02-design/features/browser-meeting-recording.design.md` (bkit 설계 어댑터 — 대조 목록의 `lib/recording/browser/storage.ts` 행)
- `/docs/03-analysis/browser-meeting-recording.analysis.md` §3 G-1 (이 step이 없애는 차이)
- `/docs/planning/웹회의_녹음_설계.md` §4.2 — 127행 "한 브라우저 프로필에서는 Web Locks(`ifAvailable`)로 한 녹음만 허용한다. … BroadcastChannel·IndexedDB lease는 판정에 쓰지 않으며, 현재 코드의 쓰기 전용 lease는 정리 대상이다."
- `/docs/ARCHITECTURE.md` §6-5 불변식 30 · §8 테스트 경계(`lib/recording/browser/*`는 SDK 어댑터 예외)
- `lib/recording/browser/storage.ts` 262-311행 (`cleanupLocalRecordings`, `acquireCaptureLock`)
- `lib/recording/browser/capture.ts` 1-90행 (`startRecording`의 `release`·`leaseLost`)
- `lib/recording/capture-watchdog.ts` (실행 공백 → `capture_suspended`)
- `tests/recording/storage.spec.ts` 151-175행 (두 탭 사례), `tests/recording/worker-recovery.spec.ts`

## 작업

### 1. `acquireCaptureLock` — Web Locks만 남긴다

```ts
export function acquireCaptureLock(): Promise<() => void>
```

- `navigator.locks.request("sasu-meeting-capture", { ifAvailable: true }, callback)`은 그대로 둔다. 잠금을 못 얻으면 `recording_other_tab`, `navigator.locks`가 없으면 `recording_lock_unavailable`로 reject한다(지금과 같다).
- 잠금 콜백은 `release()`가 불릴 때까지 끝나지 않는 Promise를 돌려준다. `release`는 여러 번 불러도 한 번만 동작한다.
- 아래를 모두 지운다: `sasu-meeting-capture-lease` DB 열기·쓰기·삭제, `BroadcastChannel("sasu-meeting-capture")`, 1초 `setInterval` heartbeat, `now - previous > 5000` 검사, `onLost` 매개변수.
- 이유: Web Locks 잠금은 탭이 닫히거나 죽을 때만 풀리고, 다른 탭이 빼앗을 수 없다. 그래서 "잃는" 경우가 없다. 지금 코드는 heartbeat 쓰기 실패나 5초 넘는 타이머 정지(절전·탭 정지)를 `capture_lease_lost`로 바꿔 녹음을 끊는데, 이는 설계가 판정에 쓰지 말라고 한 lease가 실제 중단 경로에 있는 것이다. 실행 공백은 `capture-watchdog`가 `capture_suspended`로 따로 다룬다.

### 2. `startRecording` — lease 분실 경로를 지운다

- `capture.ts`의 `leaseLost` 변수, `acquireCaptureLock(() => …)` 콜백, `if (leaseLost) throw new Error("capture_lease_lost")`를 지운다. `release = await acquireCaptureLock()`만 남긴다.
- `cleanup()`의 `release?.()` 호출과 순서는 그대로 둔다.

### 3. 남은 lease DB 정리

- `cleanupLocalRecordings(userId)`에서 이전 버전이 남긴 `sasu-meeting-capture-lease` DB를 지운다. `indexedDB.deleteDatabase`를 부르되 **기다리지 않는다**(`blocked`가 나도 녹음 정리를 늦추지 않는다). 예외는 삼킨다.

## 코드 관계와 구조 확인

- Graft: 변경 전후 `acquireCaptureLock`·`startRecording`·`cleanupLocalRecordings`의 호출자와 `capture_lease_lost` 사용처를 확인한다(`graft callers`, `graft grep`). 절차는 `docs/verification/recording-ux-2026-09-29/README.md` §4와 같은 컨테이너(`sasu-retention-graft-20260924`)를 쓰고 디렉터리 이름만 `capture-lock-{before,after}`로 바꾼다. 결과는 `docs/verification/browser-meeting-recording/capture-lock-graft-{before,after}.txt`.
- Archify: 구성 요소 경계·데이터 흐름이 바뀌지 않는다(한 모듈 안의 잠금 구현만 줄어든다). 실행하지 않고 그 사유를 완료 요약에 적는다.
- 도구를 쓸 수 없으면 실제 파일로 확인한 범위와 빠진 도구 결과를 적고 완료 처리하지 않는다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npm run e2e:recording        # 기존 20 통과·1 skip 유지 + 아래 새 사례
grep -rn "BroadcastChannel\|capture_lease_lost\|leaseDb\|heartbeat" lib/recording/browser   # 0건
grep -n "sasu-meeting-capture-lease" lib/recording/browser/storage.ts                     # deleteDatabase 1건만
```

`tests/recording/storage.spec.ts`에 사례를 더한다. 실험실은 storage 모듈 전체를 `window.recordingLab`으로 노출하므로(`scripts/recording-lab/main.ts:10-11`) `acquireCaptureLock`·`cleanupLocalRecordings`를 그대로 부를 수 있다.

1. 잠금을 잡은 채 메인 스레드를 6초 막아도(`page.evaluate`로 바쁜 루프) 잠금이 유지된다: `navigator.locks.query()`의 `held`에 `sasu-meeting-capture`가 있고, 두 번째 `acquireCaptureLock()`은 `recording_other_tab`으로 거부된다.
2. `release()`를 두 번 불러도 오류가 없고 잠금이 풀린다.
3. `indexedDB.open("sasu-meeting-capture-lease")`로 옛 DB를 만든 뒤 `cleanupLocalRecordings(userId)`를 부르면, 잠시 뒤 `indexedDB.databases()` 목록에 그 이름이 없다.
4. 기존 "two tabs cannot record concurrently; releasing allows a new recording" 사례가 그대로 통과한다.

`e2e:recording`은 `docs/verification/`의 기존 기록 파일(스크린샷·JSON)을 다시 쓴다. 이 step의 커밋에 그 변경이 들어가는 것은 정상이다.

## 검증 절차

1. 위 AC를 실행하고 통과 수를 기록한다.
2. 체크리스트:
   - 불변식 30(세션·키 뒤에만 IndexedDB 저장)이 그대로인가? — `startRecording`의 순서를 바꾸지 않았는가
   - 요청 경로 service role·로그 본문 규칙을 건드리지 않았는가
   - 새 타이머·heartbeat·다른 탭 통신을 더하지 않았는가
3. `docs/verification/browser-meeting-recording/capture-lock-20260929.md`에 실행 명령·통과 수·Graft 결과 경로·Archify 미실행 사유를 적는다.
4. 결과를 `docs/03-analysis/browser-meeting-recording.analysis.md` §3 G-1 행에 "해결(날짜·커밋)"로 적고, 사용자에게 `/pdca analyze browser-meeting-recording` 재실행을 제안한다.

## 금지사항

- 오류 코드 `recording_other_tab`·`recording_lock_unavailable`의 문자열을 바꾸지 마라. 이유: 화면 문구 변환(`lib/recording/recorder-copy.ts`)과 테스트가 이 문자열로 분기한다.
- `components/meeting-recorder.tsx`·`lib/recording/recorder-copy.ts`를 고치지 마라. 이유: phase 33(`recording-ux`)이 같은 파일을 고치고 있다. `recorder-copy.ts`의 `capture_lease_lost` 문구는 이전 녹음 기록의 사유 표시용으로 남긴다.
- `navigator.locks.request`에 `steal: true`를 쓰지 마라. 이유: 설계 §4.2 — 이전 녹음을 이어받지 않고 중단 복구로 들어간다.
- 잠금을 워커로 옮기지 마라. 이유: 잠금은 페이지가 쥐어야 탭 종료·충돌 때 풀린다(`storage.ts` 주석).
- 기존 테스트를 깨뜨리지 마라.
