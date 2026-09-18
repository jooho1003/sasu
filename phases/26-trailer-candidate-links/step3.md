# Step 3: candidate-page

지원자가 여는 공개 페이지 `/t/i/[token]`: 이메일 확인 → 동의 → 체험(제출 모드) → 제출 1회 → 완료/철회. 제출 라우트 자체는 step 4에서 만들고, 이 step은 페이지·열람·동의·체험 컴포넌트의 제출 모드까지다.

## 읽어야 할 파일

- `/docs/ADR.md` ADR-062 (전체) · ADR-040·041(공개 슬러그 경로의 불변 약속) · `/docs/ARCHITECTURE.md` 불변식 9·20·21
- `docs/planning/예고편_지원자링크_설계.md` §3·§4 "지원자"·§8
- step 0 RPC(`trailer_invite_open`·`trailer_invite_consent`) · step 1 `lib/trailer-invite.ts`·계약
- `app/t/[slug]/page.tsx`(anon 클라이언트·`force-dynamic`·noindex·fail-closed 패턴 — 그대로 따른다) · `lib/supabase/public.ts`
- `components/recruitment-trailer.tsx` — 14행 props, 51~55행 `submit()`, 78·101행 "서버로 전송하지 않아요" 문구, 95행 공고 링크
- `lib/contracts.ts` `TrailerAttemptSubmission`·`TrailerAttemptEvent` — 제출 모드가 만들어야 하는 모양
- `proxy.ts` 13~26행(헤더·`needsSession`) · `app/robots.ts` · `lib/security-headers.ts`

## 작업

### 1. 라우트 `app/t/i/[token]/page.tsx` (+ `app/api/t/i/open/route.ts`, `app/api/t/i/consent/route.ts`)

- 페이지는 `trailerInvitesEnabled()` false 또는 토큰 형식 위반이면 `notFound()`. 세션·쿠키를 읽지 않는다. `robots: noindex, nofollow`. 응답 헤더 `Referrer-Policy: no-referrer`(이 경로만; `lib/security-headers.ts` 또는 라우트 세그먼트 설정으로).
- 페이지 자체는 서버에서 DB를 부르지 않는다(토큰만으로 열리지 않아야 하므로). 이메일 입력 폼만 렌더하고, 클라이언트가 `POST /api/t/i/open {token,email}` → anon 클라이언트로 `trailer_invite_open` → `parseTrailerInviteOpen`(실패 시 `invite_unavailable`과 같은 응답) → `TrailerInviteOpen` 반환. 동의는 `POST /api/t/i/consent {token,email,consent_version}`.
- 두 라우트 모두 `Cache-Control: no-store`, 오류는 `inviteErrorCode()` 코드만. 로그에 토큰·이메일·오류 메시지 원문을 쓰지 않는다(길이·코드만).
- `proxy.ts`: `/t/i/`·`/api/t/`를 `needsSession`에 **넣지 않는다**(세션 갱신 0). 데모 심사위원 쓰기 차단(73~85행)이 이 경로에 걸리지 않음을 테스트로 확인한다(심사위원 쿠키가 있어도 지원자 제출은 별개 경로).
- `app/robots.ts`는 `/t/`로 이미 차단됨 — 확인만.

### 2. 화면 `components/trailer-invite-flow.tsx` (client)

상태는 React state만. 쿠키·localStorage·sessionStorage 금지. 새로고침하면 이메일 확인부터.

1. **이메일 확인**: "이 링크를 받은 이메일 주소를 입력하세요". 실패는 항상 같은 문구("링크를 열 수 없습니다. 주소를 확인하거나 채용 담당자에게 문의하세요") — 만료·철회·불일치를 구분하지 않는다. 남은 시도 횟수를 표시하지 않는다.
2. **동의**(`state === "consent_required"`): 수집 주체 `org_display_name` · 수집 항목(이메일, 선택한 결정과 이유 서술, 단서 선택 기록) · 목적(채용 과제의 참고 자료·면접 질문 준비) · 보관(제출 후 90일, 이후 자동 파기 · 언제든 이 링크에서 직접 철회) · **"AI가 계산한 점수는 채용 담당자의 참고 자료이며, 합격 여부를 자동으로 결정하지 않습니다. 결과에 대한 설명이나 이의는 채용 담당자에게 요청할 수 있습니다."** · 동의하지 않아도 불이익이 없고 공개 체험(`/t/[slug]`가 있으면)은 가능 · 개인정보처리방침 링크(`/privacy`). 체크박스 + [동의하고 시작] → consent 라우트 → `state: "ready"`.
3. **체험**: `RecruitmentTrailer`에 새 prop `submission?: { onSubmit(submissions: TrailerAttemptSubmission[]): Promise<"ok"|"error">; notice: string }`. 이 prop이 있을 때만: 78·101행 문구를 "제출하면 채용 담당자에게 전달됩니다. 개인정보(이름·연락처)는 적지 마세요"로 바꾸고, 마지막 퀘스트의 기록실에 [최종 제출] 버튼을 둔다. 각 퀘스트의 `TrailerSubmission`을 `TrailerAttemptSubmission`으로 바꿀 때 `events`는 이미 있는 상호작용(단서 발견·대화 열람·선택)을 seq 오름차순으로 기록하고 없으면 `[]`. `validateAttemptSubmissions`(lib/trailer-assessment.ts)로 제출 전 검증. **prop이 없으면 기존 동작·문구와 바이트 단위로 같아야 한다**(공개 슬러그·`/trailers`·데모 회귀).
4. **완료**(`state === "submitted"`): "제출이 끝났습니다. 결과는 채용 담당자가 확인합니다." + [내 제출 철회](확인 후 step 4의 withdraw 라우트) + 공고 링크(`rel="noopener noreferrer"`). 점수·채점 상태를 보여 주지 않는다.
5. `state === "withdrawn"`: "제출을 철회했습니다. 이 링크는 더 이상 사용할 수 없습니다."

### 3. 테스트

- `tests/trailer-invite-open-route.test.ts`: 플래그 off 404 · 토큰 형식 위반 → `invite_unavailable`(404가 아니라 같은 코드로 통일해도 됨, 단 형식 위반과 미존재를 구분 못 하게) · RPC 응답에 `dept_id` 키가 섞이면 `invite_unavailable` · 응답 헤더 `no-store` · 로그 mock에 이메일·토큰 없음.
- `tests/recruitment-trailer.test.tsx`(있으면 확장): `submission` prop 없을 때 스냅샷 불변.
- `tests/e2e/trailer-invite-page.spec.ts` A: 플래그 off 404 · 잘못된 토큰 페이지가 이메일 폼을 보여 주고 어떤 입력에도 같은 오류 · 페이지 로드 시 `document.cookie` 빈 값·localStorage 0건.

## Acceptance Criteria

```bash
npm run lint && npx tsc --noEmit && npm run test
npx playwright test tests/e2e/trailer-invite-page.spec.ts tests/e2e/trailer.spec.ts tests/e2e/trailer-publish.spec.ts --config playwright.trailer.config.ts
npm run build
```

## 금지사항

- `/t/[slug]`·`/trailers`·`/demo/**`의 체험 문구·동작을 바꾸지 마라. 이유: ADR-040·041·059의 "전송·저장 0" 약속은 그대로다.
- 페이지 서버 컴포넌트에서 토큰만으로 `trailer_invite_open`을 부르지 마라. 이유: 이메일 확인이 링크 유출 시 유일한 방어다.
- 오류 문구에 만료·철회·이메일 불일치를 구분해 쓰지 마라. 이유: 토큰 존재 여부 탐색 방지.
- 지원자에게 점수·채점 상태를 보여 주지 마라. 이유: ADR-062 4항.
