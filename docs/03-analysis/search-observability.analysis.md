# search-observability Gap Analysis

2026-10-07 · PDCA analyze/iterate · [Design](../02-design/features/search-observability.design.md) · [실행 기록](../verification/52-search-observability/verification.md).

## Context Anchor

WHY/WHO/RISK/SUCCESS/SCOPE는 plan의 공개 발견·장애 관측·원문/인증 URL 전송 제한을 따른다. PRD §3-9·§8 및 ADR-091이 원천이다.

## 1. Strategic Alignment

새 업무 API/DB 없이 공개 검색·관측을 확장했다. 공개 식별자는 서버를 통해 전달하고 SQL 가시성·기존 lib/search.ts는 바꾸지 않았다. 실제 GA4·Sentry를 생성했으며 Marketplace 설치 오류는 실제 Sentry 직접 생성으로 해결했다.

## 2. Static Analysis

PDCA gap-detector 역할의 pdca_gap_review가 plan/design/upstream과 실제 파일을 읽었다. Structural/Functional/Contract 검토에서 추가 확신도 80% 이상의 코드 버그를 찾지 못했다. 이 결과는 실제 전송/운영 검증을 대신하지 않는다.

비교 항목은 SC마다 5개, 총 20개 동등 가중치다: SC1 metadata/noindex/FAQ·JSON-LD/robots·sitemap·llms/HTTP; SC2 계정 설정/동의/payload/비공개 전환/실제 수신; SC3 프로젝트·수신/배선/정제 테스트/불필요 수집 차단/수신 후 privacy; SC4 lint/unit/build/E2E/gap 기록.

## 3. Runtime Verification

| SC | 현 상태 | 실행 근거 |
|---|---|---|
| SC1 | Met | 공개 3경로 canonical, FAQ/JSON-LD·robots·sitemap·llms·private noindex HTTP/E2E 통과. demo는 기존 자동 로그인을 피하는 읽기 전용 query로 검사 |
| SC2 | Met | 속성·스트림 생성, 향상 측정 off. 실제 Google SDK의 정제된 조회/CTA·동의/철회·비공개 중단 통과. 승인된 운영 배포에서 실제 collector HTTP 204 확인(fulfill 없이 continue). GA 콘솔 실시간 표시는 미확인 |
| SC3 | Met | 합성 서버·onRequestError 수신, 기존 새 이벤트에서 User/Geography 제거 확인, unit 정제·브라우저 envelope 검증. 운영 브라우저 오류 collector HTTP 200, event 4c5f95b792df493a85f2d864dfe9fa99. 이 운영 이벤트의 콘솔 UI 확인은 미완료 |
| SC4 | Met | 1916 tests pass·lint exit0, 최신 전체 build-verified exit0·공개4/실제SDK2 E2E pass·gap 검토. Vercel cloud Turbopack build·운영 회귀 exit0 |

최종 20/20 = 100%. 남아 있던 실제 GA4 collector 수신 항목은 운영 collector의 HTTP 204 응답으로 충족했다. 성공 기준은 4/4 충족(100%)이다. collector의 HTTP 수락과 provider 콘솔에서 처리된 이벤트 확인은 구별한다. 과거 build 성공·E2E 실패 결과는 최신 통과로 계산하지 않았다. 운영 실행 후 PDCA gap-detector/report-generator 재검토는 설계 비교 100%를 확인했지만, 아래 미실행 절차와 콘솔 확인까지 전체 완료로 판정하지 않는다.

사용자 승인 후 deployment `dpl_4vZqM84jMxEyu14dVfXiPPMbwoGs`를 운영 반영했다. 공식 도메인 getsasu.com의 Ready 상태와 운영 robots/sitemap/llms·canonical/FAQ·읽기 전용 demo·로그인 noindex·동의 전 GA 요청 0·비공개 GA 중단을 확인했다. 근거: `operating-results.json`, `operating-check.txt`, `vercel-candidate-inspect.txt`, `vercel-production-after.txt`([실행 기록 디렉터리](../verification/52-search-observability/)).

## 4. Iteration Record

- 비동기 HomePage 단위 테스트를 프레임워크 변경에 맞춰 await했다.
- canonical build 환경 누락으로 sitemap이 localhost였던 E2E 실패: 빌드 시 NEXT_PUBLIC_APP_URL=https://getsasu.com 적용.
- Sentry 빈 frames processing error: 테스트 red 후 빈 stacktrace 생략, 실제 새 이벤트 처리 오류 없음.
- Sentry collector GeoIP 잔존: SDK infer_ip=never 및 IP 저장 방지에 더해 Remove Anything user.geo.*를 저장. 새 실제 이벤트에서 User/Geography 없음.
- Windows Turbopack 재빌드 장기 정체: 소유 PID 검증 후 중단하고 공식 --webpack 전체 build 통과. Google 공식 Arguments command queue 변경을 포함한 최신 번들까지 재검증했다.

## 5. Open Gates

GA4 콘솔 실시간 화면과 최신 운영 Sentry 이벤트의 콘솔 UI 확인은 미완료다. Aside 미연결과 대체 브라우저의 focus timeout/GA 페이지 로드 실패로 확인하지 못했다. 기존 Sentry 수신 후 privacy UI 검증은 이전 실행 기록으로 유지한다. Graft/Archify 도구 실행 결과 없음([명시된 누락](../verification/52-search-observability/code-context.md)). 설계 비교 목록은 충족했지만 이 개발 절차까지 완료로 표시하지 않는다. [PDCA 부분 보고](../04-report/features/search-observability.report.md)를 연결한다.
