# Step 8: consent-flow

## 읽어야 할 파일

- `docs/pilot-consent.md` **전체** — 화면·DM 본문과 운영 규칙의 원천
- `/docs/PRD.md` §5 S0 행(`/consent`), §6-6 "동의가 수집보다 먼저다", §6-12 동의 전이 행, §8-2 컷 ⑥, §8-3
- `/docs/ADR.md` ADR-021
- `app/api/d/[dept]/settings/consent/route.ts`(consent_version 1 하드코딩), `app/api/d/[dept]/settings/member/route.ts`
- `lib/supabase/membership.ts`, `app/(auth)/` 레이아웃·페이지 구조, `app/auth/callback`
- `app/api/slack/interactions/route.ts`(서명 검증·액션 분기), `lib/slack/blocks.ts`, `lib/slack/post.ts`
- `components/settings-s5.tsx` 1·2번 섹션
- `supabase/migrations/0013_authenticated_write_boundaries.sql`(member는 자기 consent·slack 매핑만 update)

## 작업

1. `lib/consent.ts`(TDD 대상): `export const CONSENT_VERSION = 1`, `export const CONSENT_SECTIONS` — `docs/pilot-consent.md` "화면·DM에 표시하는 본문"을 구조화한 상수(제목·도입·7개 항목). **`[확인 대기]` 표시가 남아 있으면 그 문자열 그대로** 옮긴다(나중에 문서와 함께 채운다). `export function consentBlocks(): SlackBlock[]` 는 `lib/slack/blocks.ts`에 둔다(프레젠테이션 예외).
   - 테스트: 문서의 7개 항목 제목이 상수에 모두 있는지(문서 파일을 읽어 대조) — 문구 드리프트 방지.
2. S0 화면 `app/(auth)/consent/page.tsx`: `CONSENT_SECTIONS` 렌더 + [동의합니다] / [나중에]. 동의 → 기존 consent 라우트(부서 멤버십 전부에 기록할지 현재 부서만일지는 기존 라우트 계약을 따르고, 여러 부서면 모든 멤버십에 기록) → `next` 파라미터(내부 경로만 허용 — 오픈 리다이렉트 금지)로 이동. [나중에] → `/d/[dept]`로 가되 상단에 "동의 전에는 내 발언이 저장되지 않습니다" 배너.
3. 리다이렉트: `lib/supabase/membership.ts`의 부서 페이지 가드에서 `consented_at is null`인 **첫 방문**이면 `/consent?next=…`로 보낸다. 무한 루프 방지: [나중에]를 누르면 세션 쿠키 `sasu_consent_later=1`(httpOnly 불필요, 24h)로 재리다이렉트 생략. `/consent`·`/login`·`/auth/*`·`/demo/*`·API는 가드 제외.
4. consent 라우트: `consent_version = CONSENT_VERSION` 사용.
5. 슬랙 동의 버튼
   - S5 2번 섹션에 lead 전용 [미동의 멤버에게 동의 요청 보내기]: 서버에서 lead 검증 → `slack_user_id`가 있고 `consented_at is null`인 멤버에게 DM(`consentBlocks()`: 본문 요약 + 전문 링크 `/consent` + [동의합니다] 버튼 `action_id: "sasu_consent"`, `value`: 부서 id). 결과 `"n명에게 보냈습니다 · 계정 미연결 n명"`. 로그에 슬랙 ID 목록을 찍지 마라(건수만).
   - interactions 라우트: 서명 검증 후 `sasu_consent` 처리 — **클릭한 슬랙 user id**로 `members.slack_user_id` 매칭된 **본인** 행만 `consented_at=now(), consent_version=CONSENT_VERSION`(이미 동의면 유지). `value`의 부서 id와 매칭 멤버십이 일치해야 한다. service role 사용은 슬랙 서명 검증 경로라 허용되지만, SQL 함수 `consent_via_slack(p_slack_user text, p_dept uuid)`(service_role 전용, 본인 행만 갱신)로 캡슐화하라. DM 메시지를 `"동의가 기록되었습니다. 이제부터 연결된 채널의 내 발언이 사수에 저장됩니다."`로 교체(`response_url` 또는 `chat.update`).
   - 마이그레이션 `supabase/migrations/0022_consent_via_slack.sql`.
6. 테스트 먼저: `lib/consent.ts` 문서 대조 · 가드 리다이렉트(미동의→/consent, 동의→통과, 쿠키 있으면 통과, `next` 외부 URL 거부) · interactions `sasu_consent`(다른 사람 행 불변, 매핑 없는 슬랙 사용자 → 안내 문구, 서명 실패 401) · SQL(`consent_via_slack` authenticated 실행 불가, 본인 행만).

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
npm run e2e -- tests/e2e/guest.spec.ts                               # /demo 가드 제외 회귀 (로컬 dev 서버 설정은 playwright.config.ts 따름; 로컬 실행 불가 환경이면 사유를 summary에 기록)
```

## 검증 절차

1. AC 실행. 2. 체크리스트: 동의는 본인만(서버 집행) · 미동의 발언 미저장 불변식 영향 없음 · 오픈 리다이렉트 없음 · 서명 검증 선행 · 로그에 슬랙 이벤트 본문·ID 목록 금지. 3. index.json step 8 갱신.

## 금지사항

- lead가 다른 멤버의 `consented_at`을 기록하는 경로를 만들지 마라. 이유: 동의는 본인 의사 — 수집의 법적 근거(ADR-021).
- 동의문 문구를 창작·요약해 바꾸지 마라. 이유: 원천은 `docs/pilot-consent.md`, 드리프트 테스트로 고정.
- 운영 슬랙으로 실제 DM을 보내지 마라. 이유: 외부 발신은 승인 노드(O6).
- 운영 DB 반영 금지 · 기존 마이그레이션 수정 금지.
