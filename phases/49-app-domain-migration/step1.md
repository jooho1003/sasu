# Step 1: legacy-redirect

## 읽어야 할 파일

- `/AGENTS.md`
- `/docs/ARCHITECTURE.md` §6-13 불변식 52 · §8 테스트 경계
- `/docs/ADR.md` ADR-088 결정 3
- `/docs/PRD.md` §8 "운영 주소 이전 범위"
- `/docs/02-design/features/app-domain-migration.design.md` §2 흐름 · §4 E-C3·E-C4 · §6 · §7 · §8 U1·U2 · §9
- `node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md` (이 Next.js 버전의 proxy 계약)
- `lib/site.ts`, `tests/site.test.ts`
- `proxy.ts`, `tests/proxy.test.ts`

## 작업

1. 테스트 먼저(`tests/site.test.ts`에 U1 추가, red 확인) → `lib/site.ts`에 추가:
   ```ts
   export function legacyHostRedirect(
     input: { host: string | null; pathname: string; search: string },
     env?: SiteEnvironment, // 기본 process.env
   ): string | null; // 이동할 절대 URL 또는 null
   ```
   규칙:
   - `env.SASU_LEGACY_HOSTS`를 쉼표로 나누고 trim·소문자화한다. 호스트명 형식(`^[a-z0-9.-]+$`)이 아닌 항목은 버린다. 목록이 비면 null.
   - 요청 호스트는 소문자화하고 포트를 뗀다. 목록에 없으면 null.
   - 정식 주소 `metadataBase(env)`가 `https:`가 아니면 null. 요청 호스트가 정식 호스트(포트 뗀 값)와 같으면 null(루프 방지).
   - `pathname === "/api"` 또는 `pathname.startsWith("/api/")`이면 null. `/apix`는 이동한다.
   - 그 밖이면 `new URL(pathname + search, metadataBase(env)).toString()`.
   - U1 케이스는 design §8 U1 전부.
2. `proxy.ts`(U2 테스트 먼저): `protect` 정의 직후, 예고편 404 검사보다 먼저 `legacyHostRedirect({ host: request.headers.get("host"), pathname: request.nextUrl.pathname, search: request.nextUrl.search })`를 호출하고, 값이 있으면 `return protect(NextResponse.redirect(target, 308))`. 나머지 흐름은 바꾸지 않는다.
   - U2: 옛 호스트 GET `/login` → 308·Location 정확·`Cache-Control`에 `no-store` · 옛 호스트 POST `/api/companion/ask` → 308 아님 · 다른 호스트 → 기존 동작 · `SASU_LEGACY_HOSTS` 미설정 → 기존 동작. 테스트에서 `NEXT_PUBLIC_APP_URL=https://getsasu.com`, `SASU_LEGACY_HOSTS=sasu-alpha.vercel.app`을 stub한다. `NextRequest`의 host 헤더와 URL 호스트가 다를 수 있으니 URL을 `https://sasu-alpha.vercel.app/...`로 만들고 필요하면 `headers: { host }`도 넣는다.
3. 함수 위에 한 줄 주석: 왜 `/api/*`를 이동하지 않는지(설치된 데스크톱 Bearer, 불변식 52).

## Acceptance Criteria

```bash
npx vitest run tests/site.test.ts tests/proxy.test.ts tests/site-guide.test.ts
npx eslint lib/site.ts proxy.ts tests/site.test.ts tests/proxy.test.ts
npx tsc --noEmit -p .
```

## 검증 절차

1. AC를 실행하고 red→green 결과와 케이스 수를 `docs/verification/49-app-domain-migration/step1.md`에 적는다.
2. 성공 → index.json step 1 `completed` + summary. 3회 실패 → `error`.

## 금지사항

- `/api/*`를 이동하지 마라. 이유: 데스크톱 0.1.0~0.1.2가 옛 주소로 Bearer를 보내며, 다른 출처 리디렉션에서 Authorization이 빠져 401 → 세션 삭제가 된다.
- 이동 목적지의 호스트로 요청의 호스트·`x-forwarded-host`·쿼리 값을 쓰지 마라. 이유: 오픈 리디렉션. 목적지 origin은 항상 `metadataBase()`.
- `metadataBase()`의 기존 계약·우선순위를 바꾸지 마라. 이유: 20여 곳이 쓴다.
- `vercel.json`·`next.config.ts`에 redirect를 넣지 마라. 이유: 병합 즉시 활성화되어 전환 순서가 깨진다(설계안 A 기각 사유).
- `npm run build`·전체 test·e2e 실행 금지(동시 step), 훅 우회 금지, `lib/pipeline/**`·`app/**` 수정 금지, 커밋·푸시 금지.
