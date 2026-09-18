# Phase 25 · Step 6 검증 기록 — poll-reconcile

검증일: 2026-09-18

## 변경 파일

- `supabase/migrations/0043_notion_poll_reconcile.sql`: 설치별 poll 워터마크·다음 poll/재조정 시각, 비데모 활성 설치의 bulk `notion_poll`, idle root의 일일 `notion_discover(reconcile:true)` 예약을 추가했다. 설치 행의 전용 poll cursor는 API cursor·페이지 offset·최초 회차 시작시각을 함께 보존해 root의 discover cursor와 경합하지 않는다. 재조정은 source별 seen 시각을 기록해 완주 뒤 트리에서 사라진 source와 다른 부서의 더 가까운 subtree에 속한 workspace source를 비활성화하고 item을 소프트 삭제한다. 모든 신규 워커 RPC는 service role 전용이다.
- `lib/notion.ts`: 본문을 반환하지 않는 페이지 메타 조회, 블록 자식 참조 조회, block/data source 부모 조회를 추가했다.
- `lib/pipeline/notion-poll.ts`, `lib/pipeline/notion-discover.ts`, `lib/worker.ts`: poll의 40초 cursor+offset 재개, `block_id` 최대 5단계 및 `data_source_id`의 database 부모 해석, 메타/자식 참조만 쓰는 재조정 트리 순회와 bulk continuation을 연결했다. 재조정 API 실패는 cursor를 보존하고 retire를 실행하지 않는다.
- `tests/notion.test.ts`, `tests/pipeline/notion-poll.test.ts`, `tests/pipeline/notion-discover.test.ts`, `tests/worker.test.ts`: 메타 전용 어댑터, 100페이지/3개 수정, 같은 검색 페이지 offset 재개, block/data source 부모, 삭제·휴지통·공유 해제, 재조정 순회·실패 보존을 검증했다.
- `scripts/verify-notion-poll-sql.mjs`, `scripts/verify-security-sql.mjs`: PGlite에 수정/같은 분/새 하위 페이지/새 DB 행/include_new=false/cursor 재개/데모 배제/트리 부재 tombstone/교차 부서 retire/결정 인용 보존/RPC 권한 시나리오를 추가했다.

## 코드 관계·구조 확인

`runWorkerOnce`/`runWorkerBulk` → `prepareWorker` → `schedule_source_syncs` 및 `schedule_notion_polls` → bulk `notion_poll`/`notion_discover`다. `notion_poll`은 `searchNotion(sortByEditedDesc)` 결과의 부모를 해석해 `poll_notion_page` RPC로 전달한다. 40초 안에 끝나지 않으면 API cursor·현재 페이지 offset·최초 시작시각을 저장하고 bulk job으로 이어가며, 완주한 뒤에만 최초 시작시각-2분 워터마크를 반영한다.

`notion_discover(reconcile:true)` → `claim_notion_reconcile` → 페이지 메타·블록 자식 참조·database/data source 행 순회 → `reconcile_notion_page` → `finish_notion_reconcile` 순서다. 알려진 workspace source는 검색 결과에만 의존하지 않고 페이지를 직접 조회한다. subtree는 root에서 실제 트리를 내려간다. 모든 경로를 완주했을 때만 unseen source를 retire하며, 중간 API 실패는 cursor만 보존한다.

`notion_import` 예약 지점은 직접 등록의 `schedule_source_syncs`(realtime), root 등록의 `register_notion_page`(bulk), legacy 전환의 `convert_notion_source_v2`(직접 source는 realtime), `poll_notion_page`(bulk), `reconcile_notion_page`의 편집 시각 변경분(bulk)이다. source 정리 경로는 `retire_notion_source`(직접 조회 404/휴지통), `set_notion_exclusion`(부서장 제외), `reconcile_notion_page`(다른 부서의 더 가까운 subtree/exclusion), `finish_notion_reconcile`(완주한 트리에서 사라짐)이다. 모두 item만 소프트 삭제하고 결정·citation 행은 유지한다.

Graft·Archify는 2026-09-18 최종 확인에서도 PATH에 없어 실행 결과가 없다. `rg`와 실제 호출 파일·PGlite 하니스로 위 관계를 확인했다.

## 실행 명령과 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/pipeline/notion-poll.test.ts tests/pipeline/notion-discover.test.ts tests/notion.test.ts` (남은 구현 전) | 예상 실패 — block 부모·reconcile·메타 전용 어댑터 6건 |
| `npx vitest run tests/pipeline/notion-poll.test.ts tests/pipeline/notion-discover.test.ts tests/pipeline/notion-import.test.ts` | 성공 — 3 files, 22 tests |
| `npx vitest run tests/pipeline/notion-poll.test.ts tests/pipeline/notion-discover.test.ts tests/pipeline/notion-import.test.ts tests/notion.test.ts` | 성공 — 4 files, 34 tests |
| `node scripts/verify-security-sql.mjs 'D:/바이브코딩/.sasu-qa-db'` | 성공 — isolated PGlite 207 checks, failed 0 |
| `npm run lint && npm run build && npm run test` | 성공 — ESLint, Next.js production build/TypeScript, 106 files·1,195 tests |
| `git diff --check -- <Step 6 변경 파일>` | 성공 — whitespace 오류 없음(기존 LF→CRLF 안내만 출력) |

## AC 시나리오 실행 기록

| 시나리오 | 실행 결과 |
|---|---|
| 노션 mock 100페이지 중 3페이지만 워터마크 이후 수정 | `tests/pipeline/notion-poll.test.ts`에서 `poll_notion_page` 3회, 결과 `imports: 3` 확인 |
| 같은 분 재수정 | PGlite에서 동일 `remote_edited_at` + 현재 분 `last_synced_at` source가 bulk import 1건 예약됨 |
| 삭제·휴지통·공유 해제 | mock의 `inTrash`와 `notion_not_found`는 seen 처리하지 않았고, 완주 RPC가 source 비활성·item 소프트 삭제를 수행함 |
| 트리 이동·다른 부서 subtree가 더 가까워짐 | PGlite에서 workspace source가 `notion_reconciled_outside_root`로 retire되고 item이 소프트 삭제됨 |
| 기존 결정 인용 유지 | missing source tombstone 뒤에도 `citations.quote`가 그대로 남음 |
| 새 하위 페이지와 새 DB 행 | poll이 부모 source/database root를 찾아 각각 source+bulk `notion_import`를 예약함. `data_source_id`는 database 부모로 해석함 |
| `include_new=false` | 새 하위 페이지 source/job 0건 |
| poll 중단 후 재개 | 현재 검색 페이지 offset부터 이어가며 부분 회차에서는 워터마크 불변, 완주 뒤 최초 시작시각-2분으로만 전진 |
| 데모 조직 | poll/reconcile job 0건 |
| 수동 [다시 가져오기] | 기존 route가 편집 시각 비교 없이 `notion_import`를 직접 enqueue하는 경로를 유지했고 전체 route 회귀 테스트가 통과함 |

## CRITICAL 점검

- poll/reconcile 예약은 활성·비데모 설치만 대상으로 하며 새 Notion job은 모두 `lane='bulk'`다.
- 사용자 요청 경로에 service role을 추가하지 않았다. poll SQL RPC는 service role만 실행 가능하다.
- poll 검색 결과만으로 삭제를 판정하지 않는다. workspace 기존 source는 직접 페이지 메타를 조회하고 subtree는 root에서 트리를 다시 내려가며, 재조정이 완주한 뒤에만 unseen source를 정리한다.
- 재조정은 페이지 본문을 저장·파싱하지 않고 메타와 자식 ID/참조만 사용한다. API 실패 중에는 retire하지 않는다.
- 본문·제목·토큰을 로그로 남기지 않는다. poll job payload는 root ID만 담는다.

## 미실행 항목

- 실제 Notion workspace 호출, 운영 DB migration/pg_cron 변경, 배포, `npx supabase db push`는 요청 범위에 따라 미실행이다.
- 실제 고객 workspace의 삭제·공유 해제는 토큰을 제공받지 않아 외부 호출로 재현하지 않았다. 동일 분기는 mock 404/휴지통과 PGlite 트리 부재·교차 부서 시나리오로 검증했다.

## 오케스트레이터 리뷰 (2026-09-18, Claude)

- 1차(terra) 부분 구현 → 2차(sol) 재실행으로 재조정·교차 부서 retire·block_id 부모 해석을 완료한 것을 확인했다.
- 결함 수정(0043 `poll_notion_page`): "같은 분 안의 재수정" 판정이 마지막 수집 분을 **현재 시각의 분**과 비교하고 있어, 폴링이 그 분을 지나서 돌면(항상 그렇다 — 5분 주기) 재수정을 놓쳤다. 편집 시각의 분과 비교하도록 고치고, 회귀 케이스 2개(7분 전 같은 분 → import, 다음 분에 재수집 후 → skip)를 `scripts/verify-notion-poll-sql.mjs`에 추가했다.
- 확인: 재조정의 retire 패스(`finish_notion_reconcile`)는 트리 순회가 끝까지 성공한 뒤에만 실행되고, 페이지·DB 읽기 오류는 job 실패로 끝나 잘못된 retire를 만들지 않는다. 워터마크는 회차 완료 후에만 올라간다.
- 재실행: PGlite 하니스 207 passed / 0 failed. `tests/pipeline/notion-poll.test.ts`·`notion-discover.test.ts`·`notion-import.test.ts`·`tests/worker.test.ts` 통과.
- 남은 한계: 재조정이 실패로 끝나면 root가 `discovering`+만료 lease 상태로 남고 다음 예약에서 재시도된다. 3회 실패 뒤 `failed`는 화면(step 7)에서 보여야 한다.

