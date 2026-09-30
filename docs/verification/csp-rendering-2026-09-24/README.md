# 요청별 CSP와 동적 렌더링 — 2026-09-24

사용자가 소개·개인정보 페이지의 동적 렌더링 전환을 승인했다. PRD §3·§8, ADR-069, ARCHITECTURE와 phase 23 step4-A를 갱신하고 구현했다. 운영 배포나 CSP 강제 활성화 승인은 포함하지 않는다.

## 구현

- 공통 `app/layout.tsx`에서 `await connection()`을 호출해 요청마다 HTML을 렌더링한다. 소개·개인정보·데모·권한 없음·404 화면이 빌드 시 nonce 없는 HTML로 고정되는 문제를 해소한다. 공개 페이지에 인증 조회·DB 쓰기를 추가하지 않았다.
- `proxy.ts`는 매 요청 난수 nonce를 만들고 입력 nonce/CSP를 덮어쓴다. 서버 전용 `SASU_CSP_ENFORCE=true`일 때 강제 헤더를 쓰며, 미설정·그 외 값은 Report-Only다. 두 헤더를 동시에 보내지 않으며 no-store·기존 세션 갱신·403/404 경계를 유지한다.
- 실제 `/demo/hiring`에서 Zod의 eval 가능 여부 검사에 의한 `script-src:report`를 발견했다. `lib/contracts.ts`는 브라우저에서 스키마 생성 전에 `z.config({ jitless: true })`를 적용한다. 서버 파서 모드는 유지하며 CSP의 script 정책은 완화하지 않는다. 설치된 `zod/v4/core/{util,schemas}.js`와 [Zod 공식 CSP 안내](https://zod.dev/compile#content-security-policy)를 확인했다.
- 모바일 캡처에서 개인정보 페이지의 표 최소 너비가 상위 grid 열까지 늘려 본문이 잘리는 기존 문제를 발견했다. 390px 화면에서 문단 오른쪽 경계가 566px였다([수정 전 측정](privacy-layout-before.json)·[화면](privacy-390-before.png)). 두 grid에 1열 `minmax(0, 1fr)` 제약을 적용하고 표의 자체 가로 스크롤은 유지했다.
- 설치된 Next.js 16.3.4의 `node_modules/next/dist/docs/01-app/02-guides/content-security-policy.md`와 `03-api-reference/04-functions/connection.md`를 근거로 구현했다. `force-dynamic`으로 데이터 캐시 정책 전체를 덮어쓰지 않는다.

## 재현과 검사 범위

- 프록시 강제 모드 테스트를 먼저 추가했다. 구현 전 [5개 실패·5개 통과](unit-red.txt), 구현 후 보안 헤더·프록시 [17개 통과](unit-green.txt).
- 첫 빌드는 E2E fixture의 `document` 식별자와 DOM 식별자 충돌로 타입 검사에 실패했다([출력](build-first.txt)). 브라우저 콜백을 `window.document`로 명시해 수정했다.
- 첫 Report-Only 브라우저 실행은 [2개 통과·2개 실패](browser-report-only-first.txt)였다. 하나는 위 Zod 초기화 위반이고, 다른 하나는 CDP `evaluate` 안에서 삽입한 스크립트가 CSP 위반 이벤트를 남기지 않는 검사 방식이었다. 차단 검사는 실제 응답 헤더를 유지한 HTML에 nonce 없는 script를 넣어 브라우저 파서가 실행하게 바꿨다. 제품 HTML은 변경하지 않는다.
- 첫 강제 모드 원본 검사는 검증 코드의 `fetch(blobURL)` 때문에 실패했다([출력](browser-access-enforce-first.txt)). 재생 자체는 `media-src blob:`으로 정상이다. 검증용 fetch가 별도의 `connect-src blob:` 허용을 요구해, 페이지가 실제 받은 Blob의 `arrayBuffer()`로 바이트를 비교하도록 고쳤다. 제품 정책을 검증 편의를 위해 넓히지 않았다.
- 정상 경로: `/`, `/privacy`, `/login`, `/demo/hiring`, `/demo/notion`, `/no-membership`, 존재하지 않는 경로의 404. 각 HTML의 모든 script nonce 일치, 정상 흐름 CSP 위반과 pageerror, 소개→개인정보 링크 이동을 검사한다. 채용 데모는 입력 오류 표시→합성 샘플→제출 미리보기까지 실행한다.
- API 거절·비활성 trailer 404를 포함한 9경로에서 기본 5종 보안 헤더·CSP 헤더·no-store·서로 다른 nonce를 검사한다. 의도적 nonce 없는 script는 정상 흐름 위반 집계에서 분리한다.
- 합성 1초 WAV Blob과 Blob Worker 동작을 검사한다. 실제 자료 검토함 로그인→원본 API→Storage 바이트→재생→조직 내려받기 설정 변경→내려받기는 별도 E2E로 확인한다. 실기기 녹음·화면 소리 수집을 대신하지 않는다.

## 실행 결과

로컬 Supabase만 연결한 프로덕션 `.next-verify` 빌드로 실행했다. Report-Only와 강제 모드는 같은 빌드를 서버 환경 변수만 바꿔 재시작해 확인한다.

| 검사 | 결과 | 근거 |
|---|---|---|
| lint | 통과, 문구 차단 0·기존 경고 77 | [로그](lint.txt)·[마지막 E2E/페이지 린트](lint-e2e.txt) |
| 프로덕션 빌드 | 타입 검사·페이지 생성 통과 | [로그](build.txt)·[사전 렌더링 목록](prerendered-routes.json) |
| 전체 단위 | 139파일·1,404개 통과 | [로그](unit.txt) |
| CSP Report-Only | 4개 통과 | [로그](browser-report-only.txt)·[헤더](report-only-headers.json)·[브라우저](report-only-browser.json) |
| CSP 강제 | 4개 통과 | [로그](browser-enforce.txt)·[헤더](enforce-headers.json)·[브라우저](enforce-browser.json) |
| nonce 없는 script | Report-Only: report/실행, 강제: enforce/차단 | [관찰](report-only-injection.json)·[강제](enforce-injection.json) |
| 실제 로그인·원본 재생·다운로드 설정 | 강제 모드 1개 통과, CSP 위반·pageerror 0 | [로그](browser-access-enforce.txt)·[재생 화면](access-live-playback.png) |
| 게스트 회귀 | 강제 모드 5개 통과, 1440/390px 정상 흐름 위반 0, 쓰기·LLM 증가 0 | [로그](browser-guest-enforce.txt) |

실제 원본 E2E는 격리 로컬 fixture만 쓰고 전사/LLM을 호출하지 않는다. 게스트 카운트 검사는 이 쓰기 검사가 끝난 뒤 별도로 실행했다. 마지막 개인정보 CSS 보완 뒤에는 빌드와 영향받는 CSP 두 모드 8개를 다시 실행했다. 개인정보 모바일 수정은 [최종 측정](privacy-layout-after.json)과 [390px 화면](enforce-privacy-390.png)을 직접 검토해 확인했다. 문단 오른쪽 경계는 최대 362px로 화면 안에 들어오며, 표만 컨테이너 안에서 가로 스크롤한다.

```powershell
npm run lint
$env:SASU_VERIFY_BUILD='1'
node scripts/review-qa.mjs build
npm run test -- --maxWorkers=2 --testTimeout=15000
# 두 모드를 각각 실행한다. 먼저 false로 start/csp-test, 서버 종료 후 true로 반복.
$env:SASU_CSP_ENFORCE='false' # 두 번째 실행은 'true'
node scripts/review-qa.mjs start
# 별도 터미널에서도 같은 SASU_VERIFY_BUILD와 SASU_CSP_ENFORCE 값을 지정한다.
node scripts/review-qa.mjs csp-test --reporter=line
# 강제 모드 서버에서 순차 실행
$env:E2E_ACCESS_EVIDENCE_DIR='docs/verification/csp-rendering-2026-09-24'
node scripts/review-qa.mjs access-browser-test --reporter=line
node scripts/review-qa.mjs guest-test --reporter=line
```

## 코드 관계

Graft 0.19.0, `node:22-bookworm` 격리 컨테이너, `DO_NOT_TRACK=1`, deep 분석·LLM 키 전달 없음. 이전 원본 보존 검증의 코드 스냅샷에 이번 변경 파일만 복사해 재분석했다.

- [변경 전 graph check](graft-check-before.txt)·[CSP 호출자](graft-before.json), [변경 후 build](graft-build-after.txt)·[graph check](graft-check-after.txt)·[CSP 호출자](graft-after.json).
- [Zod 보완 전](graft-contracts-before.json)·[후](graft-contracts-after.json): 계약→채용 검증→클라이언트 사용 경계와 실제 소스를 함께 확인했다.
- [RootLayout 조회](graft-layout.json)는 외부 Next.js `connection()`을 indexed callee로 반환하지 않았다. 이 경계는 소스·설치된 Next 문서·실제 빌드와 브라우저 결과로 검증한다. Graft 결과가 외부 라이브러리 동작을 증명한다고 주장하지 않는다. SQL은 이번 그래프 입력에 포함하지 않았다.

## Archify 구조도

[요청 순서 HTML](rendering-flow.html) · [명세](rendering-flow.json) · [검증](archify-validate.json) · [delivery 영수증](archify-delivery.json) · [브라우저 영수증](archify-visual.json) · [라이트/다크 접촉 시트](rendering-flow.visual-check.html)

Archify 공식 스킬 2.17, 공식 저장소 commit `9e35d2b0b39b155553ba9fcfe0b4f2a5198dd993`를 사용했다. 초기 폭의 가독성 검사 실패([기록](archify-validate-first.json)) 후 폭을 조정했다. 최종 명세를 동결하고 deliver한 다음 visual-check를 실행했다.

```text
diagram_type: sequence
specification_sha256: e1b7947e4d3abb8b9e9459e11d3f95360f0d194a79b64030c8737f2d68c1fe4f
artifact_sha256: b07ed15ad2181a4168c88cab21f3299a0a921299fbb73a7e862548b12c798e25
validation: 9/9 showcase, 0 errors, 0 warnings
browser_evidence: passed
visual_review: passed
correction_rounds: 1
```

자동 브라우저 검사는 1440×900·1600×1000·1920×1080·2048×1320에서 넘침 0을 확인했다. 이미지 검토자는 실제 캡처 1440×900 라이트·2048×1320 다크에서 본문/카드 잘림·화살표/라벨 충돌·과도한 하단 빈 영역 없음을 확인했다. 자동 영수증의 `visualReview: pending`은 변경하지 않았다. 독립적인 사람 검수나 뷰어의 모든 상호작용·내보내기 검사라는 뜻은 아니다. 작성한 내용은 한국어이며 **고정 뷰어 UI와 HTML lang은 도구 제약으로 영어**다. 검증 관찰 화살표는 제품에 CSP 수집 API가 구현됐다는 의미가 아니다.

## 남은 게이트

기본 Report-Only를 유지한다. V14의 운영 1일 관찰·운영 강제 후 녹음/재생/데모 완주와 배포 승인, V13 제공사 계정 확인, 0058 운영 migration은 별도다. `.next-verify`의 [사전 렌더링 목록](prerendered-routes.json)에는 메타데이터 자산·robots/sitemap과 프레임워크의 `/_global-error` fallback이 남는다. 실제 치명적 500/global-error 경로는 이번 검증에 포함하지 않았으며 404 결과로 대신하지 않는다.

step0의 실기기·장시간 복구, step1의 녹음 시작 전 영속 세션/키 발급 계약, step2→step4-B→step3 순서는 유지한다. phase 전체를 완료 처리하지 않았다. 배포·운영 DB 변경·커밋·외부 메시지 발신을 실행하지 않았다.
