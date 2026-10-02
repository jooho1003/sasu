# Step 11: desktop-fixes

## 읽어야 할 파일

- `docs/03-analysis/desktop-companion.analysis.md` 전체 (이 step이 고칠 차이 목록 — C1·I1·I2·I4·Minor)
- `docs/PRD.md` §3-8 DC-01~DC-11, §11 "데스크톱 동반 앱" 행
- `docs/ARCHITECTURE.md` §6-12 불변식 46~50
- `docs/ADR.md` ADR-082 결정 6·7
- `docs/02-design/features/desktop-companion.design.md` §5.1·§5.2·§5.3(설정)·§6(429 행)·§7(S5·S7)
- `desktop/src/main/index.ts`, `desktop/src/main/windows/index.ts`, `desktop/src/main/tray.ts`, `desktop/src/main/notify.ts`, `desktop/src/main/ipc.ts`, `desktop/src/main/outbox-service.ts`, `desktop/src/main/core/{outbox,pet-state,poller}.ts`(+`__tests__`), `desktop/src/preload/index.ts`, `desktop/src/renderer/src/{App.tsx,components/*,pet/PetCanvas.tsx}`, `desktop/tests/e2e/*.spec.ts`

## 작업

1차 analyze(84.2%)가 찾은 desktop 차이를 고친다. 서버(`app/`·`lib/`·`supabase/`)는 바꾸지 않는다.

1. **C1 펫 클릭으로 패널 열기**
   - `ipcMain.on("pet-toggle-panel", …)`을 등록하고, 보낸 창이 펫 창(`event.sender === windows.pet.webContents`)일 때만 `togglePanel()`을 부른다.
   - 트레이 아이콘을 실제 이미지로 바꾼다(`desktop/resources/tray.ico` 또는 PNG, 16·32px). 빈 이미지(`nativeImage.createEmpty()`)를 쓰지 않는다. electron-builder `extraResources`/`files`에 포함한다.
   - 처음 실행(로그인 전)에는 패널을 바로 보여 준다.
2. **I1 "본 항목" 저장과 알림**
   - 화면에서 카드·답·자료·영업 작업을 열면 그 ID를 `settings:set({ seen })`으로 저장한다(최대 500개, 오래된 것부터 버림).
   - 본체는 상태 요약마다 **새로 나타난** 카드 ID·완료된 답·실패 항목을 이전 요약과 비교해 알림을 보낸다(상태가 같아도 새 카드면 알림). 알림 문구는 종류별 고정 문구와 건수만(설계 §7 S7): 카드 "결정할 카드가 N건 있어요", 답 "답이 도착했어요", 자료·영업 완료 "맡긴 일이 끝났어요", 실패 "작업이 실패했어요".
   - core `pet-state`는 `seen`을 반영한다(이미 있으면 테스트만 보강).
3. **I2 하루 한도(429)는 보관하지 않는다** — design §6·ADR-082 결정 7. `outbox-service.ts`의 `shouldKeep`과 core `outbox.ts`의 `applySendResult`에서 429를 "제거 + 하루 한도 안내"로 바꾼다. 유지 대상은 네트워크 오류·5xx·`timeout`뿐이다. core 테스트를 고친다(이전 step 8 명세의 "429 유지"는 설계와 어긋난 오류였다).
4. **I4 펫 위치·동작 줄이기**
   - 펫 창 이동이 끝나면 위치를 설정에 저장하고 시작할 때 복원한다(현재 모니터 밖이면 기본 위치).
   - 설정 탭에 "움직임 줄이기" 켬/끔을 두고, Windows 설정(`prefers-reduced-motion`) 또는 앱 설정 중 하나라도 켜져 있으면 펫을 정지 그림으로 그린다.
5. **Minor**
   - 트레이 "펫 숨기기/보이기" 라벨을 상태에 맞게 갱신한다.
   - 펫 색을 바꾸면 펫 창에 바로 반영한다.
   - 설정 탭에 단축키(`Ctrl+Alt+S`)·기기 이름·실제 앱 버전(`app.getVersion()`)을 보여 준다.
   - 답 대기 폴링에 core `answerPollPlan`(120초 상한)을 쓴다.
   - 업데이트 확인을 시작 시 1회 + 6시간마다로 한다(패키지 빌드에서만). 설치 빌드에서는 `SASU_DISABLE_UPDATER`를 무시한다(`!app.isPackaged`일 때만 허용).
   - 모든 IPC 핸들러에 발신 창 검사를 넣는다(펫 창에는 창 이동·패널 토글·설정 읽기만, 나머지는 패널 창만).
   - 쓰지 않는 `panel-blurred` 구독을 지우거나 실제로 연결한다.
   - 시작 실패 로그의 `code`에 오류 메시지 대신 고정 코드(`cause.name`)만 쓴다.
6. **E2E 보강**: smoke에서 펫 창을 클릭한 뒤 `panel.isVisible()`가 true인지 확인한다. 기존 E2E 5건이 모두 통과해야 한다.
7. 결과는 `docs/verification/43-desktop-companion/desktop-fixes.md`.

## 실행 메모

- 검증 서버는 step 10·12의 "실행 메모 — 장시간 서버"처럼 분리 프로세스로 띄우고 끝나면 끈다.
- E2E용 서버는 `node scripts/review-qa.mjs build` → `start` 순서로 띄운다(루트 `npm run build`의 `.next`는 운영 Supabase 주소라 401이 난다). 루트 `npm run build`는 E2E 뒤에 실행한다.
- 앱은 로컬 QA의 `SUPABASE_URL`·`SUPABASE_ANON_KEY`와 `SASU_APP_URL=http://127.0.0.1:3011`로 빌드한다.

## Acceptance Criteria

```powershell
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix desktop run build
npm --prefix desktop run e2e
npm run check:wording
npm run lint
npm run test
npm run build
git diff --check
```

- 정적 확인(출력 0줄): `git grep -n "nativeImage.createEmpty\|dangerouslySetInnerHTML" -- desktop/src` · `git grep -n "429" -- desktop/src/main/outbox-service.ts`가 보관 조건에 없음.
- E2E 기록에 "펫 클릭 → 패널 표시"가 실제 출력으로 있어야 완료다.

## 검증 절차

1. AC 실행, 펫 클릭 전후·설정 탭 스크린샷을 기록에 연결한다.
2. 체크리스트: 알림에 내용 없음 · renderer 네트워크·토큰 없음 · IPC 발신 창 검사 · 429 보관 없음.
3. `phases/43-desktop-companion/index.json` step 11을 갱신한다.

## 금지사항

- 서버 코드(`app/`·`lib/`·`supabase/`)를 바꾸지 마라. 이유: 이 step은 앱 보완이며 서버는 analyze에서 일치했다.
- 알림·트레이에 질문·답·카드 제목을 넣지 마라. 이유: design §7 S7.
- 하루 한도(429) 질문을 보관하지 마라. 이유: ADR-082 결정 7·design §6.
- 셸 도구로 서버를 직접 띄우고 기다리지 마라. 이유: 세션이 멈춘다(2026-10-02 실측).
