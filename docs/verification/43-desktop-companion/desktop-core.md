# Step 8 — desktop-core 검증

- 실행일: 2026-10-02 KST
- 범위: `desktop/` Electron 본체·preload·순수 core. 화면 UI는 Step 9 범위다.
- 기준: `desktop-companion.design.md` §2.3·§5.2·§6·§7 S4~S7·S9·§9~§11.1
- 운영 영향: 없음. 운영 DB·Vercel 배포·외부 발신을 변경하지 않았다.

## 구현 결과

`desktop/`을 루트 Next.js 패키지와 분리한 private 패키지로 만들었다. 화면 프로세스에는 이름 있는 IPC 함수만 노출하고, 로그인 세션·Bearer 요청·Supabase Storage 업로드·끊김 질문 파일은 Electron 본체가 소유한다.

| 경계 | 결과 |
|---|---|
| 실행·빌드 | Electron Vite의 main/preload/renderer가 빈 화면까지 빌드·실행된다. preload는 sandbox에서 읽히는 CommonJS `index.js`로 출력한다. |
| 로그인 | Supabase OTP 요청·확인, 자동 토큰 갱신, 로컬 로그아웃을 본체에서 처리한다. 로그아웃은 기기 연결 해제 요청 뒤 세션·끊김 보관·설정을 지운다. |
| 서버 호출 | `SASU_APP_URL`의 같은 출처 `/api/companion/*`만 허용한다. 현재 access token을 Bearer로 넣고 15초 뒤 중단한다. 401은 로컬 상태를 지우고 화면에 `signed-out` 오류로 돌아간다. |
| 암호화 | `safeStorage.isEncryptionAvailable()`가 거짓이면 읽기·쓰기를 거부한다. 평문 대체 경로는 없다. 삭제는 암호화 기능 상태와 무관하게 ciphertext 파일을 지울 수 있다. |
| IPC | 명세의 19개 채널만 `ipcMain.handle`에 등록했다. 모든 입력은 Zod 또는 공용 `Companion*` 계약으로 좁힌다. `ipcRenderer`는 화면에 노출하지 않는다. |
| 업로드 | 받아쓴 글은 앱 API, 자료 검토함 원본·WAV 구간은 기기 세션 Supabase 클라이언트로 `review-materials/{dept}/{review}/…`에 올린다. 웹과 같은 순수 WAV 검사를 재사용한다. |
| 끊김 보관 | 질문만 암호화 파일에 최대 20건·24시간 보관한다. 오래된 순서로 보내며 성공·429 외 4xx는 제거하고, 네트워크·5xx·429는 유지한다. 결정·업로드는 보관하지 않는다. |
| 브라우저 경계 | 단일 인스턴스, `contextIsolation:true`, `sandbox:true`, `nodeIntegration:false`, `webSecurity:true`; 탐색·새 창·권한 요청을 거부한다. CSP는 `connect-src 'none'`이다. |
| 로그 | 이벤트 이름과 ID·길이·오류 코드·HTTP 상태만 허용한다. 질문·답·파일 내용·이메일·토큰을 받는 로거 인자는 없다. |

## 고정 버전

`desktop/package-lock.json`으로 아래 직접 의존성을 고정했다.

| 묶음 | 버전 |
|---|---|
| Electron / electron-vite | 44.5.1 / 5.0.0 |
| electron-builder / electron-updater | 26.15.3 / 6.8.9 |
| React / React DOM | 19.3.0 / 19.3.0 |
| Supabase JS / Zod | 2.117.2 / 4.6.5 |
| TypeScript / Vitest / ESLint | 6.0.3 / 5.0.3 / 10.11.0 |

`npm ci`에서 Electron 설치 스크립트가 npm 11의 스크립트 허용 정책 아래 재현되도록 `allowScripts`와 `postinstall`을 명시했다. 설치 결과 438개 패키지, 알려진 취약점 0건이다. 설치 중 Electron Builder의 전이 의존성 4개에 폐기 경고가 있었지만 설치·감사·빌드는 통과했다.

## 테스트 우선 기록

1. `desktop/src/main/core/__tests__/`와 `desktop/src/shared/__tests__/`를 먼저 만들고, 모듈이 없는 상태에서 실패를 확인했다.
2. pet 우선순위, inbox·답 폴링, 끊김 보관 20건·24시간·응답별 유지/제거, 공용 서버 응답 파서를 구현했다.
3. 만료 항목이 일부만 남을 때 저장 파일도 정리되는 회귀 검사를 추가한 뒤 통과시켰다.

최종 결과: 테스트 파일 4개, 단위 테스트 20개 통과.

## 실제 Electron 로컬 QA

운영 계정이나 운영 DB가 아닌 `.vercel/review-qa`의 합성 조직과 로컬 Next QA 서버를 사용했다. 코드 값·이메일·JWT는 기록하지 않았다.

1. Electron을 실제 실행하고 DevTools Protocol로 preload가 공개한 `window.sasu` 함수만 호출했다.
2. 로컬 Auth가 발급한 코드로 `auth.verifyCode` 성공.
3. `link.departments`가 합성 DB의 49개 연결 가능 부서를 반환.
4. 동의된 부서 하나로 `link.create` 성공.
5. `inbox.get`이 서버 시각을 포함한 받은 일을 반환했고 `outbox_count`는 0.
6. 잘못된 `link:create` 입력은 `invalid_input`으로 거부됐다.
7. `session.bin`은 2,109바이트 ciphertext였다. 이메일·`access_token`·`refresh_token`·JWT 접두사 평문 일치가 모두 0건이었다.

이 확인은 로컬 합성 환경의 앱→preload→IPC→Bearer API 흐름 증거다. 깨끗한 Windows 설치·자동 업데이트·알림은 Step 10 범위이며, 운영 개통 증거로 보지 않는다.

## 구조·의존 관계 확인

Graft 0.21.1을 격리된 Node 22 컨테이너에서 실행했다. 770개 파일에서 3,517개 노드·8,798개 관계를 만들었고 `graph check: OK`였다. `registerIpc`, `ApiClient`, `OutboxService`가 모두 `desktop/src/main/index.ts`의 `start()`에서 조립되는 것을 확인했다. 세 조회의 절감 표시는 합계 약 6,543 tokens다.

Archify 3.0.1(공식 저장소 commit `d5a1333`)로 화면 격리 경계와 Electron 본체의 네트워크·암호화 소유 관계를 검토했다.

- [구조 명세](desktop-core-flow.json) · [delivery 영수증](desktop-core-flow.delivery.json) · [브라우저 영수증](desktop-core-flow.visual-check.json)
- specification SHA-256: `02b9b9d4e5a9f4e5533e20beb1826879fc6bfdab9e48f22b0d376aa3479f1c04`
- artifact SHA-256: `5b608c95eb20bcbccbc9e7d84b9a42a8193485ed9d5ec5fc44533b5647083009`
- showcase 9/9, 오류 0, 경고 0
- 실제 Chrome 자동 검사: 1440×900·1600×1000·1920×1080·2048×1320과 라이트/다크 상태에서 가로·세로 넘침 0, 가독성·뷰어 경계 통과
- 1440×900 라이트 캡처를 직접 확인했다. 노드·경계·화살표·라벨 잘림은 없었다.

재현 가능한 HTML과 캡처는 로컬 검토 산출물이라 커밋하지 않았고, 입력 명세와 SHA-256이 묶인 두 영수증만 보존했다.

전체 `desktop-companion` 기능의 `/pdca analyze`는 화면·설치까지 끝나는 Step 10 뒤에 수행한다. 이번 Step 8은 설계 S4~S7·S9와 직접 대조했다.

## Acceptance Criteria

| 명령 | 결과 |
|---|---|
| `npm --prefix desktop ci` | PASS · 438 packages · vulnerabilities 0 |
| `npm --prefix desktop run lint` | PASS · TypeScript + ESLint 오류 0 |
| `npm --prefix desktop test` | PASS · 4 files / 20 tests |
| `npm --prefix desktop run build` | PASS · main 32.78kB, preload 1.65kB, renderer 생성 |
| `npm run lint` | PASS · 오류 0. 기존 Step 3 E2E 파일의 미사용 인자 경고 2건과 차단하지 않는 문구 경고 82건은 유지 |
| `npm run build` | PASS · Next.js 16.3.4 production build, 48개 정적 페이지 생성 |
| `npm run test` | PASS · 183 files / 1,834 tests |
| `git diff --check` | PASS |
| 금지 패턴 `git grep` | PASS · 출력 0줄 |

정적 보안 확인은 `nodeIntegration:true`, `contextIsolation:false`, `sandbox:false`, `dangerouslySetInnerHTML`, `exposeInMainWorld(...ipcRenderer)`를 대상으로 했다. 공개 빌드 상수는 `SASU_APP_URL`·`SUPABASE_URL`·`SUPABASE_ANON_KEY` 세 개뿐이며 service role·게시 토큰·외부 비밀값은 `desktop/`에 없다.
