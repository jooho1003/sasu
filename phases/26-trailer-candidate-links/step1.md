# Step 1: invite-lib

지원자 링크의 순수 로직(토큰 형식·이메일 정규화·마스킹·상태 파생·RPC 응답 파서)을 `lib/`에 TDD로 만든다. 라우트·화면은 만들지 않는다.

## 읽어야 할 파일

- `/docs/ADR.md` ADR-062 · `/docs/ARCHITECTURE.md` §6-2 불변식 21 · §8 (TDD 규칙)
- `docs/planning/예고편_지원자링크_설계.md` §2~§4
- step 0이 만든 `supabase/migrations/00NN_trailer_invites.sql` — RPC 시그니처·반환 jsonb 모양·오류 코드가 이 step의 계약이다
- `lib/contracts.ts` 199~215행(`TrailerSubmission`·`TrailerAttemptSubmission`·`TrailerAttemptResult`), 333행 `InvitePreview`(마스킹 이메일 패턴)
- `lib/trailer-public.ts`(`PUBLIC_TRAILER_SLUG`, `parsePublicTrailer` fail-closed 패턴) · `lib/trailer-assessment.ts` 8~26행 `validateAttemptSubmissions`
- `lib/features.ts` · `tests/trailer-assessment.test.ts`(테스트 형식)
- `scripts/hooks/tdd-guard.sh` — `lib/` 새 모듈은 테스트가 먼저 있어야 한다

## 작업

### 1. `lib/features.ts`

`trailerInvitesEnabled(env = process.env): boolean` — `SASU_TRAILER_INVITES_ENABLED === "true"`. `trailerPublishEnabled()`가 false면 항상 false(발급·열람의 전제).

### 2. `lib/contracts.ts` 추가 (strictObject)

- `TrailerInviteToken = z.string().regex(/^[0-9a-f]{64}$/)`
- `TrailerInviteEmail = z.string().trim().toLowerCase().email().max(254)`
- `TrailerInviteOpen` — `trailer_invite_open` 반환: `{ scenarios: TrailerScenario[], apply_url: string|null, org_display_name: string, state: "consent_required"|"ready"|"submitted"|"withdrawn", consent_version: string, expires_at: string }`
- `TrailerInviteRow` — `list_trailer_invites` 1행. `status` enum 9개(step 0과 동일), `email: string|null`, `weighted_score: number|null`
- `TrailerInviteIssued` — `create_trailer_invites` 1행(`token: string|null`, `skipped_reason: "invalid_email"|"duplicate"|"active_exists"|null`)
- `CreateTrailerInvitesBody = { emails: string[] (1~20) }` · `SubmitTrailerInviteBody = { token, email, consent_version, submissions: TrailerAttemptSubmission[] (1~3) }` · `TrailerInviteOpenBody = { token, email }`

### 3. `lib/trailer-invite.ts` (테스트 먼저: `tests/trailer-invite.test.ts`)

```ts
export const TRAILER_INVITE_CONSENT_VERSION: string;          // "2026-09-18.1" 형식. 동의 문구가 바뀌면 올린다
export function normalizeInviteEmails(raw: string): { emails: string[]; invalid: string[] };  // 줄·쉼표·공백 분리, 소문자, 중복 제거, 20개 초과는 invalid가 아니라 오류 throw
export function maskInviteEmail(email: string): string;       // ab***@domain — InvitePreview와 같은 규칙
export function parseTrailerInviteOpen(data: unknown): TrailerInviteOpen | null;   // fail-closed: scenarios마다 validateScenario 통과 못 하면 null
export function parseTrailerInviteRows(data: unknown): TrailerInviteRow[];         // 한 행이라도 깨지면 빈 배열이 아니라 throw (부서장 화면은 오류를 보여야 한다)
export function inviteStatusLabel(status: TrailerInviteRow["status"]): string;    // 한국어 라벨. "합격·불합격·탈락·추천·순위" 금지어를 포함하지 않는다
export function inviteErrorCode(error: unknown): "invite_unavailable" | "consent_required" | "already_submitted" | "invalid_attempt" | "unknown";  // PostgREST 오류 → 코드. 메시지 원문을 밖으로 내보내지 않는다
```

테스트에 반드시 포함: 이메일 정규화(대소문자·공백·쉼표·줄바꿈·중복·21개), 마스킹이 `InvitePreview`의 마스킹과 같은 출력, `parseTrailerInviteOpen`이 `dept_id`·`org_id`·`trailer_id` 키가 섞여 들어오면 **null**(strictObject), 시나리오 검증 실패 시 null, `inviteStatusLabel` 전 값에 금지어 없음, `inviteErrorCode`가 알 수 없는 오류의 메시지를 반환값에 포함하지 않음.

## Acceptance Criteria

```bash
npx vitest run tests/trailer-invite.test.ts     # 구현 전 import 실패 → 구현 후 통과 (기록 남길 것)
npm run lint && npx tsc --noEmit && npm run test
```

## 금지사항

- 이 step에서 `app/` 아래 파일을 만들지 마라. 이유: 레이어 1개(lib)만.
- `parseTrailerInviteOpen`을 느슨한 `z.object`로 만들지 마라. 이유: 불변식 20 — 조직·부서 id가 새 키로 새어 나오는 것을 계약이 막아야 한다.
