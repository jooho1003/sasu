# 자료 검토함 접근·보존 보호 — 2026-09-18

상태: **로컬 구현·격리 SQL·실제 Storage 접근 통합·웹 접근 E2E 통과 / 운영 미반영**. Phase 23 step4-A 전체 완료 기록이 아니다.

## Docker 재시작 후 추가 검증

사용자의 직접 재시작 후 Docker 엔진 20.10.17과 로컬 Supabase 서비스가 정상 응답했다. `node scripts/review-qa.mjs setup`으로 로컬 QA에 누락된 0036·0037을 적용했다. [setup 기록](access-storage-setup.txt).

- `node scripts/review-qa.mjs access-test`: 실제 로컬 Storage 8개 체크 통과, 동시 61개 요청에서 분당 제한 유지, LLM 호출 0. [실행 로그](access-storage.txt).
- `node scripts/review-qa.mjs access-browser-test`: 실제 로그인 세션→Next API→Storage→브라우저 음성 재생·원본 바이트 일치→조직 설정→문서 내려받기·접근 기록 E2E 1개 통과. [실행 로그](access-live-browser-complete.txt), [실제 화면](access-live-playback.png).
- 초기 개발 서버는 메모리 압박 아래 첫 컴파일 시간 초과가 발생했다. 이 작업에서 띄운 서버만 정리하고 설치된 Next CLI가 지원하는 webpack 개발 모드로 재시작했다. 다른 프로젝트 프로세스는 종료하지 않았다.
- 테스트의 미디어 응답 캡처는 빈 바이트로 관측됐지만 실제 브라우저가 받은 Blob의 전체 바이트와 1초 WAV 재생은 정상임을 확인했다. 제품 응답 변경 실험은 되돌렸고, 테스트를 실제 Blob 검사로 수정했다. 문서의 재생 위장 요청은 SQL 계약대로 400, 내려받기 off는 403이다.
- QA 하니스가 사용하던 오래된 플래그 이름을 실제 `SASU_ORG_ADMIN_MODE`·`SASU_TRAILER_PUBLISH_ENABLED`·`SASU_TRAILER_SCORES_MODE`로 수정했다. 문서 UI의 원본 열기→다운로드 링크 순서도 실제 동작에 맞춰 검증했다.
- 합성 테스트 원본은 각 테스트 종료 시 해당 경로만 제거했다. append-only 감사 기록과 QA 메타데이터는 유지한다. 운영 DB·운영 배포에는 접근하지 않았다.

아래 초기 검증/차단 기록은 당시 이력으로 보존한다. 최신 전체 단위·lint·build 결과는 함께 진행한 [부서별 데모 기록](../department-hiring-demo/README.md)에서 확인한다.

## 구현 범위

- PRD §3·§8, ADR-058, ARCHITECTURE에 원본 접근권 경계를 먼저 반영했다. 세션 RPC에서 권한·동의·보존 기한·조직 스위치를 확인하고, 사용자별 최근 1분 60건 제한과 접근 허가 기록·60초 단회 접근권을 한 트랜잭션에 둔다.
- `0037_review_access_controls.sql`의 Storage RLS는 세션·원본 경로에 묶인 접근권을 authenticated GET에서 소비한다. 같은 트랜잭션의 중복 정책 평가는 허용하되 다음 요청 재사용, 직접 download/sign/list/copy는 거부한다. 원본 업로드는 INSERT-only로 유지한다. 다른 permissive SELECT 정책이 추가되어도 restrictive 정책이 보호한다.
- 원본 API는 사용자 세션으로 Storage에서 받은 파일 바이트를 no-store 응답으로 전달한다. service role·브라우저에 노출되는 서명 URL을 사용하지 않는다. 접근 기록은 **허가 기록**이며 재생·수신 성공 기록이 아니다.
- 조직 관리자에게 원본 내려받기 설정과 접근 기록 메타데이터를 제공한다. 관리자라는 이유만으로 자료 본문 권한을 부여하지 않는다. 녹음 스위치는 기본 off로 저장하지만 녹음 기능 연결 전까지 UI에서 변경하지 못한다.
- 확정 시각 기준 원본 보존 기간(수동/30/90/365일), 만료 접근·재추출·구간 처리 차단, 원본 파기 작업 예약을 추가했다. 전사·리비전·확정된 source/items는 보존한다. 브라우저도 만료 시 재생 버퍼를 폐기한다.
- 클라이언트 재시도의 직접 Storage 읽기를 제거했다. 문서를 재생 행위로 위장해 내려받기 스위치를 우회할 수 없다. 다만 음성 재생 자체가 바이트 전달이므로 내려받기 off는 DRM이 아니다.

변경 의존 관계와 수동 시퀀스: [access-design.md](access-design.md). Graft·Archify의 연결 도구/실행 파일을 찾지 못해 실제 도구 결과는 없다. 파일·호출자 수동 검토와 Mermaid 기록이 이를 완전히 대체했다는 의미는 아니다.

## 실행한 검증

| 명령·검증 | 실제 결과 | 근거 |
|---|---|---|
| 신규 `lib/review-access.ts` TDD | 먼저 테스트를 실행해 모듈 없음 실패 확인 후 구현, 해당 8개 통과 | `tests/review-access.test.ts` |
| `npm run test` | 91파일 / 1,091개 통과 | [전체 출력](access-unit.txt) |
| `node scripts/verify-security-sql.mjs` | 173개 / 권한 행렬 2,016개 통과 | [SQL 출력](access-sql.txt) |
| `npm run e2e:review-controls` | Chromium 8개 통과 | [브라우저 출력](access-browser.txt) |
| `npm run lint` | 통과 | [lint 출력](access-lint.txt) |
| `SASU_VERIFY_BUILD=1 npm run build` | 타입 검사 포함 빌드 통과 | [build 출력](access-build.txt) |

SQL은 격리 PGlite에 Storage 테이블·정책을 구성한 검증이며 실제 Storage 서버 요청 검증이 아니다. pg_cron/pg_net migration은 제외한다. 새 검증에는 단회 접근권의 사용자·경로·operation·재사용 경계, 60/61회 제한, 정책 우회 차단, 보존 스윕 멱등성·진행 중 작업 차단, 전사·리비전·확정 근거 보존, 게스트 쓰기 차단, 구 RPC 별칭 권한 회수가 포함된다.

브라우저 검증은 실제 제품 컴포넌트를 개발용 Vite 화면에서 렌더하지만 API·라우터·Storage는 모의 응답이다. 전체 Next→Auth→Storage E2E로 계산하지 않는다. 내려받기 설정, 만료, 429 표시, 관리자 설정 성공·실패·읽기 전용, 별도 보존 설정 요청을 확인했다. 재생 화면: [390px](access-playback-390.png), [1440px](access-playback-1440.png).

Next.js 스킬과 설치된 Next 문서를 기준으로 세션 Route Handler를 유지했고 React 스킬 점검으로 렌더 중 시각 읽기를 상태/타이머로 옮겼다. 초기 lint 실패를 수정한 뒤 최종 lint·build·test를 통과했다.

## 실제 Storage 실행 차단 — 재시작 전 이력

`node scripts/review-qa.mjs access-test`는 로컬 Supabase 상태 조회 단계에서 Docker 엔진에 연결하지 못해 실패했다. 새 검증 스크립트의 DB fixture 생성 단계에는 진입하지 못했다. Docker service가 실행 중이고 포트 listener가 있어도 엔진 API·로컬 API가 응답하지 않았다.

사용자가 Docker Desktop 재시작을 승인한 뒤 재시작을 시도했다. 기존 Docker 프로세스 종료가 Windows의 **액세스 거부**로 실패했으며, 숨김 재실행·docker-desktop 배포판 재시작 시도로도 연결이 복구되지 않았다. 다른 WSL 배포판이나 DB를 초기화하지 않았고, 관리자 권한 우회도 하지 않았다. 사용자가 Docker Desktop을 직접 재시작해 엔진 연결을 복구해야 한다.

복구 후 아래 순서로 **로컬 QA DB만** 검증한다. `setup`은 `.vercel/review-qa`의 migration 기록을 보고 누락분을 적용한다. 운영 `supabase db push`를 대신 실행하지 않는다.

```powershell
node scripts/review-qa.mjs setup
node scripts/review-qa.mjs access-test
```

`access-test`는 loopback URL을 강제하며 격리 합성 조직·사용자·파일을 만든다. 실제 Storage의 INSERT-only 업로드, 헤더/operation 전달, 단회 다운로드, 직접/서명 우회 거부, 내려받기 스위치, 동시 61개 발급 제한을 검증한다. LLM 호출은 없다. 종료 시 해당 실행이 생성한 원본만 제거하며 감사 기록과 QA fixture 메타데이터는 남긴다. 이 테스트 통과 전 운영 migration/배포를 하지 않는다.

## 남은 게이트

- **V17:** SQL·API 단위·컴포넌트·실제 로컬 Storage·로그인 웹 접근 흐름 통과. 운영 Storage 버전/배포 후 확인은 남았다. 기존 서명 URL은 만료까지 유효할 수 있으므로 배포 시 기존 TTL도 고려해야 한다.
- **V18:** SQL·워커 단위·컴포넌트 통과. 실제 Storage 파일 파기·복구 흐름 미검증.
- **V19:** 조직 설정·기록의 세션/RLS 구현. 실제 녹음 스위치와 세션 키 발급 연결은 step1/2가 남아 있다.
- **V13:** [9/18 제공사 실측](../processors-2026-09-18.md)의 Groq 설정은 확인했지만 운영 키-조직 연결·Voyage 옵트아웃은 미확인. 같은 기록의 운영 `can_see` anon 직접 EXECUTE 권한 경고도 별도 수정·실측 과제로 남는다.
- **V14:** CSP는 Report-Only이며 정적 페이지 nonce 충돌·강제 전환·운영 관찰이 남아 있다.
- **후속:** SEC-06 로컬 원본 암호화·세션 키, 실제 마이크/Meet/Zoom/30분 복구 검증, step1/2·정확률 step4-B·최종 회귀 step3 미완료.

기존 작업 트리 변경을 보존했다. 운영 DB·배포·커밋·외부 메시지 전송은 수행하지 않았다. Vercel CLI 미설치 상태이며 배포 승인 후 환경 동기화와 로그 확인에는 `npm i -g vercel` 설치를 권장한다.
