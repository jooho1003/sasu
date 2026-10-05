# Step 1 검증: legacy-redirect

## Red (구현 전)
`npx vitest run tests/site.test.ts tests/proxy.test.ts` -> 2 files failed, 12 failed | 38 passed (50).
`legacyHostRedirect is not a function` (U1 전부), proxy 308 케이스 실패.

## Green (구현 후)
- `npx vitest run tests/site.test.ts tests/proxy.test.ts tests/site-guide.test.ts` -> 3 files passed, 53 tests passed.
  - U1 (`tests/site.test.ts`): 11개 it(`it.each` 확장 포함 12 케이스).
  - U2 (`tests/proxy.test.ts`): 4 케이스(308+Location+no-store, POST /api/companion/ask 비이동, 다른 호스트, env 미설정).
- `npx eslint lib/site.ts proxy.ts tests/site.test.ts tests/proxy.test.ts` -> 출력 없음(통과).
- `npx tsc --noEmit -p .` -> 오류 없음.

## 변경
- `lib/site.ts`: `legacyHostRedirect` 추가(목적지 origin은 항상 `metadataBase(env)`, `/api`·`/api/*` 비이동).
- `proxy.ts`: `protect` 직후 호출, 값이 있으면 `protect(NextResponse.redirect(target, 308))`.

## root 리뷰 보완 (2026-10-05)
- 발견: `new URL(pathname + search, canonical)`은 `//evil.example/x`·`/\evil.example/x`를 다른 호스트로 해석해 오픈 리디렉션이 된다(옛 호스트에서 `https://sasu-alpha.vercel.app//evil.example/x` 요청 시).
- red: `tests/site.test.ts`에 경로 3종(`//evil.example/x`, `/\evil.example/x`, `/\/evil.example`)이 목적지 origin을 바꾸지 못하는 케이스 추가 → 3 failed | 36 passed.
- 수정: 정식 origin URL을 복사해 `pathname`·`search`만 덮어쓴다.
- green: `npx vitest run tests/site.test.ts tests/proxy.test.ts tests/site-guide.test.ts` → 3 files, 56 passed.
