# Desktop companion step 1 — device link schema

- Date: 2026-10-01 KST
- Scope: phase 43 step 1 only
- Migration: `0069_device_links.sql` (the next number after `0068_sales_source_reviews.sql`)
- Production database: not changed

## Implemented contract

`public.device_links` stores one user's department-bound Supabase Auth session, device label, app version, activity time, and revocation state. It has an active-session unique index and an active-user lookup index. Authenticated users have `SELECT` only, limited by `user_id = auth.uid()` RLS. There is no authenticated `INSERT`, `UPDATE`, or `DELETE` grant or policy.

Four security-definer functions follow the design contract:

- `private.current_session_id()` reads only the JWT `session_id` and has no API-role execution grant.
- `public.link_device(...)` requires the current Auth session, current consenting membership, a non-demo organization and account, and at most five other active links. Relinking the same session revokes the previous row with `relink` before inserting the replacement.
- `public.companion_context()` derives the department from the active link, joins the current membership, revokes a link whose membership disappeared, and throttles `last_seen_at` writes to five minutes.
- `public.revoke_device_link(...)` accepts only the link owner, records `user` or `signout`, and deletes the matching `auth.sessions` row in the same transaction.

All four functions use `security definer set search_path = public, pg_temp`. The three public functions grant execution only to `authenticated`; PUBLIC, `anon`, and `service_role` have no execution grant. The private helper has no grant. Error text is generic for membership, consent, demo, and foreign-session failures.

The local rollback removes the four functions and table. Its isolated test also confirms that no function or table remains at the 0069 boundary. Session deletion already performed by the forward RPC is intentionally not reversible.

## Code relationship check

Graft and Archify executables were not available in this environment. I recorded the manual replacement instead of claiming tool output.

Manual search covered:

- canonical `members`, `departments`, and `orgs` definitions and their existing RLS/function references across `supabase/migrations/`;
- private-schema and exact function-grant conventions in `0026_org_admin.sql`;
- demo account/write-stop handling in `0036_demo_reviewer_read_only.sql`;
- current RLS, security-definer, and worker-only grant conventions in `0066_sales_review.sql` and `0067_sales_review_revision.sql`;
- the security matrix, `auth.jwt()` stub, and function privilege arrays in `scripts/verify-security-sql.mjs`.

The new dependency path is:

`auth.uid()` + JWT `session_id` → `auth.sessions` + current `members` → `departments` → `orgs.is_demo` → `device_links`.

This step does not call or modify `can_see()`: it checks only current membership and consent for the device-to-department binding. Later resource reads continue through their existing RLS and `can_see()` paths. No request-path service-role client was added.

## SQL harness evidence

Command:

```powershell
node scripts/verify-device-links-sql.mjs
```

Result: 8 passed, 0 failed, rollback verified. Covered:

1. own-row read, foreign-row invisibility, and direct-write denial;
2. nonmember, unconsented, demo organization, demo account, missing session, mismatched session denial;
3. sixth active link denial and relink-at-limit behavior;
4. same-session replacement with `relink` and no premature Auth session deletion;
5. current role plus five-minute activity throttling;
6. membership deletion causing zero context rows and automatic `membership` revocation;
7. foreign-owner revoke returning false, owner revoke deleting `auth.sessions`, and self revoke using `signout`;
8. exact function privileges and the active/revoked state constraint.

Command:

```powershell
node scripts/verify-security-sql.mjs
```

Result: 316 passed, 0 failed. The existing cross-product matrix remained 4 organizations, 12 departments, 24 actors, 72 items, and 2,016 assertions. The new table has no authenticated or anonymous direct writes. PUBLIC and anonymous execution on all four new functions is zero; only the three public functions are executable by authenticated users.

## Local Supabase session evidence

The local-only review QA project was used. `review_qa_migrations` contains `0069_device_links.sql`; no remote migration command was run.

Commands:

```powershell
node scripts/review-qa.mjs setup
node scripts/verify-device-links-sql.mjs --local
```

Result: the OTP-created device session linked successfully, `companion_context()` returned its current department, and a separate web session revoked the link. The device session row disappeared from the real local `auth.sessions` table. The old access token then returned Auth HTTP 403 `session_not_found`, Supabase JS returned `AuthSessionMissingError` with no user, and refresh was rejected. The RPC owner was `postgres`; failed checks were zero. This reproduces step 0 G1/G2 through the actual 0069 RPC rather than the temporary gate function.

## Acceptance criteria

| Check | Result |
|---|---|
| `node scripts/verify-security-sql.mjs` | PASS — 316/316 |
| `node scripts/verify-device-links-sql.mjs` | PASS — 8/8, rollback verified |
| `npm run lint` | PASS — blocking 0; existing wording warnings 80 |
| `npm run build` | PASS — Next.js 16.3.4 production build |
| `npm run test` | PASS — 172 files, 1,788 tests |
| `git diff --check` | recorded after the phase index update |

The first build invocation encountered another active `next build` lock. After that process completed, the same command passed; no lock file or build process was forcibly removed.

## Architecture checklist

- `can_see()` remains the sole content-visibility function and was not duplicated or modified.
- Department identity comes from the session-bound device link after `link_device`; no new application request path accepts an authoritative department ID.
- The migration adds no request-path service-role use.
- Direct table writes stay closed; state changes are RPC-only.
- Function execution grants are explicit and minimal.
- Demo organization and fixed demo account links fail with the same generic authorization error.
- Production application remains gated by invariant 22: this migration is local-only until later security, E2E, review, and user approval.
