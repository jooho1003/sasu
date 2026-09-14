# Step 0: 공개 사이트 기반 정리

## 읽어야 할 파일

- `docs/PRD.md` §3-2·§8-2·§11
- `docs/ARCHITECTURE.md` §6-2·§8
- `docs/ADR.md` ADR-043·045
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §A-4~A-7·§L1
- `app/globals.css`, `app/layout.tsx`

## 작업

전역 요소 스타일을 Tailwind base layer로 옮기고 가운데 정렬은 `.center-shell`로 제한한다. 사이트 링크와 공개 기준 URL을 `lib/site.ts` 한곳에서 안전하게 해석한다. 메타데이터·OG 이미지·아이콘·robots·sitemap을 추가하고 기존 화면의 CSS 회귀를 확인한다.

## Acceptance Criteria

- `lib/site.ts` 테스트를 먼저 작성하고 위험한 URL·잘못된 플래그·기준 URL 폴백을 검증한다.
- `/` HTML에 절대 `og:image`가 있고 `/robots.txt`가 `/d/`·`/admin`·`/api/`를 차단한다.
- `npm run lint`, `npm run build`, `npm run test` 통과.
- `/trailers`를 포함한 기존 게스트 E2E가 회귀하지 않는다.

## 금지사항

- 분석 스크립트·새 UI 의존성·DB·LLM·쓰기 요청을 추가하지 않는다.
- phase 8·10 이후의 마이그레이션을 적용하지 않는다.
