# Desktop companion Step 9 — desktop UI

- 실행일: 2026-10-02
- 환경: 로컬 `.vercel/review-qa` 합성 데이터와 `http://127.0.0.1:3011` (운영 DB·외부 발송 미사용)

## 결과

- 로그인 전 받은 일 폴링이 401로 세션 정리와 경합하던 문제를 막았다. 로그인 전에는 폴링을 건너뛴다.
- 코드 로그인·부서 선택 뒤 질문, 결정함, 기록, 일 맡기기, 설정 탭을 실제 Electron 창에서 열었다.
- 기록의 합성 답은 본문과 원문 근거를 함께 표시했고, 근거가 없는 본문을 표시하는 경로는 만들지 않았다.
- 합성 카드의 결정 버튼을 연속 실행한 뒤 `decisions.request_id` 기준 SQL 결과는 1건이었다.
- 펫 상태 5종 스크린샷은 `screenshots/desktop-ui-pet-*.png`에 남겼다.

## 실행 기록

| 명령 | 결과 |
|---|---|
| `node scripts/review-qa.mjs setup` | PASS — 로컬 합성 QA 준비 |
| `SASU_DESKTOP_E2E=1 npm --prefix desktop run e2e` | PASS — 펫 상태 5종, 탭 5개, 코드 로그인 → 부서 선택 → 답 본문·근거 → 카드 연타·SQL 1건 |
| `git grep -n "dangerouslySetInnerHTML\|fetch(\|createClient(" -- desktop/src/renderer` | PASS — 출력 0줄 |
| `npm --prefix desktop run lint` · `test` · `build` | PASS |
| `npm run check:wording` · `lint` · `build` · `test` | PASS |

E2E 출력: `e2e code login and department selection completed`, `e2e answer body and citation displayed`, `e2e decisions 1`.
