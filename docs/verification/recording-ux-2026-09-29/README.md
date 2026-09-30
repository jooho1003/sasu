# 녹음 화면 UI/UX 개선 — phase 33 검토·실행 기록

상태: **step 0~8 기능 구현·로컬 검증 완료, phase 완료 게이트 보류**(2026-09-29, 제품 E2E 9/9). 단계별 Graft 전후 스냅샷은 Docker 장애 당시 생성하지 못했으며, phase 계획 시점과 최종 작업 트리의 실제 그래프로 관계를 확인했다. Plan §4.1의 단계별 Graft 조건은 미충족이다. bkit 설계: [plan](../../01-plan/features/recording-ux.plan.md) · [design](../../02-design/features/recording-ux.design.md)(2026-09-29, 설계안 C). step 명세는 [`phases/33-recording-ux`](../../../phases/33-recording-ux/), 플랜은 `.claude/plans/recording-ux-2026-09-29.*`. [step 0 결과](../../../phases/33-recording-ux/step0.summary.md) · [step 1 결과](../../../phases/33-recording-ux/step1.summary.md) · [step 2 결과](../../../phases/33-recording-ux/step2.summary.md) · [step 3 결과](../../../phases/33-recording-ux/step3.summary.md) · [step 4 결과](../../../phases/33-recording-ux/step4.summary.md) · [step 5 결과](../../../phases/33-recording-ux/step5.summary.md) · [step 6 결과](../../../phases/33-recording-ux/step6.summary.md) · [step 7 결과](../../../phases/33-recording-ux/step7.summary.md) · [step 8 결과](../../../phases/33-recording-ux/step8.summary.md).

bkit 마감: [설계 대비 분석(95.0%)](../../03-analysis/recording-ux.analysis.md) · [부분 완료 보고서](../../04-report/features/recording-ux.report.md). Plan §4.1의 단계별 Graft 전후 조건은 열려 있다.

## 1. 검토 근거 (2026-09-29)

코드(`components/meeting-recorder.tsx`, `recording-segment-player.tsx`, `review-detail.tsx`, `admin/review-settings.tsx`, `reviewed-materials.tsx`, `app/globals.css`)와 기존 검증 캡처(`../browser-meeting-recording/step2-prepared-synthetic.png`, `step2-recovered-synthetic.png`, `step2-product-local-synthetic.png`, `access-playback-390.png`)로 판단했다. 실제 기기 녹음은 하지 않았다. 줄 번호는 2026-09-29 작업 트리 기준이다.

| ID | 문제 | 근거 | 처리 step |
|---|---|---|---|
| U01 | 되돌릴 수 없는 `녹음 종료`가 주 버튼이고 확인이 없다. 종료 뒤 같은 세션은 다시 녹음할 수 없다 | `meeting-recorder.tsx:518`, `begin()`의 `prepared` 조건 | 2 |
| U02 | 녹음 중 이탈 보호가 없다. 뒤로 링크·사이드바의 클라이언트 이동은 `beforeunload`도 `pagehide`도 없이 언마운트로 녹음을 끊는다 | `:120-126`, `:491` | 2 |
| U03 | 탭 제목이 바뀌지 않아 Meet 탭에 있는 사용자는 중단을 모른다 | 파일 전체에 `document.title` 없음 | 2 |
| U04 | 오류가 성공 안내와 같은 초록 상자(`review-notice`)이고 화면 맨 위에만 나온다 | `:492-493`, `globals.css:79` | 2 |
| U05 | 재생 중 슬라이더를 끌면 `onChange`마다 구간 1~2개를 요청하고 취소하지 않아 분당 60건 한도에 걸린다 | `recording-segment-player.tsx:54`, `:128-131` | 4 |
| U06 | 녹음 상태가 본문 한 줄이고 시간 두 개, 내부 용어 "확인 저장" | `:511` | 2 |
| U07 | 영문 코드·상태 노출(`녹음 중단 사유: capture_suspended`, `서버 상태: expired`). 30분 정상 종료도 `duration_limit` 경고(`role="alert"`) | `:510`, `:516` | 0·2 |
| U08 | 시작까지 3단계(테스트 → 준비 → 입력 선택), 현재 위치 표시 없음. 준비 뒤 방치하면 세션이 한도를 24시간 차지 | `:504-517` | 1(ADR-071)·3 |
| U09 | 비활성 버튼의 이유를 알려 주지 않는다 | `:504`, `:507` | 0·3 |
| U10 | 복구 목록: 버튼 스타일 없음(글자처럼 보임), 열린 녹음 중복, "녹음 이어서 확인"·"이 기기의 기록 확인 필요" 오해, 초 단위 만료 시각 | `:524`, `step2-prepared-synthetic.png` | 3 |
| U11 | 녹음을 연 뒤 새 녹음 화면으로 돌아갈 방법이 없다(폐기·새로고침뿐) | `:509-523` | 3 |
| U12 | `녹음 폐기`가 주 버튼 바로 아래 같은 무게 | `:522` | 3 |
| U13 | 매초 바뀌는 타이머가 `role="status"` 안에 있어 스크린 리더가 1초마다 읽는다 | `:511` | 2 |
| U14 | 라디오 `name` 없음(방향키 이동 불가), 미터 접근 가능한 이름 없음 | `:497`, `:505`, `:512` | 3 |
| U15 | "입력 감지/소리 확인 필요"가 100ms 판정이라 말 사이에 깜빡인다 | `:244-248`, `:505` | 0·3 |
| U16 | 마이크 모드에서도 "두 입력이 들리는지" | `:266` | 3 |
| U17 | 재생 버튼과 슬라이더 사이에 내려받기 버튼, 줄 어긋남, 전체 길이 없음 | `recording-segment-player.tsx:125-133`, `step2-product-local-synthetic.png` | 4 |
| U18 | "입력이 과했습니다"가 초록 안내 상자 | `review-detail.tsx:484-485` | 6 |
| U19 | 링크 하나뿐인 "이어진 회의 기록" 패널이 검토 화면 맨 위를 차지 | `review-detail.tsx:352-358` | 6 |
| U20 | 관리자 설명이 각 체크박스 아래에 없고, 진행 중 건수를 끄려 할 때만 보여 준다 | `admin/review-settings.tsx:34-37` | 7 |
| U21 | 녹음 자료도 목록 배지가 업로드와 같은 "음성" | `reviewed-materials.tsx`, 목록 API select에 `original_layout` 없음 | 5 |
| U22 | 조직 스위치가 꺼져도 `회의 녹음` 버튼이 보인다(설계 V19 "진입 버튼 없음") | `reviewed-materials.tsx:222` | 5 |

## 2. 결정

- ADR-071(2026-09-29 사용자 결정): `녹음 시작` 한 번으로 입력 선택 → 세션 → 키 → 사전 검사 → 캡처. PRD 1.18 REC-06, 설계 §4.1, phase 23 step2 명세에 반영했다.
- `녹음 종료` 확인은 `window.confirm`이 아닌 화면 안 두 단계 버튼(기본값, step 2).

## 3. 코드 관계 (Graft, 계획 시점)

Graft 0.19.0을 기존 격리 컨테이너 `sasu-retention-graft-20260924`(`node:22-bookworm`, `DO_NOT_TRACK=1`, deep·LLM 키 없음)에서 실행했다. 입력은 2026-09-29 작업 트리의 `app components lib scripts/review-controls-lab scripts/recording-lab tests/review-controls tests/e2e package.json tsconfig.json`(388파일). build 2,093노드·4,979관계, `graft check` OK. 원문: [graft-plan.txt](graft-plan.txt).

- JSX 사용은 호출 관계로 잡히지 않는다(`graft callers MeetingRecorder` → no indexed callers). 그래서 `graft grep`으로 확인했다.
  - `<MeetingRecorder`: `app/(auth)/d/[dept]/reviews/record/page.tsx:14`, `scripts/review-controls-lab/main.tsx:12`
  - `<RecordingSegmentPlayer`: `components/review-detail.tsx:487`
  - `<ReviewSettingsForm`: `app/admin/security/page.tsx:15`, `scripts/review-controls-lab/main.tsx:10`
  - `reviews/record` 진입: `reviewed-materials.tsx:222`, `review-detail.tsx:357`, `tests/e2e/recording-product.spec.ts:57`
- **복구 로직이 오류 코드 문자열로 분기한다.** `MeetingRecorder.recover`의 `cause.message === "recording_unavailable"`(`meeting-recorder.tsx:317`). 따라서 한국어 변환은 표시할 때만 하고 던지는 코드는 바꾸지 않는다(모든 step의 금지사항).
- 영문 코드 출처: `captureInputs`(`shared_audio_missing`, `lib/recording/browser/inputs.ts:28`), `probeRecordingStore`(`storage_space_insufficient`, `storage.ts:226`), `acquireCaptureLock`(`recording_other_tab`, `storage.ts:275`), 키 route(`recording_key_forbidden`·`recording_unavailable`, `app/api/d/[dept]/recordings/[id]/key/route.ts:19-42`).
- Archify: 구성 요소 경계·데이터 흐름은 바뀌지 않는다(서버·SQL·migration 변경 없음, step 5의 목록 응답 필드 추가만). ADR-071은 한 컴포넌트 안의 호출 순서만 바꾼다. 그래서 Archify는 실행하지 않는다. 새 Archify 결과가 있다고 주장하지 않는다.

## 4. 각 step의 Graft 절차

컨테이너 안에서도 `rm -rf`는 `scripts/hooks/dangerous-command-guard.sh`가 막는다. 지우지 말고 step마다 새 디렉터리 이름을 쓴다. `{N}`은 step 번호, `{when}`은 `before`/`after`.

```bash
docker start sasu-retention-graft-20260924
tar -cf - app components lib scripts/review-controls-lab scripts/recording-lab tests/review-controls tests/e2e package.json tsconfig.json \
  | docker exec -i sasu-retention-graft-20260924 sh -c 'mkdir -p /work/ux33-s{N}-{when} && tar -xf - -C /work/ux33-s{N}-{when} && cd /work/ux33-s{N}-{when} && graft build . --dir /work/ux33-s{N}-{when}-graph | tail -3 && graft check . --dir /work/ux33-s{N}-{when}-graph | head -3'
docker exec sasu-retention-graft-20260924 sh -c 'cd /work/ux33-s{N}-{when} && graft grep "<패턴>" . --dir /work/ux33-s{N}-{when}-graph && graft callers <심볼> . --dir /work/ux33-s{N}-{when}-graph --depth 2 --no-refresh'
```

결과는 `graft-s{N}-{when}.txt`로 이 폴더에 저장한다. `[graft] tokens saved` 줄은 빼도 된다. Docker가 없으면 미실행 사유와 실제 파일로 확인한 범위를 적는다.

## 5. 실행 방식

`scripts/execute.py`는 step마다 `git add -A`로 커밋한다(`scripts/execute.py:208`). 실행 당시 작업 트리에 다른 세션의 phase 23 변경이 있어서 이 스크립트 대신 각 step을 직접 구현·검증했다. 다른 변경을 phase 33 커밋에 섞지 않기 위해 커밋은 하지 않았다.

## 6. 결과

2026-09-29 로컬 실행 기준. 실험실은 합성 입력·모의 API, 제품 E2E는 **실제 로컬 서버·Supabase 로그인·DB·작업 처리**에 합성 마이크 입력을 사용했다. 실제 기기/실제 회의 결과는 아니다. Docker Linux 엔진을 복구하고 Supabase를 API 55321에서 시작했다. 테스트·시드 명령의 Supabase URL과 키는 해당 셸에서 로컬 값으로 덮어썼으며 원격 DB에는 테스트하지 않았다. 녹음 권한 스위치 off/on을 로컬 DB에서 검증하고 원래 값으로 복구했다.

| 항목 | 결과 | 실행 근거 |
|---|---|---|
| U01 종료 확인 | 합성 해결 | `meeting-recorder.spec.ts` 종료 확인·Esc, `s2-stop-confirm-{1440,390}.png` |
| U02 이탈 보호 | 합성 해결 | `meeting-recorder.spec.ts` 링크·beforeunload·pagehide |
| U03 탭 제목 | 합성 해결 | `meeting-recorder.spec.ts` 녹음/중단/복귀 제목 |
| U04 오류 색 | 합성 해결 | `meeting-recorder.spec.ts` 실패 경로, `recorder-notice is-error` |
| U05 탐색 요청 과다 | 합성 해결 | `recording-segments.spec.ts` 드래그 0건·확정 뒤 2건 이하, 키보드 10회 후 2건 이하 |
| U06 상태·시간 | 합성 해결 | `s8-recording-1440.png`, `s1-recording-synthetic.png` |
| U07 영문 상태·정상 종료 | 합성 해결 | `recorder-copy.test.ts` 문구 계약, `meeting-recorder.spec.ts` |
| U08 시작 단계 | 합성 해결 | `meeting-recorder.spec.ts` 테스트 뒤 시작 한 번, `s3-form-{1440,390}.png` |
| U09 비활성 이유 | 합성 해결 | `meeting-recorder.spec.ts` 조건 표시, `s3-form-{1440,390}.png` |
| U10 복구 목록 | 합성 해결 | `meeting-recorder.spec.ts` 중복 제외·확인 버튼, `s3-recovery-list-1440.png`, `s8-recovery-list-390.png` |
| U11 새 녹음 화면 | 합성 해결 | `meeting-recorder.spec.ts` 보존·복귀 |
| U12 폐기 분리 | 합성 해결 | `s3-recovery-list-1440.png`, danger zone |
| U13 타이머 낭독 | 합성 해결 | `meeting-recorder.spec.ts` status에 매초 타이머 없음, `keyboard-recorder.spec.ts` |
| U14 라디오·미터 | 합성 해결 | `meeting-recorder.spec.ts` 방향키·접근성 이름 |
| U15 입력 감지 흔들림 | 단위 확인 | `recorder-copy.test.ts` 15샘플 평균, 합성 화면 표시 |
| U16 모드별 안내 | 합성 해결 | `meeting-recorder.spec.ts` 마이크 모드 문구 |
| U17 플레이어 정렬 | 합성 해결 | `recording-segments.spec.ts`, `s4-player-{1440,390}.png` |
| U18 입력 과다 경고 | 합성 해결 | `recording-segments.spec.ts` 0.1/0.01·live region 제외, `s6-review-detail-{1440,390}.png` |
| U19 이어진 기록 | 합성 해결 | `recording-segments.spec.ts` nav·링크, `s6-review-detail-{1440,390}.png` |
| U20 관리자 설명·건수 | 합성 해결 | `access.spec.ts` 초기 on·off→on 저장·읽기 전용 0요청, `s7-admin-1440.png`, `s8-admin-390.png` |
| U21 녹음 자료 배지 | 로컬 제품 해결 | `recording-product.spec.ts` 실제 로그인 목록에서 `회의 녹음` 배지 확인, 목록 API의 `original_layout` select |
| U22 스위치 off 진입 | 로컬 제품 해결 | `recording-product.spec.ts` 실제 로그인 off/on 전환·직접 URL 접근·목록 진입 확인, `s8-entry-off-{1440,390}.png`, `s8-record-off-{1440,390}.png`, `s8-entry-on-1440.png` |

| 검증 | 결과 |
|---|---|
| `npx vitest run tests/reviews-list-route.test.ts tests/review-detail-route.test.ts tests/contracts.test.ts` | 37 통과 |
| `npm run test -- --maxWorkers=2 --testTimeout=15000` | 151파일·1664 통과(SSR hydration 회귀 테스트 포함) |
| `npm run e2e:recording` | 합성 실험실 20 통과·기존 1 건너뜀 |
| `npm run e2e:review-controls` | 합성 실험실 27 통과(키보드·off→on 관리자 회귀 포함) |
| `npm run lint` | exit 0, 기존 wording 경고 79·blocking 0 |
| `npm run build` | Next 16.3.4 컴파일·TypeScript·정적 38페이지 통과 |
| `npx supabase status` | 통과: 로컬 API 55321·DB 가동 |
| `npx playwright test --config playwright.recording-product.config.ts` | 로컬 제품 E2E 9/9 통과(로그인→녹음→저장→전사→확정→요약, 스위치 off/on) |
| Graft 마감 | 계획·최종 그래프 `graft check` OK, 최종 412파일·2,169노드·5,181관계. 단계별 전후 그래프 0~7 미생성: [최종 관계 기록](graft-s8-after.txt) |
| 알림 글자 대비 | info 9.67:1, warning 7.97:1, error 8.50:1(각 CSS 전경·배경 상대 휘도 계산, 모두 4.5:1 이상) |

키보드는 제목→동의→5초 테스트→확인→시작→일시정지→재개→종료 확인→Esc→종료→저장 버튼 포커스를 마우스 없이 통과했다(`keyboard-recorder.spec.ts`, `s8-keyboard-focus.png`). 로컬 제품 E2E에서 Node 24의 서버 `navigator`와 브라우저 기능 차이로 hydration 오류를 발견해 `useSyncExternalStore`로 수정했고, 회귀 단위 테스트를 추가한 뒤 9건을 다시 통과했다. 캡처는 합성 입력 실험실 화면과 로컬 제품 화면이며 OS 시스템 소리 지원이나 실제 기기 V01~V06을 검증한 증거가 아니다. phase 계획 시점 [Graft 그래프](graft-plan.txt)와 최종 그래프는 있으나 Docker 장애 당시 step 0~7의 개별 전후 그래프는 남기지 못했다. Plan §4.1의 단계별 Graft 전후 산출물이 없어 phase의 형식상 완료 판정은 보류한다. 운영 배포는 하지 않았다.
