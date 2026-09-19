# 홈페이지 노션 가이드 연결 — 2026-09-17

## 변경과 현재 상태

- 사용자 요청: 홈페이지에서 노션 사용 가이드를 열 수 있도록 연결.
- `lib/site.ts`의 공개 가이드 기본값을 사용하며 `SASU_GUIDE_URL`로 바꿀 수 있다. HTTPS로 검증하고 명시적 빈 값·잘못된 주소는 링크와 본문 섹션을 렌더하지 않는다.
- 홈페이지 PC·모바일 메뉴, 본문 안내, 푸터에 새 탭 링크와 접근성 안내를 추가했다. 같은 헤더를 쓰는 데모 입구에도 메뉴를 전달한다.
- Next.js·React 가이드에 따라 서버 컴포넌트와 기존 CSS를 유지했다. 새 클라이언트 상태·API·노션 인증·DB 작업은 없다.
- 최초에는 사용자 링크가 로그인을 요구했으나, 사용자가 같은 링크를 다시 보낸 뒤 **새 비로그인 Chromium에서 제목 `사수(SASU) 사용자 가이드 | Notion`과 본문 열람에 성공했다.** 리디렉션 후 주소 `https://app.notion.com/p/SASU-3ddd12f23255809985bfd98b97ce51c9`를 기본값에 반영했다. 노션 공개 권한 자체는 변경하지 않았다. 운영 배포는 아직 하지 않았다.

## 코드 관계와 도구 범위

`SASU_GUIDE_URL 또는 공개 기본값 → siteLinks().guideUrl → PublicSiteLayout / HomePage / DemoPage → SiteHeader / SiteFooter / 본문 안내`

Graft·Archify 실행 도구를 찾지 못했다. 위 관계는 실제 코드와 `git grep`으로 확인한 수동 기록이며 자동 그래프 생성·시각 검토 결과는 없다. 스키마·수집·권한·워커의 구조는 변경하지 않는다.

## 실행 기록

| 검사 | 결과 |
|---|---|
| TDD: `npx vitest run tests/site.test.ts` (구현 전) | 추가한 8건 실패, 기존 17건 통과 |
| `npx vitest run tests/site.test.ts tests/site-guide.test.ts` | 28건 통과. HTTPS·공백·미설정·위험 프로토콜 및 상단/모바일/본문/푸터 SSR·새 탭 속성 확인 |
| `npm run lint` | 통과 |
| `npm run build` | 통과, TypeScript 및 정적 페이지 생성 완료 |
| `npm run test` | 84개 파일, 1,046건 통과 |
| `git diff --check` | 통과 (Windows CRLF 변환 안내만 있음) |
| 기존 3000번 서버: `npx playwright test tests/e2e/site.spec.ts` | 첫 실행에서 메인 메시지·모바일 가로 넘침 2건 통과, `/privacy` 이동은 30초 초과로 실패. 브라우저 회귀 전체 통과가 아님 |

## 브라우저 검증 한계와 재실행

새 `tests/e2e/site-guide.spec.ts`는 390/768/1440px 메뉴·본문·푸터·새 탭·가로 넘침·콘솔 오류를 검사한다. 테스트용 외부 목적지는 가로채므로 이 테스트가 노션의 실제 공개 접근을 보장하지 않는다.

별도 개발 서버를 시작했으나 기존 3000번 개발 서버의 잠금 때문에 종료되어, 3187번 대상으로 실행한 테스트는 `ERR_CONNECTION_REFUSED`로 실패했다. 기존 서버를 종료하지 않았다. 이후 별도 프로덕션 검증 서버 실행 명령은 실행 정책에 차단되어 새 가이드의 브라우저 검증을 완료하지 못했다. SSR 테스트 통과를 클릭·레이아웃 검증 통과로 간주하지 않는다.

기존 서버의 메인 회귀를 재실행했으나 첫 테스트도 40초 후 실패하여 재시도를 중단했다. 애플리케이션 서버는 종료하지 않았고 테스트 프로세스만 중단했다.

운영 반영 전 남은 절차:

1. 비로그인 열람은 재확인 완료. 배포 시 공개 권한이 유지되는지 확인한다.
2. 기본 가이드 주소가 반영된 코드를 재빌드한다. 기존 환경 변수에 빈 `SASU_GUIDE_URL`을 설정하지 않도록 한다.
3. 실행 중인 테스트 서버와 동일한 주소를 `E2E_GUIDE_URL`, 테스트 서버 주소를 `E2E_BASE_URL`에 설정하여 `npx playwright test tests/e2e/site.spec.ts tests/e2e/site-guide.spec.ts`를 실행한다.
4. 실제 노션 새 탭 열람 확인 후 운영 반영한다.
