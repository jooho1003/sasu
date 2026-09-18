# Step 2: lead-invites

부서장이 예고편 검토·발행 화면(S18)에서 지원자 링크를 발급·조회·철회·삭제한다. 라우트 + 화면 1개 구역.

## 읽어야 할 파일

- `/docs/PRD.md` §3-2 phase 26 행 · `/docs/ADR.md` ADR-062 1·3·4·6항 · `/docs/ARCHITECTURE.md` 불변식 3(요청 경로 service role 금지)·21
- `docs/planning/예고편_지원자링크_설계.md` §4 "부서장"
- step 0 마이그레이션(RPC 시그니처) · step 1 `lib/trailer-invite.ts`·`lib/contracts.ts` 추가분
- `app/api/d/[dept]/trailers/_shared.ts`(`trailerAction` — 세션·멤버십·플래그 검사 패턴, 이 파일의 패턴을 그대로 쓴다) · `app/api/d/[dept]/trailers/[id]/publish/route.ts`
- `app/(auth)/d/[dept]/trailers/_data.ts` · `app/(auth)/d/[dept]/trailers/[id]/page.tsx` · `components/trailers/forms.tsx` 45~78행(`TrailerReview`, 74행 링크 복사)
- `tests/trailer-routes.test.ts`(라우트 테스트 형식)

## 작업

### 1. 라우트 (`app/api/d/[dept]/trailers/[id]/invites/`)

세션 클라이언트로 RPC만 호출한다. `dept`는 멤버십 검증 후에만 쓴다(`_shared.ts` 패턴). `trailerInvitesEnabled()`가 false면 404.

| 메서드·경로 | 본문 | RPC | 응답 |
|---|---|---|---|
| `GET …/invites` | — | `list_trailer_invites` | `TrailerInviteRow[]` (이메일은 부서장에게 그대로. 조직 관리자 경로는 없다) |
| `POST …/invites` | `CreateTrailerInvitesBody` | `create_trailer_invites` | `TrailerInviteIssued[]` — 토큰이 포함된 **유일한** 응답. `Cache-Control: no-store` |
| `POST …/invites/[inviteId]/revoke` | — | `revoke_trailer_invite` | 204 |
| `DELETE …/invites/[inviteId]` | — | `delete_trailer_invite` | 204 |
| `POST …/invites/attempts/[attemptId]/rescore` | — | `requeue_trailer_attempt_score` | 202 + `after(runWorkerOnce)` |

오류는 `inviteErrorCode()`로 코드만 반환. 로그에는 dept id·건수·오류 코드만.

### 2. 화면 — `components/trailers/invites.tsx` (client)

`TrailerReview`(forms.tsx) 안, 발행 상태(`published`)일 때만 "지원자 링크" 구역을 렌더한다. 미발행이면 "발행 후 지원자 링크를 만들 수 있습니다" 한 줄.

- 발급: `<textarea>`에 이메일 여러 줄 → `normalizeInviteEmails` → 잘못된 항목은 전송 전에 표시 → [링크 만들기] → 결과 표(이메일 · `${origin}/t/i/${token}` · [복사] · 만료일). 표 위에 **"이 링크는 지금만 보입니다. 닫으면 다시 볼 수 없고 철회 후 새로 만들어야 합니다."** 토큰을 React state 밖(localStorage·URL)에 두지 않는다.
- 목록: 이메일 · 상태(`inviteStatusLabel`) · 만료 · 열람/동의/제출 시각 · 채점 상태 · [철회] · [삭제(제출 포함 파기)] · 채점 실패 행에 [다시 채점]. 정렬은 발급순 고정, **점수 열은 두되 정렬 불가**. 10초 폴링은 `TrailerList`와 같은 방식.
- 고지 문구(고정): "점수는 면접 질문을 준비하기 위한 참고 자료입니다. 합격 여부를 정하는 기준으로 쓰지 마세요." — 문구에 `합격`이 들어가는 것은 이 고지 한 문장에만 허용한다(금지어 필터 대상 텍스트가 아니다).
- 이메일 전송 기능을 만들지 않는다. [복사]만.

### 3. 테스트

- `tests/trailer-invites-routes.test.ts`: 세션 없음 → 401, 다른 부서 → 403/404, 플래그 off → 404, POST 21개 → 400, 응답에 토큰이 있는 라우트는 POST 하나뿐(GET 목록 응답에 `token` 키 없음), rescore 후 `after` 호출.
- `tests/e2e/trailer-invites.spec.ts` A 그룹(DB 무관: 플래그 off 404, 화면 구역 미노출) — B 그룹(QA 조직 실제 발급·목록·철회)은 `E2E_TRAILER_INVITES=1`일 때만.

## Acceptance Criteria

```bash
npm run lint && npx tsc --noEmit && npm run test
npx playwright test tests/e2e/trailer-invites.spec.ts --config playwright.trailer.config.ts   # A 통과, B skipped
npm run build
```

## 금지사항

- 라우트에서 `createServiceSupabaseClient()`를 부르지 마라(rescore 포함). 이유: 불변식 3 — 요청 경로 service role 금지. 재채점의 job insert는 RPC 안에서 한다.
- 조직 관리자 콘솔(`/admin`, `app/api/admin/**`)에 초대·이메일을 노출하지 마라. 이유: ADR-044 "관리자는 내용을 볼 수 없다".
- 목록에 점수순 정렬을 넣지 마라. 이유: ADR-062 4항(순위표 금지).
