# 채용 예고편 지원자 링크 검증 (phase 26 step 7)

2026-10-05. 로컬 QA(Supabase `review-qa`, `scripts/review-qa.mjs`)에서만 실행했다. 운영 DB·Vercel·운영 조직 플래그는 건드리지 않았다. 법률 검토와 조직 개시는 이 기록의 범위 밖이며 사람 판정으로 남는다.

원시 로그와 캡처는 [`trailer-invites/`](trailer-invites/)에 있다.

## 실행 결과

| 검증 | 커맨드 | 결과 |
|---|---|---|
| lint | `npm run lint` | 통과 (exit 0, 문구 검사 blocking 0, warning 84) |
| 타입 | `npx tsc --noEmit` | 통과 (exit 0) |
| 단위 | `npm run test` | 186 파일 · 1,881 테스트 통과 |
| 빌드 | `E2E_TRAILER_INVITES=1 node scripts/review-qa.mjs build` (= `next build`, QA 환경) | 첫 시도는 Turbopack 내부 오류(`Symlink [project]/node_modules is invalid`, 코드 변경 없는 일시 오류)로 실패, 같은 커맨드 재시도에서 통과. `/t/i/[token]` 동적 라우트 포함. `npm run build`를 운영 환경 변수로 돌리지 않았다 |
| SQL 초대 | `node scripts/verify-trailer-invites-sql.mjs "D:/바이브코딩/.sasu-qa-db"` | 13 통과, 실패 0 |
| SQL 보안 | `node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"` | 316 통과, 실패 0 (권한 조합 2,016) |
| E2E A | `node scripts/review-qa.mjs trailer-regression` (= `playwright test --config playwright.trailer.config.ts`, 로컬 Supabase 환경 주입) | 14 통과 · 3 skipped(B 그룹 3건, 플래그 off 서버 대상) · 1.8분 |
| E2E B | `E2E_TRAILER_INVITES=1 node scripts/review-qa.mjs candidate-test` (QA 서버 3011, 초대 플래그 on) | 1회차 실패, 2·3회차 통과(아래) |

설명: 인수 기준의 `playwright test --config playwright.trailer.config.ts`는 서버를 `npm run start`로 띄워 `.env`의 Supabase를 쓰므로, 운영 값을 쓰지 않도록 `review-qa.mjs`가 로컬 값을 주입한 상태로 실행했다. B 그룹은 해당 설정의 3108(플래그 off) 서버에서는 실행할 수 없어 QA 서버 3011에서 실행했다.

### E2E B 상세

- 1회차: 발급 → 동의 → 3퀘스트 → 제출까지 통과, 채점 대기 120초 초과로 실패. `jobs.last_error=schema_invalid`(실제 Groq `trailer_score` 응답이 strict 스키마 불일치, 호출 2건). 작업은 재시도 큐에 남았고 이후 `done`(attempts 2)으로 끝났다. 원인은 모델 출력 변동으로 판단하며 제품 코드는 바꾸지 않았다. 로그: `e2e-B-run1-failed.txt`.
- 2회차: 통과 (7.0초). 발급 · 동의 · 3퀘스트 · 실제 채점 · 점수표 · 철회 파기까지. 로그: `e2e-B-run2-passed.txt`.
- 3회차(캡처 스펙과 함께 실행): 통과 (17.7초).
- 실제 Groq `trailer_score` 호출: 통과 회차마다 1건(`live-results.json` scoreCalls 1). 1회차 실패분 2건 별도.
- 이 실행은 기존 `trailer-candidate-links-2026-09-19/` 파일을 덮어써서 `git checkout`으로 복원했다.

## 권한·누출 점검 (임시 스펙으로 실행, 결과는 `trailer-invites/capture-results.json`)

| 점검 | 결과 |
|---|---|
| 데모 조직 발급 거부 | API 403, 해당 부서 `trailer_invites` 0행. SQL 하니스에서도 통과 |
| anon의 `trailer_invites` select | 오류 `42501`(권한 없음), 0행 |
| anon의 지원자 제출(`trailer_attempts.kind='candidate'`) | 0행. 참고: anon은 데모 조직 `synthetic` 제출 3행을 읽는다(기존 `trailer_attempts_demo_read` 정책, 설계대로) |
| `/t/i/<token>` 응답 본문 | `dept_id`·`org_id`·`trailer_id` 문자열 없음, 실제 dept/org/trailer UUID도 없음 |
| 지원자 브라우저의 document·fetch·xhr 응답 7건 | 위 문자열·UUID 모두 0 (JS 번들은 코드 문자열이 있어 제외. 첫 시도에서 38건 전부를 검사해 `dept_id`·`trailer_id`가 잡혔으나 정적 번들의 코드 문자열이었다) |
| 지원자 페이지 쿠키·storage | 동의 화면, 제출 후 모두 쿠키 0 · localStorage 0 · sessionStorage 0 |
| 철회 | `email_normalized`·`email_hash` null, `withdrawn_at` 기록, 제출 행 삭제 |
| 거두기 | 발급 200, 거두기 204, `revoked_at` 기록 |
| `/t/[slug]` 불변 | 같은 발행본을 초대 플래그 on(3011)과 off(3012) 서버에서 조회: 응답 길이 19,997바이트로 동일, 화면 텍스트 38줄 동일. 원시 HTML은 정규화 후에도 문자열이 완전히 같지는 않았다(스크립트 속성 차이로 추정, 문구 차이 없음). off 서버의 `/t/i/<token>`은 404. `trailer-invites/slug-diff.json` |
| 서버 로그 | 서버 stdout/stderr 6줄(기동 메시지와 `trailer_invites_purged { count: 0 }`)에서 이메일·토큰·이유 원문 0건. Next 서버가 요청 로그를 남기지 않아 증명력이 약하다 |

## 캡처

- 부서장 발급 표: `trailer-invites/lead-issue-table-1440.png` (1440px 뷰포트의 "지원자 링크" 영역만 잘라 500px 폭)
- 지원자 동의 화면 390px: `trailer-invites/candidate-consent-390.png`
- 부서장 지원자 제출 탭: `trailer-invites/lead-submissions-tab-1440.png`

## 미실행·남은 항목

- 법률 자문(채용절차법 제11조 반환·파기 기간, 개인정보 처리방침 게시 확인): 사람 판정, 미실행.
- 조직 개시(`orgs.trailer_assessment_enabled`), 운영 DB 마이그레이션 적용, 운영 플래그 on, 배포: 미실행. 사용자 승인 필요(ADR-047·062).
- 임시 캡처 스펙·`scripts/`의 일회성 스크립트는 저장소에 남기지 않았다(스펙 2개 삭제).
