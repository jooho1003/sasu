# Step 5: trailer-public-page

## 읽어야 할 파일

- `/docs/PRD.md` §3-1(phase 7 합성 체험 경계) · §11 "예고편 발행" 행의 `public_trailer`·철회 후 404 항목
- `/docs/ARCHITECTURE.md` §6-1 전체 · §6-2 불변식 20
- `/docs/ADR.md` ADR-040·041·045 3항
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-3 "공개 조회"·"표시" · §C-5 S20 · §L1 고칠 것 8·10 · §L2 고칠 것 4·7 · §L5 2
- step 1 산출물: `public_trailer` RPC 계약(0027)
- `components/recruitment-trailer.tsx`(13행 props, 101행 HUD의 `/ 3`), `components/trailer-office.tsx`, `app/trailers/page.tsx`, `fixtures/trailer/scenarios.ts`, `lib/trailer.ts`, `tests/e2e/trailer.spec.ts`, `tests/e2e/trailer-disabled.spec.ts`, `playwright.trailer.config.ts`
- `lib/site.ts`(`trailerDemoHref`), `tests/site.test.ts`, `lib/supabase/public.ts`, `lib/features.ts`

## 작업

phase 7 컴포넌트는 커밋된 상태(플랜 B0)에서만 수정한다. `git log --oneline -- components/recruitment-trailer.tsx`로 커밋이 있는지 먼저 확인하고, 없으면 수정하지 말고 `blocked`(`phase 7 미커밋`)로 멈춘다. 이유: PRD §3-2 "phase 7과의 순서".

### 1. `lib/trailer-public.ts` (순수, TDD)

```ts
export const PUBLIC_TRAILER_SLUG = /^[a-z0-9]{22}$/;
export function parsePublicTrailer(data: unknown):
  | { status: "ok"; scenarios: TrailerScenario[]; applyUrl: string | null }
  | { status: "invalid" };
```

- 입력은 `z.strictObject({ scenarios, apply_url })` — 키가 하나라도 더 있으면 `invalid`(공개 payload 화이트리스트를 앱에서도 확인).
- 시나리오 1~3개, 각각 `validateScenario` 통과, id 중복 없음. `apply_url`은 null 또는 `https:` URL.
- 실패는 전부 `invalid`(fail-closed). 오류 원문을 반환하지 않는다.

### 2. 공개 체험 `app/t/[slug]/page.tsx` (S20)

- `export const dynamic = "force-dynamic"`, `metadata.robots = { index: false, follow: false }`.
- `trailerPublishEnabled()` false → `notFound()`. slug가 `PUBLIC_TRAILER_SLUG`에 안 맞으면 DB 호출 없이 `notFound()`.
- `createPublicSupabaseClient().rpc("public_trailer", { p_slug })`:
  - RPC 오류(연결 실패, `trailer_schema_unsupported` 포함) → **오류 화면**("잠시 후 다시 시도해주세요"). 404로 보이지 않게 한다(설계 §L2 고칠 것 7).
  - `null` → `notFound()`(철회·없는 링크).
  - 값 → `parsePublicTrailer` → `invalid`면 오류 화면.
- 캐시하지 않는다. 이유: 철회하면 다음 요청부터 바로 404여야 하고, `revalidateTag`를 쓸 필요가 없어진다(플랜 design_deltas).
- 로그는 slug 길이와 오류 코드만.

### 3. phase 7 컴포넌트 props 확장 (`components/recruitment-trailer.tsx`)

```ts
export function RecruitmentTrailer(props: {
  scenarios: TrailerScenario[];
  applyUrl?: string | null;   // 기록실 끝 링크
  notice?: string | null;     // 첫 화면 고정 고지
}): JSX.Element;
```

- `notice`가 있으면 입장 화면과 게임 HUD 위에 항상 보이게 한다. 공개 페이지는 "이 체험의 회사·인물·수치는 가상화되었습니다"를 넘긴다.
- 전체 회고(기록실 끝)에 `applyUrl`이 있으면 "이 회사 공고 보기"(`https:`만, `target="_blank" rel="noopener noreferrer"`), 없으면 "사수 알아보기"(`/`).
- HUD의 `/ 3`을 `/ {scenarios.length}`로 바꾸고 시나리오 1~2개에서도 완주·회고가 동작하게 한다.
- 기존 `/trailers`(props 없음) 동작과 phase 7 E2E는 그대로 통과해야 한다. 플레이 데이터를 서버로 보내는 코드·스토리지·분석을 추가하지 않는다(ADR-040 경계 유지).

### 4. 메인 예고편 링크 조건 (`lib/site.ts`, 테스트 먼저)

- `SASU_TRAILER_DEMO_PATH`는 `SASU_TRAILER_PUBLISH_ENABLED === "true"`일 때만 쓴다. 발행 플래그가 꺼져 있으면(컷 ④) 기존처럼 `SASU_TRAILER_PREVIEW_ENABLED`의 `/trailers`로 떨어진다.
- 경로 정규식은 `/t/` + `[a-z0-9]{22}`를 받아야 한다(현재 정규식이 이미 받는지 테스트로 확인하고, 받지 못할 때만 고친다).

## Acceptance Criteria

```bash
npm run test -- tests/trailer-public.test.ts tests/site.test.ts tests/trailer.test.ts tests/trailer-fixtures.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
npm run e2e:trailer        # phase 7 회귀: 기존 6개 통과
```

- 플래그 없이 띄운 로컬 서버에서 `/t/abcdefghijklmnopqrstuv` → 404, `/t/INVALID` → 404(한 번 실행해 결과를 summary에 적는다).

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 공개 페이지가 public 클라이언트와 `public_trailer`만 쓰는가 · DB 오류와 없는 링크를 구분하는가 · 컴포넌트가 네트워크 전송·스토리지를 추가하지 않았는가 · `/trailers` 기존 경로가 그대로인가.
3. `phases/11-trailer-publish/index.json` step 5를 갱신한다.

## 금지사항

- `lib/trailer.ts`·`TrailerScenario` 계약을 바꾸지 마라. 이유: 저장된 jsonb(`schema_version=1`)와 phase 7 fixture가 같은 계약을 쓴다.
- 공개 페이지에 분석 스크립트·쿠키·쓰기 요청을 넣지 마라. 이유: ADR-045 3항.
- `robots.ts`에 발행 slug를 나열하지 마라. 이유: 링크를 공개 목록으로 만드는 셈이다. noindex 메타로 충분하다.
- 게스트 예고편 화면과 시드를 만들지 마라. 이유: step 6 범위다.
