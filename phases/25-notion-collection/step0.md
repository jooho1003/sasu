# Step 0: notion-api-v2025

노션 어댑터(`lib/notion.ts`)를 API `2025-09-03`으로 전환하고, 대량 수집에 필요한 읽기 함수를 추가한다. DB 스키마·화면·워커는 건드리지 않는다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-01·03·06), §8 "ADR-060 노션 전체 수집 경계"
- `/docs/ADR.md` ADR-060
- `/docs/planning/노션_전체수집_설계.md` §5(발견과 증분·API 버전), §7(호출 제한)
- `/docs/ARCHITECTURE.md` §6 불변식, §8 TDD 예외
- `lib/notion.ts`, `tests/notion.test.ts`, `lib/pipeline/notion-import.ts`, `tests/pipeline/notion-import.test.ts`, `tests/notion-import.test.ts`
- `lib/jobs.ts`의 `retryAt()`(`retryAfterSeconds`를 읽는 방식), `lib/slack/post.ts`(같은 필드를 싣는 선례)
- 노션 공식 문서: upgrade guide 2025-09-03, request limits, search, data source query (버전별 응답 형태를 추측하지 말고 문서로 확인하고 확인일을 기록)

## 작업

테스트를 먼저 쓴다(`tests/notion.test.ts` 확장, `fetch` mock).

1. 버전 헤더를 `2025-09-03`으로 바꾼다.
2. 토큰을 전역에서만 읽지 않게 한다. 시그니처 수준:

```ts
export type NotionAuth = { token: string };
export function runWithNotionAuth<T>(auth: NotionAuth, fn: () => Promise<T>): Promise<T>; // AsyncLocalStorage
```

   컨텍스트가 없을 때만 `process.env.NOTION_TOKEN`을 읽는 **임시** 경로를 남기고 주석으로 "step 2에서 제거"를 적는다. 이 step에서 기존 호출부 동작이 바뀌면 안 된다.
3. `NotionError`에 `retryAfterSeconds?: number`를 추가한다. 429면 `Retry-After` 헤더(정수 초)를 읽어 싣는다. 529(`service_overload`)도 재시도 가능한 오류로 구분한다. 오류 코드를 추가한다: `notion_not_found`(404), `notion_page_too_large`, `notion_database_unsupported`. `lib/jobs.ts`의 `SAFE_ERROR_CODES`에 같은 코드를 추가한다.
4. 읽기 함수:

```ts
export type NotionPageMeta = { id: string; title: string | null; lastEditedTime: string; inTrash: boolean; parent: NotionParent };
export type NotionChildRef = { kind: "page" | "database"; id: string };
export async function fetchNotionPage(pageId: string, options?: { descendChildPages?: boolean }):
  Promise<{ title: string | null; blocks: NotionBlock[]; meta: NotionPageMeta; children: NotionChildRef[]; properties: Record<string, unknown> }>;
export async function listDataSources(databaseId: string): Promise<{ id: string; name: string | null }[]>;
export async function queryDataSource(dataSourceId: string, cursor?: string | null):
  Promise<{ pages: NotionPageMeta[]; nextCursor: string | null }>;
export async function searchNotion(args: { cursor?: string | null; object?: "page" | "data_source"; sortByEditedDesc?: boolean }):
  Promise<{ results: NotionPageMeta[]; nextCursor: string | null }>;
export async function notionWhoAmI(): Promise<{ botId: string; workspaceId: string | null; workspaceName: string | null }>;
```

   - `descendChildPages` 기본값은 `true`(현행과 동일). `false`면 `child_page`·`child_database` 블록을 만났을 때 그 id를 `children`에 넣고 **그 아래로 내려가지 않으며 `blocks`에도 넣지 않는다.** 토글·컬럼 등 다른 `has_children` 블록은 계속 재귀한다.
   - 5,000블록 초과는 `notion_page_too_large`로 구분한다. 잘린 페이지네이션 거부(현행 92행 로직)는 유지한다.
   - POST 요청이 필요하므로 `notionRequest`가 method·body를 받게 한다. 30초 타임아웃 유지.
5. 로그·오류 메시지에 페이지 제목·본문·토큰을 넣지 않는다(id·상태 코드·오류 코드만).

## 코드 관계와 구조 확인

`fetchNotionPage`의 호출자(`lib/pipeline/notion-import.ts`, 테스트)와 `NotionError` 코드를 쓰는 곳(`lib/jobs.ts`, `0030_source_lifecycle.sql`의 `release_notion_sync` 허용 목록, `components/settings-s5.tsx`의 오류 표시)을 검색으로 확인해 `docs/verification/notion-collection/step0.md`에 적는다. `release_notion_sync`는 허용 목록 밖 코드를 `notion_api_failed`로 바꾼다 — 이 step에서는 SQL을 고치지 않고 그 사실만 기록한다(step 3에서 처리).

## Acceptance Criteria

```bash
npx vitest run tests/notion.test.ts tests/notion-import.test.ts tests/pipeline/notion-import.test.ts tests/notion-reimport-route.test.ts
npm run lint && npm run build && npm run test
```

- 테스트에 포함할 것: 버전 헤더 값, 429의 `Retry-After: 7` → `retryAfterSeconds === 7`, 404 → `notion_not_found`, `descendChildPages:false`에서 child_page 아래 블록 요청이 **발생하지 않음**과 `children` 반환, 기본값에서는 현행과 같은 결과, data source 페이지네이션, 컨텍스트 토큰이 환경 변수보다 우선.
- 테스트 워크스페이스 토큰이 제공된 경우에만: 실제 페이지 1개·DB 1개를 읽어 새 버전의 응답 형태를 확인하고 결과(본문 없이 id·개수·형태만)를 기록한다. 없으면 "실제 호출 미실행"으로 적는다.

## 검증 절차

AC 실행 → CLAUDE.md CRITICAL 점검(로그에 본문 없음, 비밀값 없음) → `phases/25-notion-collection/index.json`의 step 0을 `completed`+`summary`(추가된 함수·오류 코드·실제 호출 여부)로 갱신. 3회 수정 후에도 실패면 `error`.

## 금지사항

- `lib/pipeline/notion-import.ts`의 저장 방식(블록=item)을 이 step에서 바꾸지 마라. 이유: 운영 중인 소스의 item id가 바뀌어 열린 카드 근거가 무효화된다(step 3에서 버전으로 분리한다).
- 전역 `NOTION_TOKEN` 읽기를 이 step에서 삭제하지 마라. 이유: 조직별 저장소(step 2)가 생기기 전에는 기존 연결이 끊긴다.
- 노션 SDK 패키지를 추가하지 마라. 이유: 현재 `fetch` 어댑터로 충분하고 의존성·번들 검토가 범위 밖이다.
- 기존 테스트를 깨뜨리지 마라. 다른 세션의 미커밋 파일을 되돌리지 마라. 커밋하지 마라.
