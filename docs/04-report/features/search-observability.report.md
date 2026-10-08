# search-observability Completion Report

2026-10-07 · SASU · PDCA report · **Partial** · 설계 비교 20/20 = **100%**. 설계·운영 검증 완료, 미실행 개발 절차와 provider 콘솔 확인은 아래에 남긴다.

## Executive Summary

### Project Overview

PRD §3-9·§8 / ADR-091 / phase 52. 공개 제품 정보를 검색·질문형 검색·생성형 검색이 읽을 수 있게 정리하고, 동의 기반 GA4와 원문을 제거한 Sentry 오류 관측을 연결했다. 업무 검색·권한 SQL·DB·job 변경 없음.

### Results Summary

설계 비교 항목 20개 모두 충족. 사용자 승인 후 운영 배포 `dpl_4vZqM84jMxEyu14dVfXiPPMbwoGs`를 반영했고 getsasu.com Ready를 확인했다. 실제 GA4 collector HTTP 204와 운영 Sentry browser collector HTTP 200을 확인했다. GA 콘솔 실시간 화면과 최신 운영 Sentry 이벤트 UI 확인, Graft/Archify 실행은 미완료다.

### Value Delivered

| 관점 | 결과 |
|---|---|
| Problem | 공개 제품 설명과 방문·오류 관측을 보완했다. |
| Solution | 공개 metadata·FAQ/JSON-LD·llms, 사용자 분석 선택, Sentry 전송 허용 목록. |
| Function/UX Effect | 공개4·실제SDK2 E2E, 1916 unit pass. 운영 공개 검색·읽기 전용 demo·로그인 회귀, 동의 전 GA4 요청 없음·공개 payload 정제·비공개 중단·실제 collector 응답 확인. |
| Core Value | 공개 발견과 장애 확인 기능을 추가하고 인증 URL·업무 원문·사용자 정보 전송을 제한했다. |

### Success Criteria Final Status

| 기준 | 상태 | 근거 |
|---|---|---|
| SC1 공개 검색 | Met | 공개 canonical3, FAQ/JSON-LD, robots/sitemap/llms, noindex HTTP E2E |
| SC2 GA4 | Met | 실제 Google SDK 요청 검증과 운영 collector HTTP 204. 콘솔 실시간 화면은 미확인 |
| SC3 Sentry | Met | 실제 서버·hook 수신과 Geo 제거, 브라우저 SDK envelope 검증, 운영 browser collector HTTP 200. 최신 운영 이벤트 UI는 미확인 |
| SC4 검증 | Met | 최신 전체 build·lint·unit·E2E·gap 재검토, cloud build·운영 회귀 exit0 |

성공 기준 4/4(100%)와 설계 비교 20/20(100%)를 충족했다. 이 수치는 Graft/Archify 실행이나 provider 콘솔 표시 확인을 완료했다는 뜻이 아니다.

### Key Decisions & Outcomes

| 원천 | 결정·결과 |
|---|---|
| PRD §3-9 | 공개 metadata·FAQ 구조화 데이터·절대 sitemap·llms 구현 |
| PRD §3-9·§8 | GA4는 사용자 허용 뒤 공개 조회·고정 CTA만, private 전환 이전 중단 |
| ADR-091 | Sentry는 허용 목록으로 재구성, 실제 수신 후 user/Geo 제거 |
| Design §7 | replay·로그·성능 추적·breadcrumbs·source map 업로드 차단 |
| ARCHITECTURE §6-14 | 기존 업무 검색·SQL 가시성 판정 유지, DB/job 추가 없음 |

## Related Documents

[Plan](../../01-plan/features/search-observability.plan.md) · [Design](../../02-design/features/search-observability.design.md) · [Analysis](../../03-analysis/search-observability.analysis.md) · [실행 기록](../../verification/52-search-observability/verification.md) · [도구 누락](../../verification/52-search-observability/code-context.md).

## Completed Items

공개 검색·FAQ, GA4 속성/스트림·사용자 선택, 서버·브라우저 Sentry·CSP·개인정보 안내. GA4 G-HLFXFGBGPD, 실제 Sentry sasu 프로젝트 생성. Production 환경 변수 4개 등록 후 재조회.

Sentry 합성 오류를 실제 수신했다. 수집 서버가 추가하던 지역 정보는 IP 저장 방지와 user/user.geo.* 제거 규칙을 적용한 뒤 새 이벤트에서 없는 것을 확인했다. 로컬 Google/Sentry 브라우저 테스트는 실제 SDK 요청을 가로채 wire payload를 확인했다. 운영 검사에서는 collector 요청을 fulfill하지 않고 continue하여 GA4 HTTP 204와 Sentry HTTP 200을 확인했다. 운영 browser event ID는 `4c5f95b792df493a85f2d864dfe9fa99`다. 이 이벤트의 콘솔 UI 확인은 기존 수신 후 privacy 확인과 구별한다. demo canonical 검사는 기존 자동 로그인을 실행하지 않는 query로 읽기 전용 확인했다.

사용자 승인 후 cloud Turbopack build를 통과한 새 배포를 운영 반영했다. 공식 도메인의 robots/sitemap/llms·canonical/FAQ·읽기 전용 demo·로그인 noindex·동의 전 GA 요청 0·비공개 GA 중단을 검증했다. 근거는 `operating-results.json`, `operating-check.txt`, `vercel-candidate-inspect.txt`, `vercel-production-after.txt`다.

## Incomplete Items

- GA4 콘솔 실시간 표시와 최신 운영 Sentry 이벤트의 콘솔 UI 확인. Aside 미연결과 대체 브라우저 focus timeout/GA 페이지 로드 실패로 확인하지 못했다. collector HTTP 수락은 확인했으며 콘솔 처리 결과와 구별한다.
- Graft/Archify 실행 결과. 실제 import 검토는 도구 실행으로 간주하지 않는다. 해당 게이트 때문에 phase step은 전체 완료로 표시하지 않는다.

검색 색인·순위·AI 인용 성과는 이 구현 검증과 구별한다.

## Quality Metrics

| 항목 | 최신 결과·근거 |
|---|---|
| 설계 비교 | 100% / analysis.md |
| 전체 단위 | 192 files / 1916 pass / unit-tests-latest.txt |
| 관련 단위 | 4 files / 10 pass / related-tests-final.txt |
| lint | errors0·blocking0 / lint-final.txt, lint-ga-command.txt |
| 최신 전체 build | Webpack exit0 / build-verified.txt |
| 공개 E2E | 4 pass / e2e-final.txt, e2e-public-results.json |
| 실제 SDK E2E | 2 pass / e2e-live-final.txt, e2e-live-results.json |
| cloud build·운영 배포 | Turbopack build·Ready / vercel-candidate-inspect.txt, vercel-production-after.txt |
| 운영 회귀·collector | exit0·GA4 204·Sentry 200 / operating-check.txt, operating-results.json |

최신 번들에 공식 Google Arguments queue가 포함됐음을 확인했다. 이전 번들의 build와 과거 실패 E2E는 최신 성공으로 세지 않았다.

## Lessons Learned & Retrospective

전송 직전 payload와 수집 후 enrichment를 함께 검증했다. 정적 metadata route의 canonical 주소는 빌드 전에 공식 도메인 설정이 필요했다. stub 큐 검사에 실제 SDK 요청 검사를 더했다.

## Process Improvement Suggestions

구현·로컬 요청·provider 수신·운영 반영을 별도 상태로 기록한다. 도구 누락을 실제 import 기록으로 숨기지 않는다.

## Next Steps

브라우저 연결을 복구한 뒤 GA4 콘솔 실시간 화면과 최신 운영 Sentry 이벤트 UI를 확인한다. Graft/Archify 실행 결과가 확보되면 해당 개발 절차 기록을 보완한다. 이전 운영 배포 `dpl_4z2gfxf8hJLQqPzq8WmS6RZvQDSk`는 되돌림 대상이며 현재 운영 배포와 구별한다.

## Changelog

2026-10-07: 공개 검색·GA4·Sentry 구현, 최신 build/단위/E2E, 승인된 운영 배포와 실제 collector 응답 확인 완료. 설계 비교 100%. Graft/Archify와 provider 콘솔 확인이 남아 절차 상태는 Partial로 보고.
