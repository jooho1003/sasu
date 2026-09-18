# Phase 25 · Step 0 검증 기록 — Notion API 2025-09-03

검증일: 2026-09-18

## 변경 파일

- `lib/notion.ts`: API 헤더를 `2025-09-03`으로 전환하고 요청별 `AsyncLocalStorage` 토큰 컨텍스트, 429/529 재시도 힌트, 페이지·데이터 소스·검색·현재 봇 읽기 함수를 추가했다. 컨텍스트가 없을 때의 `NOTION_TOKEN` fallback은 step 2에서 제거한다고 코드에 명시했다.
- `lib/jobs.ts`: `notion_not_found`, `notion_page_too_large`, `notion_database_unsupported`를 안전한 job 오류 코드에 추가했다.
- `tests/notion.test.ts`: 버전 헤더, 429 `Retry-After`, 404, 하위 페이지 비재귀/기본 재귀, data source 페이지네이션 POST, 요청별 토큰 우선 순위의 fetch mock 테스트를 먼저 추가했다.
- `phases/25-notion-collection/index.json`: step 0 완료 상태와 요약을 갱신했다.

`lib/pipeline/notion-import.ts`의 블록=item 저장 방식은 변경하지 않았다.

## 코드 관계·구조 확인

- `fetchNotionPage` 호출자는 `lib/pipeline/notion-import.ts`와 `tests/notion.test.ts`다. import 파이프라인은 `page.blocks`만 사용하므로 확장된 반환값은 기존 호출을 바꾸지 않는다.
- `NotionError` 코드는 `lib/jobs.ts`의 `SAFE_ERROR_CODES`, `lib/pipeline/notion-import.ts`의 release 경로, `supabase/migrations/0030_source_lifecycle.sql`의 `release_notion_sync` 허용 목록과 관계가 있다. SQL 허용 목록은 현재 세 코드만 허용하고 나머지를 `notion_api_failed`로 바꾸며, 이 step에서는 SQL을 변경하지 않았다(step 3 처리).
- `components/settings-s5.tsx`는 현재 노션 소스의 동기화 상태·재시도 UI만 표시하며 오류 코드별 분기는 없다.
- Graft·Archify는 PATH에서 찾지 못했다. 따라서 위 `rg` 검색과 실제 파일 읽기로 관계를 확인했으며 도구 결과는 없다.

## 외부 문서 확인

2026-09-18에 Notion 공식 문서의 `2025-09-03` [upgrade guide](https://developers.notion.com/guides/get-started/upgrade-guide-2025-09-03), [request limits](https://developers.notion.com/reference/request-limits), [Search](https://developers.notion.com/reference/post-search), [Retrieve database](https://developers.notion.com/reference/retrieve-a-database), [users/me](https://developers.notion.com/reference/get-self)를 확인했다. 데이터베이스에서 `data_sources[]`를 발견하고 data source query와 Search POST를 쓰며, 429/529의 정수 초 `Retry-After`를 존중하는 형태를 구현했다.

## 실행 명령과 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/notion.test.ts tests/notion-import.test.ts tests/pipeline/notion-import.test.ts tests/notion-reimport-route.test.ts` | 성공 — 4 files, 17 tests |
| `npm run lint` | 성공 |
| `npm run build` | 성공 — Next.js production build 및 TypeScript 검사 통과 |
| `npm run test` | 성공 — 94 files, 1,112 tests |
| `git diff --check` | 오류 없음 (작업 트리의 기존 파일 줄 끝 경고만 출력) |

Vitest는 기존 `vitest.config.ts` CommonJS/ESM native loader 경고를 출력했으나, 모든 테스트는 통과했다.

## CRITICAL 점검

- 어댑터에 `console.*` 로그를 추가하지 않았고, 오류 메시지는 본문·제목·토큰을 포함하지 않는다.
- 토큰은 요청 헤더에만 사용하며 새 비밀값이나 외부 전송을 추가하지 않았다.
- 운영 DB·배포·실제 외부 워크스페이스 호출을 수행하지 않았다.

## 미실행 항목

- 테스트 워크스페이스 토큰이 제공되지 않아 실제 Notion 페이지/데이터베이스 호출 검증은 미실행이다.
- 운영 DB migration, 배포, 실제 외부 워크스페이스 호출은 요청 범위상 미실행이다.

## 오케스트레이터 리뷰 (2026-09-18, Claude)

- `lib/jobs.ts`: Codex가 파일 전체를 포매터로 다시 정렬했다(기능 변경 없음). HEAD로 되돌리고 `SAFE_ERROR_CODES`에 `notion_database_unsupported`·`notion_not_found`·`notion_page_too_large` 3줄만 다시 넣었다. 이유: 다른 세션과의 충돌·리뷰 잡음 방지.
- `lib/notion.ts` 보완: `NotionPageMeta.object`(`page`|`data_source`|`unknown`) 추가 — 검색이 두 종류를 섞어 돌려주므로 호출자가 구분해야 한다. `inTrash`는 `in_trash` 또는 `archived`가 true일 때 참.
- 확인: 기본값(`descendChildPages` 생략)은 기존과 같은 블록 결과, 전역 토큰 임시 경로 유지(step 2에서 제거), 로그 출력 없음.
- 재실행: `npx vitest run tests/notion.test.ts tests/notion-import.test.ts tests/pipeline/notion-import.test.ts tests/notion-reimport-route.test.ts tests/jobs.test.ts` → 5 files / 36 tests 통과.
- 남은 미검증: 실제 노션 워크스페이스에서 `2025-09-03` 응답 형태(`/users/me`의 `workspace_id`, `data_sources[]`, 검색 필터 `data_source`). 테스트 워크스페이스 토큰이 필요하다.
