# 데스크톱 후속 기능 반영 — 2026-10-04

사용자 요청: 테스트·반영할 항목을 반영하고 다음 step을 서브에이전트로 계속 실행·확인한다. 기존 메일/DNS/Resend SMTP 보류는 유지한다.

## 반영 범위와 진행 상태

PR #30(질문 이력) → #33(최근 맡긴 작업) → #34(결정함) → #35(영업 검토)를 검증하고 main에 순서대로 병합했다. main `81f10a9`를 릴리스 브랜치에 병합해 기존 CSP 운영 변경을 유지했다. Windows 설치 파일에 반영할 자료 업로드 보완은 phase 48의 기존 DC-09 복구 설계·별도 red/green을 따른다.

설계: [기존 동반 앱](../../02-design/features/desktop-companion.design.md), [질문](../../02-design/features/desktop-question-followup.design.md), [최근 작업](../../02-design/features/desktop-recent-work.design.md), [결정함](../../02-design/features/desktop-decision-flow.design.md), [영업](../../02-design/features/desktop-sales-flow.design.md), [자료 업로드](../../02-design/features/desktop-upload-recovery.design.md).

2026-10-05에 공개 Windows 0.1.2를 게시했고, 현재 PC에서 0.1.1→0.1.2 실제 업데이트·재로그인 없는 세션 복원·로그아웃 파일 삭제를 확인했다. 결과는 아래 [패키지·공개 게시·업데이트](#패키지공개-게시업데이트) 절에 있다.

## 실행 검증

| 실행 | 결과 |
|---|---|
| 루트 lint | exit 0, ESLint 경고 2·문구 경고 84·blocking 0 |
| 루트 기본 Turbopack production build | exit 0, 컴파일·타입 검사·49개 정적 페이지 생성 |
| 루트 Vitest | 183 files / 1,834 PASS, exit 0 |
| 현재 CSP 대상 단위 | 7 PASS, exit 0 |
| isolated PGlite SQL | 316 PASS / failed 0, 권한 조합 2,016. pg_cron/pg_net의 0004는 제외 |
| 운영 guest Playwright | 5 PASS, exit 0. 1440/390px·실제 부서 접근 차단·잘못된 서명 거부·열람 전후 AI 호출/DB 행 증가 0 |
| desktop 단위 | 12 files / 78 PASS, lint/build exit 0 |
| phase 44~47 Electron 회귀 | 최초 39 PASS·준비/클릭 시간 초과 2건, 해당 2개 재검증 PASS. 고유 41개를 실행 간 검증 |
| 실제 development React/StrictMode | 영업 자료 시작 회귀 6 PASS. 위 production 41개와 합산하지 않음 |
| phase 48 자료 업로드 | production Electron 14 PASS, 실제 development React/StrictMode 3 PASS. desktop lint/build exit 0·단위 78 PASS. 실패·TLS 준비·클릭 시간 초과는 별도 기록 보존 |

[데스크톱 통합 상세·실패 기록](../44-desktop-question-followup/continuation-2026-10-04.md). 첫 두 시간 초과를 최초 전체 실행 성공으로 바꾸지 않는다. 가용 메모리 약 398MB 당시 발생했고, 부하가 줄어든 재검증에서 통과했다. 테스트 준비 대기만 5→30초로 맞췄으며 동작 assertion·클릭 제한은 유지했다.

루트 검증의 원시 기록은 이 디렉터리의 `root-{lint,build,test,csp-test}.txt`, `sql.txt`, `production-guest.txt`에 보존한다. [자료 업로드 검증](../48-desktop-upload-recovery/verification.md)은 별도 red/green·실제 개발 모드·오류 처리와 한계를 기록한다. 서버/API/DB/LLM 변경과 새 migration은 없다.

## 초기 설치 앱 확인

현재 PC의 실제 0.1.1 설치 앱에서 운영 QA 계정의 일회용 6자리 코드 인증 → 동의 부서 기기 연결 → 일반 Bearer inbox 요청을 확인했다. session.bin에 이메일/access_token 평문이 없음을 확인했다. 질문·모델 호출·이메일 발송은 하지 않았다. Auth Admin은 QA 코드 생성에만 썼고 앱의 인증/기기 요청은 기존 main/preload/SDK 경로를 사용했다.

업데이트 검증은 동일 격리 프로필의 세션만 사용하며 재로그인 fallback이 없다. [도구 준비와 실행 방법](tooling.md).

## 패키지·공개 게시·업데이트

2026-10-05 실행. 원시 receipt·스크린샷은 [package/](package/)에 있다. ignored `.vercel/` 원본 run 디렉터리는 보존했다.

| 단계 | 결과 |
|---|---|
| 소스 | 릴리스 브랜치 HEAD `b0d3ebf`(origin `release/desktop-0.1.2-20261004`). 전용 `.vercel/desktop-release-012-source`의 47개 파일(제품 소스 39·설정/리소스 6·alias 2)이 HEAD 작업 트리와 SHA-256 전부 일치, 누락·추가 0. version 0.1.2 |
| 운영 빌드 | `production-build.mjs` → `electron-vite build`·`electron-builder --win --publish never` exit 0. 자식 환경은 OS 변수와 운영 앱 URL·Supabase 공개 URL/anon key만. [build.txt](package/build.txt) |
| ASAR 감사 | [audit.json](package/audit.json): 운영 URL·공개 키만, 비공개 파일 0, 현재 환경 비밀값 일치 0, QA marker 0(코드 5개 검사), Supabase 하위 SDK·builder-util-runtime 존재, 개발용 advisory 패키지 `http-cache-semantics` 미포함, feed `jooho1003/sasu-desktop-releases`, latest.yml의 size·SHA-512 일치 |
| 설치 파일 | `sasu-desktop-setup-0.1.2.exe` 114,138,285 bytes, SHA-256 `0f868c18…6deb`, blockmap SHA-256 `5ca815af…0966`, ASAR SHA-256 `cb2f5d4f…be7b` |
| 패키지 실행 | [packaged-smoke.json](package/packaged-smoke.json): 새 프로필에서 packaged=true·0.1.2·safeStorage 사용 가능·로그인 화면·IPC 버전 일치. 인증·모델 호출 없음. [로그인 화면](package/packaged-login.png) |
| 공개 게시 | [v0.1.2](https://github.com/jooho1003/sasu-desktop-releases/releases/tag/v0.1.2) 2026-10-05T06:07:03Z, Latest·draft/prerelease 아님. 설치 파일·blockmap·latest.yml 3개만 게시. 공개 `releases/latest/download/`에서 다시 받은 3개 파일 SHA-256이 감사 staging 파일과 모두 일치 |
| 실제 업데이트 | [update-complete.json](package/update-complete.json): 설치된 0.1.1이 10/4 초기 인증 QA 프로필 세션만으로 시작(`initialSessionRestored`) → 0.1.2 발견·차등 다운로드(ready 06:09:51Z) → 종료 시 silent 설치 → 설치된 ASAR 0.1.2 → 새 실행 세션 복원(`reloginCalls: 0`, `restoredWithoutRelogin: true`) → 최신 feed 확인 → 로그아웃 완료 뒤 session/settings/outbox 파일 삭제. 질문 쓰기·모델 호출 0. 설치 후 `%LOCALAPPDATA%\Programs\사수\resources\app.asar` SHA-256이 감사 ASAR와 일치 |
| 화면 | [업데이트 준비(0.1.1)](package/installed-update-ready.png) · [업데이트 적용(0.1.2)](package/installed-update-applied.png). 같은 QA 부서 연결 상태에서 설정 탭 버전 표기만 0.1.1→0.1.2 |

### 실패·재실행 기록

- **감사 run01 실패(도구 결함):** `audit.mjs`가 ASAR 안의 중첩 파일을 `out/main/index.js`처럼 `/` 경로로 꺼내 `@electron/asar` 3.4.1이 Windows에서 찾지 못했다. ASAR 목록을 직접 대조해 `out/main`·`out/preload`·`out/renderer` 10개 항목이 설치본 0.1.1과 같은 구조로 들어 있음을 확인했다. 0.1.1 도구처럼 `join()`으로 경로를 만들도록 ignored 도구 두 줄만 고친 뒤 run02에서 통과했다. 빌드 산출물은 바꾸지 않았다.
- **패키지 실행 run01~03 실패(실행 환경):** 이 Claude Code 세션은 Windows 세션 0(비대화형 로그온)에서 돌아 DPAPI `CryptProtectData`가 "액세스가 거부되었습니다(0x5)"를 냈다. 샌드박스 해제 여부와 무관했고, 이미 동작이 확인된 설치본 0.1.1도 같은 방식으로 `app_start_failed`가 났다. 그래서 일회용 예약 작업(로그온 유형 Interactive, 제한 권한)으로 로그인된 데스크톱 세션 1에서 실행했고, 끝난 뒤 작업을 삭제했다.
- **패키지 실행 run04 실패:** 세션 1 첫 실행에서 `electron.launch` 45초 시간 초과, 프로필 비어 있음. 같은 인자를 진단 로그와 함께 다시 실행한 run05에서 앱 시작~app_ready 약 20초로 통과했다. run05 진단에서 예약 작업 인자의 한글 경로가 정상 전달됨(`exists=True`)을 확인했다. 첫 실행의 시간 초과를 통과로 바꾸지 않는다.
- **업데이트 run01 실패:** 게시 약 1분 뒤 0.1.1의 GitHub feed 확인이 `latest version: 0.1.1`로 응답해 `published_update_not_available`로 끝났다([receipt](package/update-run01-failure.json)). 직후 `releases.atom`에 v0.1.2가 보이는 것을 확인하고 같은 프로필로 run02를 실행해 통과했다. run01은 로그아웃 전에 끝나 `session.bin`이 남아 있었고, run02의 0.1.1 시작도 재로그인 없이 세션을 복원했다.
- 실행 로그의 앱 이벤트([runtime-events.txt](package/runtime-events.txt)): `ipc_failed window_forbidden`(`update:get`)은 0.1.1과 0.1.2 시작 때 모두 1회 나타난다(기존 동작, 이번 변경 아님). `inbox_poll_failed ApiError` 1회는 로그아웃 처리 시점(06:10:20Z)에 진행 중이던 조회다. 둘 다 이번 판정을 바꾸지 않는다. `window_forbidden`의 원인은 `desktop/src/renderer/src/App.tsx`의 업데이트 상태 effect가 펫 창(`#pet`)에서도 `update.get()`을 호출하고, main의 `update:get`은 패널 창만 허용하기 때문이다. 렌더러가 오류를 무시하므로 사용자 영향은 없고 로그 잡음이다. 게시된 0.1.2 소스와 어긋나지 않도록 이번에는 고치지 않고 다음 릴리스에서 펫 창 조건을 추가한다.

## 남은 사람 게이트

phase 43 step 12의 실제 메일 수신·신규 Windows 계정 5분 전체 녹화는 별도다. 이번 0.1.2 확인은 기존 설치본 업데이트 경로이며 신규 설치 첫 실행·메일 코드 수신을 다시 검증하지 않았다. DNS/Resend SMTP는 사용자 보류다. 현재 PC 업데이트 검증으로 이 게이트를 완료 처리하지 않는다. Graft native binding 실패와 자동 그래프 미확보, 실제 고객 자료·음성 의미 정확도는 기능별 검증 기록의 한계를 따른다.
