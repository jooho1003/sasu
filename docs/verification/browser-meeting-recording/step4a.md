# Phase 23 step4-A — 기존 자료 보호 진행 기록

## 2026-10-03 V14 CSP 강제

운영 응답 헤더 실측·관찰 기간·위반 수는 [CSP 강제 전환 기록](../csp-enforce-2026-10-03/README.md)에 있다. Report-Only 기간(9/30~10/3)에는 report-uri가 없어 실제 사용자 위반을 모으지 못했다. 대신 운영 Report-Only 자동 관찰(공개·데모·게스트 위반 0)과 로컬 강제 모드 로그인 화면 순회(35개 위반 0)로 판단했다. 강제 전환 뒤 운영 보안 헤더 4/4·게스트 5/5·데모 녹음 2/2를 통과했다.

## 2026-09-24 후속 검증

CSP 렌더링 충돌은 사용자 동적 전환 승인과 ADR-069로 해소했다. 공개·데모·404 nonce와 Report-Only/강제 모드를 로컬에서 확인했다. 운영 1일 관찰·강제 활성화 승인은 남아 있으며 V14 전체 완료로 표시하지 않는다. [CSP 후속 기록](../csp-rendering-2026-09-24/README.md). 아래 9/17 렌더링 결정 대기 문장은 당시 이력이다.

V18의 실제 로컬 Storage 파기·전사/요약 보존과 로그인 화면 검증을 통과했다. 기존 `can_see` anon 권한 문제를 0058 migration으로 보완했다. [최신 실행 기록](../review-retention-2026-09-24/README.md). 아래의 V18 미검증 표시는 과거 이력이며, 제공사·CSP·운영 반영과 전체 녹음 게이트는 여전히 남아 있다.

## 2026-09-18 추가 구현

재시작 후 추가 결과: **실제 로컬 Storage 8개 체크·로그인 웹 접근 E2E 1개 통과**. Docker 차단은 해소됐으며 운영 반영·V18 실제 파기·녹음 실기기 게이트는 남아 있다. 아래 차단 설명은 재시작 전 이력이다.

접근권·사용자당 60/분 제한·append-only 접근 허가 기록·조직 설정·원본 보존 기간·파기 예약을 구현했다. 전체 단위 테스트 1,091개, 격리 SQL 173개+권한 행렬 2,016개, 컴포넌트 브라우저 8개, lint·build 통과. **실제 Storage 검증은 Docker 재시작 권한 문제로 실행하지 못했으며 운영 미반영**이다. [구현·검증·차단 기록](access-controls-2026-09-18.md).

V13·V14·V17·V18·V19는 여전히 전체 완료가 아니다. 제공사 계정 확인의 최신 결과는 [9/18 기록](../processors-2026-09-18.md)을 따른다. 아래 9/17의 "DB 미구현"과 테스트 수치는 당시 상태이며 최신 구현 상태로 해석하지 않는다.

## 2026-09-17 이전 기록

2026-09-17. **부분 구현 / 운영 미반영 / V13·V14·V17·V18·V19 미충족**.

## 이번 변경

1. 개인정보 페이지의 미확인 ZDR 보장을 제거하고 제공사 설정·계약 확인 상태와 원본 음성의 Groq 전송을 명시했다. [공개 약관 확인과 계정 확인 한계](../processors-2026-09-17.md).
2. `lib/security-headers.ts` 테스트 실패를 먼저 확인한 뒤 기본 5종 헤더와 CSP 생성 함수를 구현했다. Supabase origin은 공개 환경 변수에서 검증·추출한다. 실제 원본 오디오 재생에 필요한 해당 origin과 websocket을 허용하고 임의 문자열의 CSP 주입을 거부한다.
3. `next.config.ts` 기본 헤더와 `proxy.ts` 요청별 난수 nonce·Report-Only를 연결했다. 클라이언트 nonce/CSP는 덮어쓰며 cookie refresh·403·404에도 유지한다. nonce 응답은 no-store. 공개 페이지·워커·수집 요청에 Supabase 세션 조회를 추가하지 않았다.
4. 동적 `/login` HTML의 모든 script에 요청 nonce가 붙는지, CSP 위반이 없는지 실제 Chromium으로 확인했다. 기존 UI style 속성 때문에 style-src는 unsafe-inline을 유지하며 script-src는 nonce+strict-dynamic이다.

## 실제 검증

- `tests/security-headers.test.ts` 7개, `tests/proxy.test.ts` 4개 통과. 전체 Vitest 1,076개 통과, lint·build 통과.
- 로컬 prod 서버 `http://127.0.0.1:3187`: `/`, `/privacy`, `/login`, `/api/jobs/run` GET 오류, 비활성 trailer 404의 헤더 실측 — `local-headers.json`.
- 로그인 CSP 위반 0, 정적 공개 랜딩 script 위반 13건 관측 — `local-csp-observation.json`. **Report-Only 관측이지 CSP 강제 성공이 아니다.**
- 게스트·공개 사이트·헤더 E2E 10개 통과 — `site-guest-headers-e2e.txt`. 가이드 3개는 처음 E2E_GUIDE_URL 미지정으로 skip되어 값을 넣고 재실행, 3개 모두 통과 — `site-guide-final-e2e.txt`. 최종 합계 13개 통과.
- 초기 확장 실행의 심사위원 데모 4개는 로컬 reviewer auto-login 설정/자격 증명이 없어 실패했다 — `site-guest-e2e.txt`. 다른 기본 게스트 검증은 통과했지만 심사위원 데모 검증을 대신하지 않는다.
- 격리 SQL 하니스 156개 + 2,016개 권한 행렬 통과(`sql.txt`). 기존 스키마 회귀이며 아직 없는 SEC-07~12 migration 검증이 아니다.

## 다음 구현/확인

- **렌더링 계약:** PRD의 정적 `/`·`/privacy` 조건과 전 경로 요청별 nonce는 양립하지 않는다. 설치된 Next 가이드(`node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`)는 nonce에 동적 SSR가 필요하다고 명시한다. 사용자에게 동적 전환 여부를 질문했고, 답변 전에는 정적 조건을 보존했다. 결정 후 PRD §3·§8·ADR를 먼저 갱신하고 강제 전환 전 위반을 없애야 한다. 현재 전역 강제 헤더를 켜면 정적 페이지 스크립트가 막힌다.
- **처리자:** Voyage 로그인·실제 옵트아웃 캡처, Groq 실제 계정 Data Controls·적용 계약 확인이 필요하다. 공개 문서 확인만으로 V13 완료 처리하지 않는다.
- **DB:** `review_access_events`·사용자당 60/분·`org_settings` 기본 off·`review_original_days`·원본 파기 sweep·관리 UI/RLS 테스트는 아직 미구현이다. 기존 Storage SELECT와 클라이언트 direct download/retry 경로까지 함께 검토해야 하며 API에만 카운터를 넣어 우회 경로를 남겨서는 안 된다. Supabase Storage 서명 호출과 SQL RPC를 같은 트랜잭션이라고 부를 수 없으므로 실제 발급/접근 로그의 경계도 구현 단계에서 확정해야 한다.
- **운영:** 배포, 운영 응답 헤더, 하루 CSP 관찰·강제 후 전체 완주, 운영 로그인 Set-Cookie 검증을 하지 않았다. Graft·Archify 미사용 범위는 [step0](step0.md)에 기록했다.

Vercel CLI가 현재 설치되어 있지 않다. 배포 승인 후 환경 동기화·로그 확인을 위해 `npm i -g vercel` 설치를 권장한다. 이번 작업은 배포·외부 메시지 발신·운영 DB 변경을 수행하지 않았다.
