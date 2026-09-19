# Phase 31 — 쉬운 말 문구·UI/UX 정비 (ADR-065)

- 원천: `docs/planning/쉬운말_문구_UIUX_설계.md` · PRD §3-7·§7 · ADR-065
- 목표: 서비스 안의 모든 문장을 중학교 2학년이 설명 없이 읽고 쓸 수 있게 바꾸고, 검사기(`check:wording`)와 이름표 SSOT(`lib/labels.ts`)로 되돌아가지 않게 묶는다.
- 사용자 결정(2026-09-19): **설계 §0의 8개 항목 확정 대기.** 확정 전에는 step 0을 시작하지 않는다. 확정 시 이 줄을 결정값으로 고친다.
- 9/20 제출본은 건드리지 않는다. 운영 반영은 step 7 뒤 사람 판정(설계 §0-8).

## 실행 순서와 의존

| step | name | 의존 | 비고 |
|---|---|---|---|
| 0 | wording-guide-lint | — | 사전·검사기·현재 위반 보고. 차단하지 않는다 |
| 1 | labels-ssot | 0 | 영문 상태값 노출 4곳 제거 |
| 2 | shell-nav-mobile | 0, 1 | 메뉴·404·error·모바일 헤더 |
| 3 | core-screens | 2 | 대시보드·카드·결정 기록·묻기 (로그인+데모) |
| 4 | lead-screens | 2 | 올린 자료·문서·점수표·기록 보관·설정·예고편·초대 |
| 5 | public-admin-consent | 2 | 메인·로그인·개인정보 요약·관리자·동의 diff 표 (법적 문구는 바꾸지 않음) |
| 6 | slack-llm-style | 1 | 슬랙 블록·안내·`lib/llm.ts` 문체 블록 |
| 7 | verification | 3, 4, 5, 6 | 검사기 lint 체인 편입 · 실측 · 완료 시 **blocked** |

step 3·4·5·6은 서로 독립이라 병렬 가능하다. 같은 파일을 두 step이 고치지 않도록 파일 목록을 step마다 명시했다.

## 공통 규칙

- 뜻·기능·불변식은 그대로, **말만** 바꾼다. URL·DB 값·enum·`lib/contracts.ts`·개발 문서(PRD·ADR·ARCHITECTURE)의 용어는 바꾸지 않는다.
- 문구를 바꿀 때는 `docs/wording-guide.md`의 사전을 따른다. 사전에 없는 어려운 말을 만나면 사전에 먼저 추가하고(step 0 산출물 갱신) 바꾼다.
- 바꾼 문구는 `node scripts/check-wording.mjs --report <파일>`로 그 파일의 위반이 0인지 확인하고 요약에 결과를 적는다.
- 버튼 라벨을 바꾸면 같은 step에서 E2E 셀렉터(`tests/e2e/**`, `playwright*.config.ts` 대상)도 고친다. 셀렉터는 텍스트 대신 `data-testid`·`role`을 우선한다.
- `lib/` 아래 새 모듈은 테스트 먼저(`scripts/hooks/tdd-guard.sh`). `lib/wording-check.ts` ↔ `tests/wording-check.test.ts`, `lib/labels.ts` ↔ `tests/labels.test.ts`.
- 슬랙 이벤트 본문·전사 원문·질문 원문을 로그·요약에 넣지 않는다. 문구 예시는 코드 상수만.
- 커밋하지 않는다. phase 경계에서 Claude가 리뷰 후 커밋한다.
