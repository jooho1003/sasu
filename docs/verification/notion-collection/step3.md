# Phase 25 · Step 3 검증 기록 — import-v2

검증일: 2026-09-18  
상태: **completed**

## 변경 파일

- `supabase/migrations/0039_notion_import_v2.sql` — 기존 소스 기본값을 `import_version=1`·`ingest_mode='classify'`로 유지하면서 v2 청크 수집 컬럼, 부서별 활성 페이지 부분 유니크 인덱스, reference 직접 임베딩 예약, 편집 시각 저장, retire·명시적 v2 전환 RPC를 추가했다.
- `lib/pipeline/notion-import.ts` — v1은 기존 재귀 블록 수집을 유지하고, v2만 하위 페이지 비재귀 조회 → 헤딩 청크 → 편집 시각 저장으로 분기한다. 404·휴지통 페이지는 retire하고 `children`을 반환한다.
- `lib/pipeline/embed.ts` — v2 item의 임베딩 입력에만 마스킹한 소스 제목을 앞에 붙인다. `items.content`와 v1 임베딩 입력은 바꾸지 않는다.
- `app/api/d/[dept]/settings/notion/route.ts` — 팀장의 여러 줄 직접 등록(빈 줄 제외 최대 50개), 줄별 성공·기존·실패 결과, 활성 중복 재사용, v2/classify 신규 소스, 명시적 전환 RPC 호출을 추가했다.
- `app/api/d/[dept]/settings/route.ts`, `components/settings-s5.tsx` — 설정 응답에 `import_version`을 포함하고, 여러 줄 입력·줄별 결과·기존 소스의 `[새 방식으로 전환]` 경고 버튼을 필요한 부분에만 추가했다.
- `tests/notion-import.test.ts`, `tests/notion-reimport-route.test.ts`, `tests/pipeline/embed.test.ts` — v1 호환, v2 청크/children/편집 시각, 404·휴지통 retire, 여러 줄·중복·50개 상한·전환, v2 제목 마스킹 임베딩을 검증한다.
- `scripts/verify-notion-import-v2-sql.mjs`, `scripts/verify-security-sql.mjs` — Step 2의 격리 PGlite 하니스에 Step 3 SQL/RLS 시나리오 7개를 연결했다.
- `docs/verification/notion-collection/step3.md`, `phases/25-notion-collection/index.json` — 이 실행 기록과 Step 3 상태를 갱신했다.

## migration 중복 사전 확인

`0039_notion_import_v2.sql`의 부분 유니크 인덱스 바로 앞과 이 기록에 같은 사전 확인 쿼리를 남겼다.

```sql
select dept_id, external_id, count(*)
from public.sources
where kind = 'notion_page' and active
group by dept_id, external_id
having count(*) > 1;
```

행이 나오면 자동 삭제·병합하지 않고 migration이 실패해야 한다. 격리 PGlite의 전체 migration 적용과 중복 insert 거부(`23505`)를 확인했다. 운영 DB에는 조회·적용하지 않았다.

## 코드 관계·구조 확인

- `finish_notion_sync`의 런타임 호출자는 `lib/pipeline/notion-import.ts` 하나다. SQL 하니스의 기존 v1 호출은 새 마지막 인자의 기본값으로 계속 동작한다.
- v1은 `fetchNotionPage(id)`와 `toNotionItems`를 그대로 사용한다. v2만 `fetchNotionPage(id, { descendChildPages: false })` → `chunkNotionBlocks({ blocks, properties })` → 새 `finish_notion_sync(..., p_remote_edited_at)` 경로를 탄다.
- classify 소스는 기존대로 `finish_notion_sync`가 `classify`를 예약하고, `classifyItem`이 분류 저장 성공 뒤 `enqueue('embed', ..., dedupeKey=item:version)`를 예약한다. reference 소스는 분류를 만들지 않고 SQL이 곧바로 `embed`를 예약한다.
- SQL 예약 ID는 TS SHA-256 ID를 복제하지 않고 `md5('source-embed:' || item_id || ':' || content_version)` 전용 접두를 선택했다. 같은 스냅샷은 job이 늘지 않고, 본문 변경은 새 버전 job 1개만 만든다. 다른 경로가 같은 버전 임베딩을 중복 실행해도 `complete_item_embedding(item, version, ...)`이 현재 버전만 반영한다. PGlite에서 stale version=false/current version=true를 확인했다.
- 최신 `search_as` 정의(`0009_voyage_embeddings_search.sql`)는 `items.embedding`·`embed_model`·`can_see()`만 사용하고 `classifications`를 조인하지 않는다. 따라서 reference item은 임베딩 완료 뒤 검색되며 Step 3 차단 조건에 해당하지 않는다. `can_see()`와 RLS 정책은 수정하지 않았다.
- 실사용 대시보드는 각 분류 탭 요청에 `label=`을 보내고 `/api/d/[dept]/items`가 `classifications!inner`를 사용한다. 따라서 classification이 없는 reference Notion item은 분류 탭에는 나타나지 않는다. 전체/오늘 문서 카운트에는 포함되고, 임베딩 완료 뒤 ASK 검색 근거로는 사용된다. label 없는 API 응답은 classification 부재를 `unclassified`로 매핑하지만 현재 대시보드 탭 흐름은 그 경로를 쓰지 않는다.
- Graft·Archify는 PATH에서 찾지 못했다. `rg`와 실제 파일 읽기, 전체 build·PGlite 실행으로 의존 관계와 실행 흐름을 확인했으며 도구 결과는 없다.

## 실행 명령과 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/pipeline/notion-import.test.ts tests/notion-import.test.ts tests/notion-reimport-route.test.ts tests/notion-chunk.test.ts tests/pipeline/embed.test.ts` (구현 전) | 예상 실패 — 5 files 중 3 failed, 11 tests failed / 15 passed. v2 분기·제목 입력·여러 줄·전환이 아직 없음을 확인했다. |
| 같은 5파일 명령 (구현 후) | 성공 — 5 files, 26 tests |
| `npx vitest run tests/pipeline/notion-import.test.ts tests/notion-import.test.ts tests/notion-reimport-route.test.ts tests/notion-chunk.test.ts` | 성공 — Acceptance Criteria 4 files, 21 tests |
| `npm run lint && npm run build && npm run test` | 첫 시도는 lint 성공 뒤 다른 세션의 `next build` 잠금으로 중단. 해당 빌드가 자연 종료한 뒤 같은 명령을 재실행해 성공 — lint, Next.js 16 production build·TypeScript, 101 files / 1,144 tests |
| `node scripts/verify-security-sql.mjs 'D:/바이브코딩/.sasu-qa-db'` | 성공 — isolated PGlite 186 checks, failed 0, 권한 행렬 2,016 assertions |
| `git diff --check -- <Step 3 변경 경로>` | 오류 없음. 기존 Windows LF/CRLF 변환 경고만 출력 |

Vitest는 기존 Vite native config loader·`vite-tsconfig-paths` 경고를 출력했으나 실패는 없었다. PGlite는 `0004_worker_cron.sql`을 `pg_cron`/`pg_net` 미지원으로 기존과 같이 제외했다.

## 로컬 PGlite SQL/RLS 확인

1. 기존 source 기본값은 v1/classify이며 동일 스냅샷 재수집 뒤 item 수·id·`content_version`·classify job 수가 그대로다.
2. v2/reference snapshot은 item당 classify 0건, embed 1건이며 임베딩 완료 뒤 lead의 `search_as` 결과에 포함된다.
3. 같은 reference snapshot 재수집은 item/job을 늘리지 않는다. 본문 변경은 `content_version`을 1 올리고 해당 버전 embed job 1건만 추가하며 classify는 0건이다.
4. stale 임베딩 완료는 거부되고 현재 버전만 반영된다.
5. retire는 소스를 비활성화하고 item 본문·벡터를 소프트 삭제하지만 기존 decision citation `quote`는 보존한다.
6. 같은 부서·같은 활성 Notion 페이지의 두 번째 행은 부분 유니크 인덱스가 `23505`로 거부한다.
7. `retire_notion_source`는 service role 전용이고, 일반 멤버의 `convert_notion_source_v2`는 `42501`, 부서장은 v2 전환과 import job 1건 예약에 성공한다.

## CRITICAL 점검

- v2 저장 본문은 `chunkNotionBlocks`가 블록 단위 선마스킹한 결과이며 마스킹 전 본문을 저장·로그하지 않는다. 제목은 임베딩 직전에 다시 마스킹하고 `items.content`에는 붙이지 않는다.
- v1 수집·임베딩 입력은 기존 형태를 유지한다. migration은 기존 행을 v2로 일괄 전환하지 않는다.
- reference item에 가짜 classification을 만들지 않았다. 분류 LLM·자동 카드 승격 경로를 타지 않는다.
- retire가 item 파생물을 무효화해 열린 카드는 재검토 상태가 되지만 decisions/citations는 수정·삭제하지 않는다. 전체 Vitest의 카드·답변 인용 검증 회귀와 PGlite의 결정 quote 보존이 통과했다.
- 요청 경로는 세션 클라이언트를 유지하고 `dept_id`는 멤버십에서 정한다. worker 내부 수집만 기존 service role을 사용한다.

## 미실행 항목

- 테스트 워크스페이스 토큰이 제공되지 않아 실제 Notion API 호출은 실행하지 않았다.
- 운영 DB 중복 조회·migration 적용, `npx supabase db push`, 운영 배포, 실제 외부 워크스페이스 호출은 요청 범위상 실행하지 않았다.
- Graft·Archify는 설치 경로에서 찾지 못해 실행하지 않았다.

## 오케스트레이터 리뷰 (2026-09-18, Claude)

- 확인: 0039는 기존 소스를 `import_version=1`로 두고 `finish_notion_sync`·`invalidate_item_derivatives`가 `ingest_mode`로 classify/embed를 가른다. Slack 등 다른 소스는 기본값 `classify`라 동작이 바뀌지 않는다. 404·휴지통은 lease를 쥔 채 `retire_notion_source`로 비활성·소프트 삭제하고 결정 인용은 건드리지 않는다. 부분 유니크 인덱스는 중복이 있으면 migration이 실패하도록 두었고 운영 적용 전 preflight 쿼리가 주석에 있다.
- 다른 세션이 같은 시각에 `0040_trailer_invites.sql`을 만들었다. 번호 충돌 없음. 운영 적용 시 0038→0039→0040 순서를 확인한다.
- 재실행: PGlite 하니스 186 passed / 0 failed, `npx vitest run tests/notion tests/pipeline/embed.test.ts tests/pipeline/notion-import.test.ts` → 11 files / 51 tests 통과, eslint 출력 없음.
- 미검증 유지: 실제 노션 응답. 운영 적용 전 preflight 중복 쿼리 실행.

