# Windows 0.1.2 릴리스 검증 도구 준비

2026-10-04 · 도구 준비 단계. 제품 코드 검증·운영 게시·설치·업데이트를 실행한 기록이 아니다.

도구는 ignored `.vercel/desktop-release-012-tools/`에 있다. 이전 0.1.0/0.1.1 도구와 receipts는 수정하지 않았다. root의 최종 소스 검증 신호 전에는 빌드·자산 staging·게시·설치를 하지 않는다. 0.1.2 소스에는 최종 확인된 phase 44~48이 포함되어야 한다.

## 도구와 실행 순서

각 출력 디렉터리는 `.vercel/` 아래 **존재하지 않는 새 경로**여야 한다. 이미 있는 경로는 거절하여 receipts를 덮어쓰지 않는다. 아래 이름은 예시이며 재실행에는 새 이름을 쓴다. 이 PC에서 확인된 실제 환경 로딩은 `--env-file=.env --env-file=.env.local`이다. 파일은 리포에 커밋하지 않으며 값은 출력하지 않는다. `.vercel/.env.production.local`의 service role 항목에는 `[SENSITIVE]` placeholder가 있으므로 초기 QA 인증에 사용하지 않는다.

1. 최종 검증된 소스를 전용 `.vercel/desktop-release-012-source/desktop`에 준비하고 의존성을 설치한 뒤 운영용 빌드한다. package version은 root가 0.1.2로 준비한다.

```powershell
node --env-file=.env --env-file=.env.local .vercel/desktop-release-012-tools/production-build.mjs .vercel/desktop-release-012-source/desktop
```

build/dist 자식 프로세스에는 OS 실행 환경과 운영 앱 URL·Supabase 공개 URL/anon key만 전달한다. 서버 비밀값·development/QA override를 전달하지 않는다. dist는 기존 `--publish never` 스크립트를 사용한다.

2. ASAR·공개 설정·비공개 파일/현재 환경 비밀값·SDK 하위 의존성·GitHub feed·manifest size/SHA-512와 설치 파일/블록맵/ASAR SHA-256을 검사한다. root가 최종 소스를 검증한 뒤에만 `--stage`를 붙인다.

```powershell
node --env-file=.env --env-file=.env.local .vercel/desktop-release-012-tools/audit.mjs .vercel/desktop-release-012-source/desktop/release .vercel/desktop012-audit-run01 --stage
node .vercel/desktop-release-012-tools/packaged-smoke.mjs '.vercel/desktop-release-012-source/desktop/release/win-unpacked/사수.exe' .vercel/desktop012-smoke-run01
```

staging 산출물은 해당 audit run의 `assets/`다. packaged smoke는 새 프로필로 packaged=true·0.1.2·safeStorage·로그인 화면·IPC를 검사한다. 인증/모델 호출은 없다.

3. **0.1.2 게시 전에** 설치된 0.1.1의 별도 QA 프로필에 초기 인증을 준비한다. Auth Admin은 기존 QA lead의 일회용 6자리 코드를 만들고 앱의 일반 SDK/IPC로 인증·부서 연결한다. 메일·질문·모델 호출은 하지 않는다. 이 단계의 기기 연결은 운영 쓰기이므로 root의 실행 신호 뒤에 한다.

```powershell
node --env-file=.env --env-file=.env.local .vercel/desktop-release-012-tools/initial-qa-login.mjs "$env:LOCALAPPDATA\Programs\사수\사수.exe" .vercel/desktop012-initial-login-run01
```

환경 파일에 공개 Supabase 값과 `SEED_QA_LEAD_EMAIL`·`SUPABASE_SERVICE_ROLE_KEY`가 필요하다. 비밀값은 Electron 자식에 전달하지 않는다. 초기 인증 receipts는 이메일·코드·기기/부서 ID를 출력하지 않는다. 이 초기 로그인 결과를 업데이트 세션 복원의 근거로 대신 쓰지 않는다.

4. root가 공개 0.1.2 설치 파일·manifest 게시를 확인한 뒤 **같은 QA 프로필**로 실제 업데이트한다.

```powershell
node .vercel/desktop-release-012-tools/update-flow.mjs "$env:LOCALAPPDATA\Programs\사수\사수.exe" .vercel/desktop012-initial-login-run01/profile .vercel/desktop012-update-run01
```

update-flow에는 로그인/Auth Admin fallback이 없다. 0.1.1 시작과 업데이트 뒤 0.1.2 시작 모두 기존 세션만으로 질문 화면·inbox를 확인해야 한다. 로그인 화면이 나오면 실패한다. 공개 업데이트 다운로드→앱 종료→설치된 ASAR 버전 변화→새 앱 세션 복원→최신 feed→로그아웃 완료 Promise→session/settings/outbox 파일 삭제를 확인한다. `reloginCalls: 0`과 `restoredWithoutRelogin: true`를 별도 기록한다. 실행 중 실패는 redacted failure receipt에 남긴다.

## 준비 단계 검증과 한계

새 `.mjs` 6개 모두 `node --check`를 통과했고 common 모듈 import 및 자식 환경에 비밀/QA override가 없음을 확인했다. 이 준비 검사는 패키지 빌드·설치·운영 인증·업데이트의 성공을 증명하지 않는다. ASAR 비밀값 검사는 실행 당시 환경에 제공된 비밀값과 root 비공개 파일 경로를 대상으로 한다. 알 수 없는 모든 비밀값을 탐지했다는 뜻은 아니다.

root는 실제 `.env`+`.env.local`로 초기 QA 인증을 실행해 `.vercel/desktop-012-initial-verified-20261004/initial-qa-login.json`에 성공을 기록했다. 같은 디렉터리의 `profile/`이 이후 업데이트 검증 대상이다. 앞선 마스킹된 운영 환경 파일의 401은 `[SENSITIVE]` placeholder를 인증 키로 사용한 설정 준비 실패이며 제품 인증 결함으로 계산하지 않는다. 초기 인증과 업데이트 뒤 세션 복원은 별도 기록으로 유지한다.

전용 `.vercel/desktop-release-012-source/desktop` 디렉터리에 당시 0.1.1의 package.json/package-lock.json만 복사하고 `npm ci`를 실행했다(exit 0). node_modules는 junction/symlink가 아닌 실제 디렉터리다. Electron 실행 파일과 Supabase SDK 하위 패키지·electron-updater·electron-builder·electron-vite 존재를 확인했다. 소스/alias 파일 복사·0.1.2 버전 반영·빌드·staging은 하지 않았다. 설치 원시 로그는 ignored `.vercel/desktop-release-012-dependencies.txt`에 있다.

설치의 npm audit은 기존 lock의 개발 전이 의존성 `http-cache-semantics@4.2.0`에서 high 1건을 보고했다(max-stale 처리의 사용자 간 캐시 응답 노출). 읽기 전용 `npm audit --json`과 `npm explain`으로 `dev: true`, 직접 소비자 `cacheable-request`를 확인했다. 자동 수정·의존성 변경은 하지 않았다. 패키지 런타임 포함 여부와 릴리스 판단은 최종 ASAR 감사에서 별도로 확인한다. 원시 로그는 ignored `.vercel/desktop-release-012-dependency-audit.json`·`desktop-release-012-dependency-chain.json`이다.

새 run/profile은 보존하고 재귀 삭제하지 않는다. 코드 로그인은 메일 수신 검증이 아니며 SMTP/DNS 보류와 신규 Windows 계정의 5분 전체 녹화 게이트는 유지한다.
