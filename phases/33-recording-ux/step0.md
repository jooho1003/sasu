# Step 0: recorder-copy

녹음 화면이 보여 줄 문구·단계·조건을 순수 함수로 만든다. 화면 컴포넌트는 이 step에서 고치지 않는다(step 1~3이 쓴다).

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S0`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §2 디렉토리 구조 · §6-5 웹 회의 녹음 불변식 30~34 · §8 테스트 경계
- `/docs/ADR.md` ADR-070(녹음 세션 상태·키 거부 규칙) · ADR-071(한 번의 클릭 시작)
- `/docs/PRD.md` §3-4 REC-01·02·03·06 · §7 디자인 가이드
- `/docs/wording-guide.md` 전체 (UI 문구 규칙. `npm run lint`가 `lib/wording-check.ts`로 검사한다)
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U07·U09·U15)·§3·§4 — 이 phase의 검토 근거와 Graft 절차
- `components/meeting-recorder.tsx` — 지금 쓰는 문구와 상태(`Session.state`, `snapshot.reason`, `time()`)
- `lib/recording/session.ts`(`RecordingSnapshot`, 중단 사유 설정 위치), `lib/recording/browser/inputs.ts`, `lib/recording/browser/storage.ts`, `lib/recording/browser/capture.ts`, `app/api/d/[dept]/recordings/[id]/key/route.ts` — 영문 코드가 만들어지는 곳
- `lib/recording/recording-routes.ts` — 서버가 이미 한국어로 돌려주는 문구

## 작업

새 파일 `lib/recording/recorder-copy.ts`와 미러 테스트 `tests/recording/recorder-copy.test.ts`. **테스트를 먼저 쓰고**(TDD, `scripts/hooks/tdd-guard.sh`가 강제) 통과하는 구현을 쓴다. DOM·React·브라우저 API에 의존하지 않는다.

```ts
export type RecorderTone = "info" | "warning" | "error";

// 던진 값(Error·DOMException·문자열)을 사용자 문구로 바꾼다. 표시 전용.
export function recorderErrorText(cause: unknown): string;

// RecordingSnapshot.reason → 안내. duration_limit만 tone "info", 나머지는 "warning".
export function stopReasonNotice(reason: string): { tone: RecorderTone; text: string };

// 서버 세션 상태 → 사람이 읽는 이름.
export function sessionStateLabel(state: string): string;

export type RecorderStage = "setup" | "starting" | "recording" | "paused" | "stopped" | "saving" | "done";
export function recorderStage(input: {
  selected: boolean; starting: boolean;
  snapshotState: "recording" | "paused" | "stopping" | "interrupted" | "stopped" | null;
  sessionState: string | null;
}): RecorderStage;

// 비활성 버튼 옆에 보여 줄 빠진 조건. 빈 배열이면 누를 수 있다. 순서는 아래 목록 순서.
export function missingTestConditions(input: { consent: boolean; supported: boolean }): string[];
export function missingStartConditions(input: {
  consent: boolean; heardTest: boolean; title: string; supported: boolean; secure: boolean;
}): string[];

// 최근 입력 크기(RMS) 기록에서 소리가 있었는지. 기본 임계값 0.002(현재 코드와 같음).
export function signalDetected(recentLevels: readonly number[], threshold?: number): boolean;

// "오늘 오후 9:53까지" · "내일 오전 8:10까지" · "9월 30일 오후 1:00까지". 분 단위, 초 없음.
export function formatExpiry(expiresAt: string, now: Date, timeZone?: string /* 기본 "Asia/Seoul" */): string;

// 녹음 중 탭 제목. 녹음·일시정지·중단이 아니면 baseTitle 그대로.
export function recorderTabTitle(stage: RecorderStage | "interrupted", recordedSeconds: number, baseTitle: string): string;
```

### `recorderErrorText` 규칙

- 한글이 들어 있는 메시지는 그대로 돌려준다(서버 route가 이미 한국어로 준다).
- 아래 코드는 표의 뜻을 담아 wording-guide에 맞는 한 문장(또는 원인+해결 두 문장)으로 바꾼다. 문안은 다듬어도 되지만 **무엇이 문제이고 무엇을 하면 되는지**가 모두 들어가야 한다.

| 입력 | 뜻 |
|---|---|
| `shared_audio_missing` | 공유한 화면에 소리가 없음 → 공유 창에서 오디오 공유를 켜고 다시 시작 |
| `microphone_missing` | 마이크를 찾지 못함 → 연결·브라우저 권한 확인 |
| `input_ended` | 입력이 끊김 → 공유·마이크 다시 선택 |
| `storage_space_insufficient` | 이 기기 저장 공간 부족 → 64MB 이상 비우고 다시 |
| `recording_storage_unavailable` | 브라우저 저장소를 쓸 수 없음 → 일반 창에서 열거나 사이트 데이터 차단 해제 |
| `recording_worker_timeout` | 녹음 준비가 늦어짐 → 새로 고친 뒤 다시 |
| `recording_other_tab` | 다른 탭에서 녹음 중 → 그 탭 녹음을 마친 뒤 |
| `recording_key_forbidden` | 녹음 권한 확인 실패 → 동의 상태·조직 녹음 설정 확인 |
| `recording_unavailable` | 폐기·만료됐거나 참석자 동의가 바뀌어 더 열 수 없음 |
| `recording_key_unavailable` | 녹음 키 준비 실패 → 잠시 후 다시 |
| `recording_recovery_changed` | 이 기기의 녹음 기록이 바뀜 → 목록 다시 확인 |
| `recording_levels_invalid` | 녹음 품질 정보 확인 실패 → 다시 저장 |
| `recording_bundle_invalid` | 원본 구간 합치기 실패 → 다시 내려받기 |
| 이름이 `NotAllowedError`인 `DOMException`, 또는 메시지 `Permission denied`로 시작 | 화면 공유·마이크를 허용하지 않아 시작하지 않음 → 다시 시작하거나 주소창 사이트 설정에서 허용 |
| `TypeError`의 `Failed to fetch` | 서버에 연결하지 못함 → 인터넷 연결 확인 후 다시 |
| 그 밖의 영문·빈 값 | `녹음 작업을 완료하지 못했습니다. 다시 시도해 주세요.` |

### `stopReasonNotice` 규칙

사유: `duration_limit`(info: 30분이 되어 마쳤고, 이어서 하려면 저장 뒤 `이 회의 이어서 녹음`), `page_left`, `input_ended`, `capture_suspended`(절전·브라우저 멈춤), `capture_input_stalled`(5초 넘게 소리 데이터 없음), `capture_backlog`·`storage_backlog`(기기가 제때 저장 못함), `storage_failed`, `capture_worker_timeout`·`capture_worker_failed`·`capture_processor_failed`(처리 오류, 새로 고친 뒤 다시), `capture_lease_lost`(다른 탭이 녹음을 가져감), `profile_storage_failed`, `recording_setup_failed`. 모르는 사유는 warning + 일반 문구. 영문 코드를 문구에 넣지 않는다.

### 그 밖의 규칙

- `sessionStateLabel`: `active` 저장 전 · `saving` 서버에서 확인 중 · `completed` 저장 완료 · `discarded` 폐기됨 · `expired` 기한 만료 · `revoked` 참석자 동의 변경으로 취소됨. 모르는 값은 `확인 필요`.
- `recorderStage`: 선택된 세션이 없으면 `setup`(단, `starting`이 참이면 `starting`). 스냅샷이 recording/stopping → `recording`, paused → `paused`, interrupted/stopped → `stopped`. 세션이 `saving` → `saving`, `completed` → `done`. 세션 상태가 스냅샷보다 우선한다.
- `missingStartConditions` 문구 순서: 제목 → 참석자 동의 → 5초 테스트 확인 → 지원 브라우저(Chrome·Edge 최신판) → 보안 연결. 제목은 `trim()` 기준.
- `signalDetected`: 배열의 최댓값 ≥ 임계값. 빈 배열은 false.
- `recorderTabTitle`: recording `● 녹음 중 m:ss · {base}`, paused `❚❚ 잠시 멈춤 m:ss · {base}`, interrupted `⚠ 녹음 중단 · {base}`. 시간은 `Math.floor`, 분은 자리 채움 없음, 초는 두 자리.

### 테스트가 확인할 것

표의 모든 코드와 모든 중단 사유가 한글 문구이고 영문 코드를 포함하지 않는다. 한글 메시지는 그대로 통과한다. `duration_limit`만 info다. `formatExpiry`는 고정 `now`와 `Asia/Seoul`로 오늘·내일·다른 날 세 경우를 확인한다. `recorderStage`의 우선순위, `missingStartConditions`의 순서, `signalDetected`의 경계값(0.002 정확히), `recorderTabTitle`의 세 형식을 확인한다.

## 코드 관계와 구조 확인

- Graft(README §4 절차, `{N}=0`): 구현 전 `graft grep "recording_unavailable|shared_audio_missing|storage_space_insufficient|recording_other_tab|recording_key_forbidden"`와 `graft grep "녹음 중단 사유|서버 상태"`로 코드·문구 위치를 다시 확인한다. 구현 후 새 모듈이 그래프에 들어갔는지 `graft skeleton lib/recording/recorder-copy.ts`로 확인한다. `graft-s0-before.txt`·`graft-s0-after.txt`.
- Archify: 해당 없음(순수 모듈 추가).

## Acceptance Criteria

```powershell
npx vitest run tests/recording/recorder-copy.test.ts
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build; git restore next-env.d.ts
npm run test -- --maxWorkers=2 --testTimeout=15000
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md §2 디렉토리 구조를 따르는가? (`lib/recording/`, 미러 테스트 `tests/recording/`)
   - ADR 기술 스택을 벗어나지 않았는가? (새 의존성 없음, i18n 프레임워크 없음)
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - 새 `lib/` 모듈에 `tests/` 미러 테스트가 있는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 0을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "lib/recording/recorder-copy.ts 공개 함수 목록과 테스트 수, Graft 결과 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `components/`·`app/`을 고치지 마라. 이유: 화면 적용은 step 1~3이 순서대로 한다. 여기서 고치면 다음 step과 충돌한다.
- 던지는 오류 코드(`throw new Error("recording_unavailable")` 등)나 서버 응답 문자열을 바꾸지 마라. 이유: `MeetingRecorder.recover`가 `cause.message === "recording_unavailable"`로 로컬 자료 삭제를 분기한다(`components/meeting-recorder.tsx:317`). 변환은 표시할 때만 한다.
- i18n 라이브러리나 번역 파일 구조를 만들지 마라. 이유: UI 언어는 한국어 단일이다(CLAUDE.md).
- `tdd-guard.sh`를 Bash로 우회하지 마라. 이유: `lib/` 새 모듈은 테스트가 먼저다.
- 검증 빌드 없이 `npm run build`를 돌리지 마라. 이유: 떠 있는 dev 서버의 `.next`와 충돌한다. `SASU_VERIFY_BUILD=1`을 쓰고 끝나면 `next-env.d.ts`를 되돌린다.
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라. 이유: 재시도·refusal·비용 기록이 거기에만 있다.
