# Step 4: retro-api

세션 클라이언트 + RPC로 회고 라우트를 만든다. 화면은 step 5.

## 읽어야 할 파일

- `/docs/PRD.md` §3-6 (RET-04·05·06·08) · `/docs/ARCHITECTURE.md` §3.4·§6 불변식 2·3·9·§6-4
- `docs/planning/개발_회고_자동화_설계.md` §4(RPC 표)·§6·§8
- `app/api/d/[dept]/reviews/route.ts` · `app/api/d/[dept]/reviews/[id]/route.ts` — 라우트 골격·`requireMembership`·`readResponse` 오류 형식·읽기 시점 2분 방어(`:73-79`)
- `lib/supabase/membership.ts` · `lib/jobs.ts` `kickWorker` · `lib/retro/{bundle,export}.ts` (step 1)
- `lib/reviews.ts` `reviewError` — 에러 코드 → 한국어 메시지 매핑 방식

## 작업

| 라우트 | 메서드 | 동작 |
|---|---|---|
| `app/api/d/[dept]/retros/route.ts` | GET `?from&to&user&topic&mine=1` | `requireMembership` → 세션 `rpc("retro_timeline", …)` → 200 `{days: RetroDayRow[]}`. 남의 `self`는 RLS가 이미 거른다. **"N건 제외" 미표시** |
| 〃 | POST body `{id, date, tz, bundle: RetroBundle \| null}` | `requirePageMembership`(동의 게이트) → `parseRetroBundle`(null이면 Tier 0만: 빈 activities) → `rpc("create_retro_day", …)` → `kickWorker()` → 202 `{id, activity_count, job_id}`. 본문 1MB 초과는 파싱 전에 413 |
| `app/api/d/[dept]/retros/[id]/route.ts` | GET | day + 활동(`retro_activities`) + 최신 revision + 확정 revision. `drafting`이 2분 넘었으면 응답에서만 `failed/timeout`(검토함 `:73-79` 복제) |
| 〃 | PATCH body `RetroEdit` | `rpc("save_retro")`. `40001` → 409 `stale_retro` |
| 〃 | POST body `{action, …}` | `confirm{revision}` · `regenerate` → `kickWorker()` · `exclude{activity_id, excluded}` · `visibility{visibility}` (`visibility_narrower_source` → 409) · `delete` |
| `app/api/d/[dept]/retros/[id]/export/route.ts` | GET `?format=md` | 확정 revision만(없으면 409 `not_confirmed`) → `retroMarkdown` → `text/markdown; charset=utf-8`, `content-disposition: attachment; filename*=UTF-8''retro-<date>.md`, `cache-control: private, no-store`. 세션으로 `retro_exports` insert는 RPC `record_retro_export(p_day, p_revision, 'markdown')`(이 step에서 `0046`에 추가하지 말고 `0047_retro_exports_rpc.sql`로 분리) |

- `lib/retro/errors.ts` (TDD): 코드 → 메시지(`stale_retro` "다른 곳에서 먼저 저장됐어요. 새로고침 후 다시 시도해 주세요" 등). 라우트는 이 매핑만 쓴다.
- 모든 라우트는 `createServerSupabaseClient()`만. 로그는 `retro <route> day=<id> code=<…>`.

## Acceptance Criteria

```bash
npm run test -- tests/lib/retro/errors.test.ts
npm run lint && npx tsc --noEmit && npm run build
# 로컬 QA DB + 로그인 세션으로 (curl 또는 Playwright request):
#  POST 번들 → 202 · 같은 날 재POST → 202 같은 id · sasu_* kind → 400 · 1.1MB → 413
#  GET 상세: drafting 2분 초과 → status failed/timeout
#  PATCH 옛 revision → 409 stale_retro · POST visibility dept(좁은 원본) → 409
#  GET export 미확정 → 409 · 확정 후 → 200 text/markdown
```

## 금지사항

- `createServiceSupabaseClient()`를 이 디렉터리에서 import하지 마라. 이유: CRITICAL — 사용자 경로 service role 금지.
- 요청 본문의 `user_id`·`dept_id`·`author`를 받지 마라. 이유: 행위자는 세션.
- 목록 응답에 남의 `self` 회고 개수·존재 여부를 어떤 형태로도 넣지 마라. 이유: "N건 제외" 미표시 규칙.
- 인용 검증을 TS에서 생략하고 SQL만 믿지 마라 — PATCH 전에 `verifyRetroDraft`로 한 번 더 걸러 409를 낸다. 이유: 불변식 25 3중 검증.
