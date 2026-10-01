# Step 8: desktop-core

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-03·DC-04·DC-08·DC-11, §4 "데스크톱 앱" 행
- `docs/ARCHITECTURE.md` §6 불변식 9, §6-11 불변식 45~49, §8(desktop 두 행)
- `docs/ADR.md` ADR-081 결정 2·3·6·7·10
- `docs/02-design/features/desktop-companion.design.md` §2.3·§5.2·§6·§7(S4~S7·S9)·§9·§10·§11.1
- step 0 산출물: `scripts/hooks/tdd-guard.sh`(desktop 허용 목록), 루트 `tsconfig.json`·`eslint.config.mjs` 제외 설정
- step 2·6 산출물: `lib/contracts.ts`의 `Companion*` 스키마, `app/api/companion/**`의 경로 목록과 응답
- `lib/adapters/review-audio.ts`(앱 화면이 공유할 순수 모듈)

## 작업

`desktop/`에 Electron 앱의 본체(main)·preload·순수 core를 만든다. 화면 UI는 step 9다. 이 step 끝에는 빈 화면이라도 실행되고, 로그인·연결·API 호출이 IPC로 동작해야 한다.

1. 패키지 — `desktop/package.json`(루트와 분리, `private: true`): `electron`, `electron-vite`, `electron-builder`, `electron-updater`, `react`, `react-dom`, `@supabase/supabase-js`, `zod`, `typescript`, `vitest`. 실행 시점의 안정 버전을 쓰고 `desktop/package-lock.json`을 커밋한다. 스크립트: `dev`·`build`·`lint`(`tsc --noEmit` + 최소 ESLint)·`test`(`vitest run`)·`dist`(`electron-builder --win --publish never`). `desktop/.gitignore`에 `out/`·`release/`·`node_modules/`.
2. `desktop/electron.vite.config.ts` — 별칭 `@sasu/contracts` → `../lib/contracts.ts`, `@sasu/review-audio` → `../lib/adapters/review-audio.ts`. 빌드 상수 `SASU_APP_URL`·`SUPABASE_URL`·`SUPABASE_ANON_KEY`(공개값)만 주입한다.
3. 순수 core(테스트 먼저, `desktop/src/main/core/__tests__/`):
   ```ts
   // pet-state.ts — design §5.2 우선순위: 확인 필요 > 실패 > 완료 > 진행 중 > 쉬는 중
   export function computePetState(inbox: CompanionInbox, seen: SeenSet, outboxCount: number): PetState;
   // poller.ts — 상태 요약 30초, 오류 시 60→120→300초, 성공하면 30초로 복귀, 화면 잠금 중 정지. 답 대기는 2초 간격 최대 120초
   export function nextInboxDelay(prevMs: number, outcome: "ok"|"error"|"locked"): number;
   export function answerPollPlan(startedAt: number, now: number): { next: number|null };
   // outbox.ts — 최대 20건(21번째 거부), 24시간 지난 항목 삭제, 순서대로 전송, 성공·4xx(429 제외)면 제거, 네트워크·5xx·429면 유지
   export function addToOutbox(items: OutboxItem[], item: OutboxItem, now: number): { items: OutboxItem[]; accepted: boolean };
   export function nextToSend(items: OutboxItem[], now: number): OutboxItem | null;
   export function applySendResult(items: OutboxItem[], id: string, result: SendResult): OutboxItem[];
   ```
   `desktop/src/shared/contracts.ts`(+`__tests__`): `@sasu/contracts`의 `Companion*` 스키마로 서버 응답을 파싱하는 함수.
4. 본체 어댑터(`desktop/src/main/`):
   - `storage/encrypted-file.ts`: `safeStorage`로 암호화한 파일 읽기·쓰기. `safeStorage.isEncryptionAvailable()`가 false면 저장을 거부하고 오류를 낸다 — **평문 대체 저장 금지**.
   - `auth/supabase.ts`: supabase-js 클라이언트(storage = 암호화 파일 어댑터, `persistSession`·`autoRefreshToken` true, `detectSessionInUrl` false). `requestCode(email)` = `signInWithOtp({email, options:{shouldCreateUser:false}})`, `verifyCode(email, code)` = `verifyOtp({email, token: code, type:'email'})`, `signOut()` = `DELETE /api/companion/link` → `auth.signOut({scope:'local'})` → 암호화 파일·끊김 보관 삭제.
   - `api/client.ts`: `SASU_APP_URL` + 경로로 fetch, 현재 access token을 Bearer로, 시간 제한 15초. 401이면 `signed-out` 이벤트와 로컬 삭제. 응답은 `shared/contracts`로 파싱한다.
   - `api/storage-upload.ts`: 자료 검토함용 — 기기 세션의 supabase-js로 `review-materials`에 웹과 같은 경로 규칙(`components/reviewed-materials.tsx:124-158`)으로 업로드.
   - `ipc.ts`: 허용 채널만 등록하고 입력은 Zod로 검사 — `auth:requestCode`·`auth:verifyCode`·`link:departments`·`link:create`·`link:get`·`inbox:get`·`ask:send`·`answer:get`·`questions:list`·`card:get`·`card:decide`·`upload:transcript`·`upload:review`·`sales:sources`·`sales:start`·`sales:status`·`settings:get`·`settings:set`·`app:openWeb`(앱 출처의 https 경로만)·`auth:signOut`.
   - `index.ts`: 단일 인스턴스 잠금, `app.setAppUserModelId`, 모든 `BrowserWindow`는 `contextIsolation:true`·`sandbox:true`·`nodeIntegration:false`·`webSecurity:true`, `will-navigate` 차단, `setWindowOpenHandler` → deny, 권한 요청 전부 거부, 화면 CSP `default-src 'self'; connect-src 'none'; img-src 'self' data:`.
   - 로그: ID·길이·오류 코드만 남기는 작은 로거. 질문·답·파일 내용·이메일·토큰을 남기지 않는다.
5. `desktop/src/preload/index.ts` — `contextBridge.exposeInMainWorld('sasu', {...})`로 위 채널의 타입 있는 함수만 노출한다. `ipcRenderer` 자체를 노출하지 않는다.
6. 끊김 보관 저장: core `outbox` 규칙 + 암호화 파일. 다시 연결되면 순서대로 `ask:send`.
7. 결과는 `docs/verification/42-desktop-companion/desktop-core.md`(버전 목록·보안 설정 확인 결과).

## Acceptance Criteria

```powershell
npm --prefix desktop ci
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix desktop run build
npm run lint
npm run build
npm run test
git diff --check
```

- 정적 확인(출력 0줄): `git grep -n "nodeIntegration: *true\|contextIsolation: *false\|sandbox: *false\|dangerouslySetInnerHTML\|exposeInMainWorld(.*ipcRenderer" -- desktop/src`
- 로컬 QA 서버에 대해 앱을 실행해 코드 로그인 → 부서 연결 → `inbox:get` 성공까지 한 번 수동 확인하고 기록한다(코드는 step 0 방식으로 얻는다).

## 검증 절차

1. AC 실행.
2. 체크리스트: 토큰이 화면 프로세스로 넘어가지 않는가 · 평문 저장 경로가 없는가 · 로그에 원문이 없는가 · core에 테스트가 있는가.
3. `phases/42-desktop-companion/index.json` step 8을 갱신한다.

## 금지사항

- service role key·게시 토큰·비밀값을 `desktop/`에 넣지 마라. 이유: 설치 파일은 누구나 풀어볼 수 있다. 공개값 3개만 넣는다.
- 화면(renderer)에서 fetch·Supabase 클라이언트를 만들지 마라. 이유: 토큰은 본체만 가진다(불변식 49, CSP `connect-src 'none'`).
- `safeStorage`를 못 쓸 때 평문으로 저장하지 마라. 이유: 불변식 49.
- 결정·업로드를 끊김 보관에 넣지 마라. 이유: ADR-081 결정 7 — 질문만 보관한다.
- 루트 `package.json`에 Electron 의존성을 넣지 마라. 이유: Vercel 빌드에 섞인다.
