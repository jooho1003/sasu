# Step 14: 세션 종료·질문 보관 검증 (2026-10-02)

원천: PRD §3-8 DC-04·10·11 → ARCHITECTURE §6-12 → ADR-082 → 기존 desktop-companion plan/design §6·7·11.5 → `phases/43-desktop-companion/step14.md`. 새 제품 범위·서버 계약·운영 설정은 만들지 않았다.

## 구현과 확인 관계

- 설정/트레이 `AuthService.signOut()`와 API 현재 세대 401 → `clearLocalState()` → main 공통 종료 콜백. 연결 상태·알림 비교 기준·핀·펫을 초기화하고 panel에 `signed-out`을 보낸다.
- renderer `App`이 세션별 하위 화면을 다시 마운트한다. 답·카드·기록·공지·설정·업로드 화면의 상태를 새 인스턴스로 만들고 이전 화면의 늦은 콜백이 새 상태를 채우지 못하게 한다.
- API는 요청 시작 세대를 기록하고 세션 종료/로그인 전환에 요청을 abort한다. fetch가 취소를 무시해도 이전 성공·401·응답 본문을 폐기한다. 현재 세대 401은 부서 연결 대기에도 종료한다.
- OTP의 늦은 완료도 종료 세대를 확인하고 새로 남은 credential을 다시 삭제한다. 종료 중/실패한 삭제가 남아 있으면 다음 OTP 전에 삭제를 확인한다. 삭제 실패를 숨기고 다음 사용자에게 보관 질문을 넘기지 않는다.
- Outbox의 작업 큐(send/flush/count)와 파일 큐(write/remove)를 분리했다. 같은 질문의 동시 flush·질문 덮어쓰기를 막고, 전송 중 종료하면 파일 재생성을 차단한다. 401 callback에서 remove를 기다려도 작업 큐와 교착하지 않는다.
- 동일 timestamp에는 저장 배열 순서를 유지한다. network·timeout·5xx만 보관하며 invalid_response·4xx는 재시도하지 않는다. 기존 20건·24시간·429 계약을 유지한다.
- `settings:set`도 종료 세대를 대조해 늦은 저장이 기본 펫/핀을 다시 바꾸지 못하게 한다. IPC 이름·입력 권한은 기존 계약을 유지한다.

## TDD·검수 보완 기록

첫 실행: Outbox/API 회귀 21개 중 11개 실패·10개 통과. 동시 offline 질문 소실, 동일 보관 질문 3회 POST, invalid_response 503 보관과 새 종료 API 미구현을 확인했다. 구현 뒤 해당 21개 통과.

추가 빨강→초록: 공통 종료 2개, 늦은 OTP 취소 1개, 동일 timestamp 역순 ID 1개, 늦은 설정 재방송 1개, 삭제 실패 후 로그인 차단 1개. 트레이는 실제 `createTray`의 메뉴 callback 단위로 확인했다.

bkit gap-detector의 읽기 전용 검토가 OTP/연결 대기 401, 동률 FIFO, 늦은 설정 반영을 지적했다. 모두 보완하고 재대조에서 추가 차이가 없었다. 최종 판정은 주 세션의 코드·실행 기록 검토다.

## 실행 결과

| 명령/대상 | 결과 | 원시 로그 |
|---|---|---|
| desktop test | 12파일·76/76 통과 | `.vercel/desktop-session-unit.log` |
| desktop lint | tsc·ESLint 통과 | `.vercel/desktop-session-lint.log` |
| desktop build | Electron E2E beforeAll에서 실제 실행·통과 | `.vercel/desktop-session-outbox-e2e.log` |
| 합성 Electron | 7/7 통과(1.3분). 연결 대기 401 포함 | `.vercel/desktop-session-outbox-e2e.log` |
| root test | 183파일·1,834/1,834 통과 | `.vercel/desktop-session-root-test.log` |
| root lint | 통과. 기존 ESLint 경고 2·wording 경고 84, blocking 0 | `.vercel/desktop-session-root-lint.log` |
| root build | Next 16.3.4 빌드·49/49 정적 페이지 통과 | `.vercel/desktop-session-root-build.log` |
| git diff --check | 통과. 기존 LF→CRLF 안내만 있음 | 세션 도구 실행 기록 |

Electron은 실제 Electron main/preload/renderer·safeStorage·Supabase SDK를 사용하고 서버 응답만 로컬 합성 HTTP로 제공한다. 실제 DB/RLS·SMTP·모델 호출 검증으로 표시하지 않는다. 실제 OS 트레이 메뉴 클릭도 이번에 수행하지 않았다.

리포에 보존한 원시 실행 출력: [desktop 단위](session-unit.txt)·[Electron·build](session-electron.txt). 루트 출력은 위 `.vercel` 경로에 있다.

확인 사례: 설정 로그아웃과 inbox 401 → 세션/보관/설정 파일 삭제 → 리로드 없이 다른 JWT 사용자로 코드 로그인/부서 연결 → 이전 거절 답·질문 기록·펫/핀/읽음 상태 없음. 동시 offline 2건 암호화 보존, 종료 삭제, invalid_response POST 1회·보관 0건. 기존 step13의 읽음·위치·IPC 제한·폴링·hostname 3건도 함께 회귀했다.

초기 Electron 실패 두 종류는 테스트 배선에서 보완했다: preload `ask.send`에 객체 대신 정의된 문자열 인자를 사용; renderer가 첫 화면을 그린 직후에는 창 sender 등록이 끝나지 않을 수 있어 `app.info`의 실제 IPC 성공을 기다린 후 구동. 고객 데이터나 운영 설정은 사용하지 않았다.

[설정 종료 화면](screenshots/desktop-session-logout.png)·[401 종료 화면](screenshots/desktop-session-401.png). 설정 종료 캡처를 이미지로 열어 빈 이메일 로그인 화면과 이전 질문/안내 없음도 확인했다.

## Graft·Archify

Graft 변경 전 실행: `node D:/바이브코딩/.sasu-graft-20260923/tool/node_modules/@nanonets/graft/dist/cli.js --version`가 `ERR_DLOPEN_FAILED`(tree-sitter-kotlin Win32 binding)로 실패했다. 새 변경 전후 그래프는 미확보이며, 위 구현 관계는 실제 import/호출을 수동으로 대조한 결과다. 이전 step의 Graft 산출물을 새 그래프로 재사용하지 않았다.

Archify 3.0.1 실행:

```powershell
node .vercel/desktop-core-archify/archify/bin/archify.mjs deliver architecture docs/verification/43-desktop-companion/desktop-session-flow.json .vercel/desktop-session-flow.html --json
node .vercel/desktop-core-archify/archify/bin/archify.mjs browser-check .vercel/desktop-session-flow.html --json --out-dir .vercel/desktop-session-archify
```

[흐름 명세](desktop-session-flow.json)·[delivery receipt](desktop-session-flow.delivery.json)·[자동 브라우저 receipt](desktop-session-flow.browser-check.json). deliver ok=true·9/9·오류/경고 0, browser-check ok=true·4개 viewport(1440×900,1600×1000,1920×1080,2048×1320)·진단 0·overflow 없음. 사람 시각 리뷰는 실행하지 않았다. HTML은 `.vercel/desktop-session-flow.html`에 있다. 이 검사는 서비스 E2E와 별도다.

## 유지되는 게이트

step12의 깨끗한 Windows 5분 설치 녹화·게시된 자동 업데이트 1회, 운영 auth.sessions 권한/0069/SMTP/메일/배포 저장소는 대기 중이다. 새 설치 파일 게시·운영 DB/Auth·배포는 수행하지 않았다. 전체 phase blocked, 마지막 전체 정적 일치율 93.6%·계획 7/9를 유지한다.
