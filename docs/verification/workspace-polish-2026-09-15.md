# 설정·문서·관리 화면 UI/UX 후속 검증 — 2026-09-15

입력: [PRD §5](../PRD.md), ADR-048, [phase 13 step 1](../../phases/13-ui-refresh/step1.md).

## 구현 결과

- 설정: 연결 현황 요약, 멤버·동의 / 연결 관리 / 자료 가져오기 탐색. 메뉴 전환 중 폼 유지, 채널 변경 시 전체 재조회 제거, 로딩·오류·재시도 표시. 좁은 화면의 Slack 계정 선택란 확보.
- 문서: 접을 수 있는 업로드 영역, 파일 형식·크기 안내, 이름 검색, 문서 선택과 상세 분리, 인용 없는 요약 표시 차단 유지. 불필요한 연속 GET을 제거하고 처리 중인 문서만 4초 간격으로 갱신한다. 탭이 보이지 않으면 조회를 쉬고, 완료·실패 또는 조회 오류에서 갱신을 멈춘다.
- 관리: 실사용·데모 공통 사이드바와 현재 메뉴 표시. 데모는 개요·멤버·수집 채널·기록을 URL로 선택한다. 상태 배지, 모바일 요약 2열, 표 내부 가로 스크롤, 키보드로 전환하는 탭을 제공한다.

## 실행 결과

| 검증 | 결과 |
|---|---|
| `npm run lint` | 통과 |
| `npm run build` | Next.js 16.3.4 프로덕션 빌드·TypeScript 통과 |
| `npm run test` | 67개 파일, 910개 테스트 통과 |
| Playwright 5개 스위트 | **26/26 통과**, 1.3분 |
| `git diff --check` | 통과 |

최종 브라우저 검증 명령(PowerShell):

```powershell
$env:E2E_BASE_URL = 'http://localhost:3002'
npx playwright test tests/e2e/site.spec.ts tests/e2e/guest.spec.ts tests/e2e/team-coverage.spec.ts tests/e2e/ui-refresh.spec.ts tests/e2e/workspace-polish.spec.ts --reporter=line
```

로컬 빌드·미리보기 프로세스에만 `SASU_ORG_ADMIN_MODE=on`을 지정해 관리자 화면을 검사했다. 운영 환경 변수와 기능 플래그는 변경하지 않았다.

### 주요 동작 검증

- 1440px·390px: 설정 메뉴·채널 변경 후 멤버 연결 입력과 채널 이름 유지. 설정 GET **1회**. 미동의 상태에서 채널 연결 비활성.
- 1440px·390px: 문서 선택·검색·검색 초기화, 유효/미지원 파일 선택, 인용 없는 요약 비표시. 완료 목록 GET **1회**.
- 지연 응답 중 빈 목록을 표시하지 않음. 503 오류 → 재시도 → 처리 중 → 완료 → 4.5초 대기 후 GET 총 **3회**로 종료.
- 설정 읽기 실패 → 다시 불러오기 → 정상 표시.
- 실제 관리자 QA 계정으로 4개 페이지 읽기, 방향키·Home 키로 탭 전환, 페이지 전체 가로 넘침 없음.
- 게스트 관리자 4개 메뉴의 현재 위치·URL 전환, 이메일·관리 작업 버튼 비표시, 브라우저 쓰기 요청 없음.
- 기존 게스트 4개 부서의 카드·원장·묻기 동선, 접근 경계, 게스트 열람 전후 AI 호출·DB 행 수 불변 검증 통과.

초기 후속 테스트에서는 Next.js 알림 요소와 겹치는 테스트 선택자, `getByLabel`의 select 이름 매칭, 관리자 모바일 표의 최소 너비 문제로 6건이 실패했다. 선택자와 레이아웃을 수정한 뒤 위 26건 전체를 다시 실행해 통과했다.

## 화면 기록

`fixture-*` 이미지는 **합성 API 응답을 사용하는 UI 테스트 캡처**다. 제품 홍보용 운영 화면 캡처가 아니다. `demo-admin-*`는 실제 게스트 조회 화면이다.

| 화면 | 데스크톱 | 모바일 |
|---|---|---|
| 문서 목록·근거 상세 | [보기](workspace-polish-2026-09-15/fixture-documents-1440.png) | [보기](workspace-polish-2026-09-15/fixture-documents-390.png) |
| 업로드 | — | [보기](workspace-polish-2026-09-15/fixture-upload-390.png) |
| 멤버·동의 | [보기](workspace-polish-2026-09-15/fixture-settings-members-1440.png) | [보기](workspace-polish-2026-09-15/fixture-settings-members-390.png) |
| 연결 관리 | — | [보기](workspace-polish-2026-09-15/fixture-settings-connections-390.png) |
| 자료 가져오기 | [보기](workspace-polish-2026-09-15/fixture-settings-imports-1440.png) | — |
| 관리자 개요 | [보기](workspace-polish-2026-09-15/demo-admin-개요-1440.png) | [보기](workspace-polish-2026-09-15/demo-admin-개요-390.png) |
| 관리자 멤버 | — | [보기](workspace-polish-2026-09-15/demo-admin-멤버-390.png) |

## 범위

Claude 인수인계 후 최종 합본 빌드에서도 2026-09-15 23시 검증을 반복했다. 단위 테스트 **937개**, 위 5개 E2E suite **26개** 통과(`http://127.0.0.1:3003`, 1.1분). Slack 후속 변경의 상세는 [별도 기록](slack-answer-citations-2026-09-15.md)을 참조한다.

운영 배포·DB 마이그레이션·시드는 실행하지 않았다. API·워커·RLS·인용 검증 로직·권한 판정은 변경하지 않았다. 실제 업로드·초대 발송·채널 연결·관리 변경·LLM 실행은 이번 검증 범위가 아니다.
