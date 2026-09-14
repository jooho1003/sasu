# D12 공개 사이트 구현 검증

- 실행일: 2026-09-15 (Asia/Seoul)
- 범위: `phases/9-site` step 0~1
- 근거: `docs/planning/메인웹사이트_관리자콘솔_설계.md` §A·§L1
- 운영 DB·LLM·외부 쓰기: 실행하지 않음

## 구현 결과

- `/` 메인: 헤더, 히어로, 문제, 작동 방식, 차이, 권한별 답변 캡처, 신뢰 설계, 조건부 채용 예고편, CTA, 푸터.
- `/privacy`: 처리 목적·항목·동의·보관·위탁·권리·안전성 조치와 법률 검토 전 초안 표시.
- `lib/site.ts`: 공개 링크 프로토콜 검증, 예고편 공개 경로 우선순위, 메타데이터 기준 URL 폴백.
- 메타데이터: 절대 OG URL, 1200×630 이미지, 아이콘, Apple 아이콘, robots, sitemap.
- 게스트 보강: `/demo`, `/demo/d/[dept]/*`, `/no-membership`에서 메인·데모·파일럿 동선 제공.
- 전역 CSS: 요소 규칙을 base layer로 이동하고 가운데 정렬을 `.center-shell`로 제한.

## 실행 기록

| 검증 | 결과 |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS · `/`, `/privacy`, 이미지, robots, sitemap 정적 생성 |
| `npm run test` | PASS · 50 files, 789 tests |
| `npx playwright test tests/e2e/site.spec.ts` | PASS · 3 tests |
| `npm run e2e` | PASS · 12 passed, 3 skipped(실환경 자격증명 조건부) |
| `npm run e2e:trailer` | PASS · 6 tests(활성 5 + 비활성 404 1) |

단위 TDD는 `lib/site.ts`가 없어서 실패하는 상태를 먼저 확인한 후 구현했으며, URL·플래그·폴백 16개 계약이 통과했다.

## 시각 검수

- [1440px 전체 페이지](site-1440.png)
- [390px 전체 페이지](site-390.png)

두 화면 모두 가로 넘침이 없고, 모바일에서 헤더 메뉴 축소·히어로 순서·카드 단일 열·CTA·푸터가 정상이다. 제품 이미지는 `docs/submission/screenshots/`의 실제 합성 게스트 실행 캡처에서 가져왔다.

## 남은 운영 게이트

- 외부 링크(`SASU_PILOT_CONTACT_URL`, `SASU_DEMO_VIDEO_URL`, `SASU_VOTE_URL`)는 실제 값 설정 후 재배포해야 노출된다.
- Vercel CLI가 현재 설치되어 있지 않아 환경 변수 pull·배포·운영 로그 확인은 실행하지 않았다.
- phase 8 step 1의 마이그레이션 0025 운영 반영은 사용자 승인 전까지 계속 차단 상태다.
