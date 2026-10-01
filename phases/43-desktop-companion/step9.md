# Step 9: desktop-ui

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-01~DC-11, §3-7(쉬운 말 기준), `docs/wording-guide.md`
- `docs/ARCHITECTURE.md` §3.5(인용 없으면 출력 없음), §6-11 불변식 48·49
- `docs/ADR.md` ADR-081 결정 6·7·8·10
- `docs/02-design/features/desktop-companion.design.md` §5(창·상태·탭·U01~U14)·§6·§7(S5·S7)
- step 8 산출물: `desktop/src/main/**`, `desktop/src/preload/index.ts`(노출 함수 목록), `desktop/src/main/core/pet-state.ts`
- `components/trailer-office.tsx:10-34`(`drawPerson`), `components/recruitment-trailer.tsx:18`(색 3종)
- 웹 화면 참고: `components/ask-s4.tsx`(답·인용 표시), 카드 페이지 `app/(auth)/d/[dept]/cards/[id]/page.tsx`, `components/reviewed-materials.tsx`(검토함 업로드 입력·동의 확인)

## 작업

1. 창(본체, `desktop/src/main/windows/`, `tray.ts`, `shortcut.ts`, `notify.ts`):
   - 펫 창 128×128: 투명·프레임 없음·`setAlwaysOnTop(true,'floating')`·작업표시줄 숨김·크기 고정. 클릭은 패널 열기/닫기, 끌기는 IPC로 창 이동 후 위치 저장(화면 밖이면 기본 위치로).
   - 패널 창 380×560: 펫 옆에 열고, 포커스를 잃으면 숨김(고정 핀을 켜면 유지).
   - 트레이: 열기 · 펫 숨기기/보이기 · 연결 해제 · 종료.
   - 전역 단축키 `Ctrl+Alt+S` → 패널의 질문 입력에 포커스. 등록에 실패하면 설정 탭에 안내.
   - Windows 알림: "답이 도착했어요" · "결정할 카드가 N건 있어요" · "작업이 실패했어요"만. **질문·답·카드 내용을 넣지 않는다.** 누르면 해당 탭을 연다.
   - 상태 확인 반복: core `poller`로 `inbox:get` → core `computePetState` → 펫 창에 상태 전달. 로컬 "본 항목" 기록은 암호화 파일 설정에 저장.
2. 화면(`desktop/src/renderer/`, React):
   - 처음 실행: 이메일 → 6자리 코드 → 부서 선택. 미동의 부서는 고를 수 없게 하고 "웹에서 먼저 동의해 주세요" + `app:openWeb('/consent?next=/d/<dept>')`(웹 동의 페이지는 `app/(auth)/consent`).
   - `pet/PetCanvas.tsx`: `drawPerson` 이식, 색 3종(설정에서 선택), 상태 5종(design §5.2 모양). `prefers-reduced-motion`이면 정지 그림.
   - 탭 5개(design §5.3):
     - **질문**: 5~1000자 입력 → `ask:send` → 2초 간격 `answer:get`. 답은 인용이 1개 이상일 때만 보여 주고 인용마다 따옴표 문장과 출처 이름, "웹에서 원문 보기". refused·failed·하루 한도는 웹과 같은 안내. 전송 실패 시 "연결되면 보낼게요"(끊김 보관).
     - **결정함**: inbox 카드 목록 → `card:get` 화면(배경·추천·근거·충돌, 인용 없는 문장 렌더 금지) → 결정/보류/반려(+결과·이유) → `card:decide`. 보내는 동안 버튼 잠금.
     - **기록**: `questions:list` 20개씩, 누르면 `answer:get`.
     - **일 맡기기**: lead만 보이는 끌어다 놓기 영역 — `.vtt/.txt` → 회의 기록(4MB 넘으면 자료 검토함 안내), 문서·음성 → 자료 검토함(공개 범위·참여자·`consent_confirmed` 확인 입력은 웹과 같은 규칙; 음성은 `@sasu/review-audio`의 `audioPlan`·`encodeMonoWav`로 화면에서 나눈 뒤 바이트를 IPC로 본체에 전달). lead의 "영업 원문 검토": `sales:sources` 역할별 목록에서 서로 다른 4건 선택 → `sales:start` → 상태 → "웹에서 결과 보기". phase 41이 없어 `sales:*`가 404면 이 구역을 숨긴다.
     - **설정**: 펫 모양 3종 · 단축키 안내 · 부서·기기 이름 · 로그아웃(`auth:signOut`) · 버전.
   - 모든 문구는 `docs/wording-guide.md` 기준을 따른다(`npm run check:wording`이 renderer를 검사한다).
3. `desktop/tests/e2e/smoke.spec.ts`(Playwright `_electron`, 로컬 QA 서버 대상): 코드 로그인 → 부서 선택 → 펫 창·패널 열림 → 시드한 답을 기록 탭에서 열어 인용 표시 → 담당 카드 결정 → 결정 버튼 연타해도 서버 `decisions` 1건. 실행 명령을 `desktop/package.json`의 `e2e`로 둔다.
4. 결과·스크린샷은 `docs/verification/42-desktop-companion/desktop-ui.md`.

## Acceptance Criteria

```powershell
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix desktop run build
npm --prefix desktop run e2e
npm run check:wording
npm run lint
npm run build
npm run test
git diff --check
```

- 정적 확인(출력 0줄): `git grep -n "dangerouslySetInnerHTML\|fetch(\|createClient(" -- desktop/src/renderer`

## 검증 절차

1. AC 실행, 펫 상태 5종·탭 5개 스크린샷을 기록에 연결한다.
2. 체크리스트: 인용 없는 문장 렌더 0 · 알림 문구에 내용 없음 · renderer에 네트워크·토큰 없음.
3. `phases/42-desktop-companion/index.json` step 9를 갱신한다.

## 금지사항

- 답·카드 문장을 인용 없이 보여 주지 마라. 이유: CLAUDE.md CRITICAL — 인용 없는 문장은 렌더하지 않는다.
- 알림·트레이 툴팁에 질문·답·카드 제목을 넣지 마라. 이유: 잠금 화면·화면 공유로 노출된다(design §7 S7).
- 음성 질문(마이크)을 만들지 마라. 이유: PRD §3-8 첫 버전 제외.
- 화면에서 Node·fetch·Supabase를 쓰지 마라. 이유: 불변식 49.
