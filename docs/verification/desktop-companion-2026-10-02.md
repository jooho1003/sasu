# 데스크톱 동반 앱 — Step 11 실행 기록

실행일: 2026-10-02 KST

## 배포 설정과 산출물

- `desktop/electron-builder.yml` 확인: `appId: team.sasu.companion`, 제품명 `사수`, Windows NSIS 사용자별 설치와 바탕 화면·시작 메뉴 바로가기, `release/` 산출물, `jooho1003/sasu-desktop-releases`의 GitHub release 설정.
- `desktop/package.json` 확인: `dist`는 `electron-builder --win --publish never`만 실행한다.
- `desktop/src/main/updater.ts`: 패키지 빌드에서만 자동 확인·백그라운드 내려받기·종료 시 설치를 켜며, 사전 배포판은 받지 않고 로그에는 오류 코드만 남긴다. Electron ESM에서 CommonJS `electron-updater`를 읽지 못하던 시작 오류를 default import로 수정했다.
- `npm --prefix desktop run lint` — 통과.
- `npm --prefix desktop test -- --run src/main/api/__tests__/client.test.ts` — 2개 통과.
- `npm --prefix desktop run build` — 통과.
- `npm --prefix desktop run dist` — `desktop/release/사수 Setup 0.1.0.exe` 생성. 게시 없음. 산출물은 커밋하지 않는다.

## 실패: L3 로컬 Electron 전체 흐름

QA는 `node scripts/review-qa.mjs setup` 뒤 분리한 `node scripts/review-qa.mjs start`(PID 8988)에서 `http://127.0.0.1:3011` 응답을 확인하고 실행했다.

- 명령: `$env:SASU_DESKTOP_E2E='1'; npm --prefix desktop run e2e -- --grep '코드 로그인부터 근거'`
- 최초 원인: `electron-updater`의 named ESM import가 CommonJS 모듈에서 실패하여 Playwright 창 핸드셰이크가 시간 초과했다. default import 수정 뒤 `full-flow: electron-ready`까지 통과했다.
- 남은 실패: 로컬 QA의 Mailpit가 동작하지 않는 상태에서 테스트 전용 OTP를 `window.sasu.auth.verifyCode()`로 성공 처리해도, 다음 `link:departments`가 `401 session_invalid`로 실패했다. 암호화 세션 저장소 초기화·연결 전 폴러 경쟁을 막는 수정과 API 클라이언트의 비로그인 초기 조회 정리를 적용했지만 같은 결과가 세 번 이상 재현됐다.
- 따라서 카드 인용·결정 연타 1건·웹 해제 뒤 로그인 화면·재로그인·오프라인 질문 보관/복구/삭제 및 L4 시각 측정은 실행하지 않았다. 성공 근거가 없는 항목을 통과로 기록하지 않는다.

## L4 및 PRD §11 상태

- 새 담당 카드 → 펫 `확인 필요`·Windows 알림 60초 이내: **미측정** (L3 차단).
- 웹/앱 lead·member 인용 가시성 동일: `verify-companion-api.mjs`는 이 step에서 미실행 (L3 차단).
- 앱 userData·로그에서 테스트 질문 평문 0건: **미측정** (L3 차단).
- 해제 직후 다음 요청 401: **미측정** (L3 차단).

## 설계 §11.2 비교 목록

| # | 항목 | 근거 | 상태 |
|---|---|---|---|
| 1 | 0069 DB 표·RLS·RPC | step 1 `schema.md` | 이전 통과 |
| 2 | 하니스·SQL 사례 | step 1 `schema.md` | 이전 통과 |
| 3 | Bearer·기기 컨텍스트 모듈 | step 2 `auth.md` | 이전 통과 |
| 4 | 공용 lib·웹 회귀 | step 4~5 기록 | 이전 통과 |
| 5 | E01~E13 | step 6 `companion-routes.md` | 이전 통과 |
| 6 | E14~E16·W06 | step 7 `sales-review.md` | 이전 통과 |
| 7 | 웹 연결 기기 | step 3 기록 | 이전 통과 |
| 8 | 루트 설정 | step 0 기록 | 이전 통과 |
| 9 | 앱 본체 | step 8 `desktop-core.md` | 이전 통과 |
| 10 | 앱 core TDD | step 8 기록 | 이전 통과 |
| 11 | U01~U14 | step 9~10 기록 | 이전 통과 |
| 12 | 업데이트·설치 파일 | 이 문서의 배포 설정·dist | 부분 통과 (게시 없음) |
| 13 | L1~L4 실행 기록 | 이 문서 | 실패 — L3 OTP 세션 문제 |

## 사람·운영 항목 (실행하지 않음)

- 깨끗한 Windows 사용자 계정에서 설치 → 로그인 → 첫 답 5분 이내 화면 녹화.
- 배포 전용 공개 저장소 생성·첫 게시·자동 업데이트 1회 실제 적용.
- 운영 `auth.sessions` 삭제 권한 확인, migration 0069 적용, SMTP 전환, 6자리 코드 메일 템플릿.

## 정리

이 step에서 시작한 QA 서버 PID 8988와 Electron·Playwright 프로세스를 종료했다. 운영 DB·Supabase 설정·메일 템플릿·GitHub 게시 저장소는 변경하지 않았다.
