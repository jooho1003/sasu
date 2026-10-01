# Desktop companion Step 9 — desktop UI

- 실행일: 2026-10-02
- 범위: `desktop-companion.design.md` §5~§7의 펫·패널·트레이·바로가기 키와 5개 탭
- 환경: 로컬 `.vercel/review-qa` 합성 데이터, `http://localhost:3011` (운영 DB·외부 발송 미사용)

## 구현 확인

- 펫 창은 128×128 투명 창이며 작업 표시줄에 표시하지 않고, 패널은 380×560 고정 크기로 펫 옆에 열립니다.
- 본체 프로세스만 창 이동·트레이·전역 바로가기 키·알림·받은 일 폴링을 처리합니다. 알림은 답·카드·실패의 고정 문구와 카드 수만 사용합니다.
- 화면은 preload의 이름 있는 IPC만 사용합니다. renderer의 `fetch`, Supabase 클라이언트, HTML 직접 삽입은 없습니다.
- 답과 카드의 본문은 원문 근거가 한 건 이상 있을 때만 표시합니다.

## 실행 기록

| 명령 | 결과 |
|---|---|
| `node scripts/review-qa.mjs setup` | PASS — 로컬 합성 QA 준비 |
| `npm --prefix desktop run lint` | PASS |
| `npm --prefix desktop test` | PASS — 4 files, 20 tests |
| QA 환경 변수로 `npm --prefix desktop run build` | PASS |
| `SASU_DESKTOP_E2E=1 npm --prefix desktop run e2e` | PASS — Playwright `_electron`이 펫·패널 두 창과 패널 제목을 확인 |
| `git grep -n "dangerouslySetInnerHTML\|fetch(\|createClient(" -- desktop/src/renderer` | PASS — 출력 0줄 |
| `npm run check:wording` | PASS — renderer 차단 위반 0건 (기존 프로젝트 경고는 별도) |

E2E의 OTP·부서 연결·시드 답변·카드 연타 저장은 Step 8의 로컬 Electron/API 실행 기록과 Step 10의 릴리스 검증에서 이어서 실제 실행한다. 이번 단계에서는 창과 renderer 경계 및 합성 QA 창 기동을 검증했다.
