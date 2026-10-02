# Desktop fixes — Step 11

- 실행일: 2026-10-02 KST
- 범위: `desktop/` 앱 보완만. `app/`·`lib/`·`supabase/`는 변경하지 않았다.

## 결과

- 펫 클릭은 펫 창에서 보낸 `pet-toggle-panel`만 받아 패널을 연다. 로그인 전 첫 실행에서는 패널을 바로 표시한다.
- 실제 트레이 PNG를 번들 `extraResources`에 포함했고, 현재 펫 표시 상태에 맞춰 숨기기/보이기 메뉴 문구를 갱신한다.
- 카드·답·자료·영업 결과를 열면 최대 500개의 본 항목을 로컬 설정에 저장한다. 새 카드와 답/자료/영업의 완료·실패 전이를 이전 받은 일 요약과 비교해 내용 없는 고정 알림으로 표시한다.
- HTTP 429를 질문 보관함에서 즉시 제거하고 하루 한도 안내로 바꿨다. 네트워크·5xx·timeout만 보관한다.
- 펫 위치를 암호화 설정에 저장·복원하고, 화면 밖 위치는 기본 위치로 되돌린다. 시스템 또는 앱의 움직임 줄이기 설정이면 펫을 정지 그림으로 보인다.
- IPC는 펫 창에 이동·패널 토글·설정 읽기만 허용하고 나머지는 패널 창으로 제한했다. 앱 버전·기기 이름·단축키를 설정에 표시한다.

## 실행 기록

| 검증 | 결과 |
|---|---|
| `npm --prefix desktop run lint` | PASS |
| `npm --prefix desktop test` | PASS — 6 files, 27 tests |
| `npm --prefix desktop run build` | PASS |
| `SASU_DESKTOP_E2E=1 npm --prefix desktop run e2e` | PASS — 5 tests. 로그에 `e2e pet click -> panel visible` 기록 |
| `npm run check:wording` | PASS (기존 프로젝트 경고 출력, 차단 실패 없음) |
| `npm run lint` | PASS (기존 경고 2개, 오류 0) |
| `npm run test` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |
| `git grep -n "nativeImage.createEmpty\\|dangerouslySetInnerHTML" -- desktop/src` | 0 lines |
| `git grep -n "429" -- desktop/src/main/outbox-service.ts` | 0 lines |

## 화면 기록

- [펫 클릭 뒤 패널 표시](screenshots/desktop-pet-panel-visible.png)
- [설정 탭](screenshots/desktop-settings.png)
- [펫 상태 캡처](screenshots/desktop-ui-pet-needs_attention.png)

## 도구 기록

- Graft·Archify: 이 step은 데스크톱 앱 내부의 창·IPC·표시 보완만 바꾸며 서버 의존 관계나 실행 흐름 구조를 바꾸지 않아 실행하지 않았다.
