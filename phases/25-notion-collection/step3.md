# Step 3: import-v2

페이지 수집을 새 방식(`import_version=2`: 하위 페이지 미포함 + 헤딩 청크)으로 돌릴 수 있게 하고, 자동 수집분을 위한 `reference` 모드(분류 LLM 생략)를 넣는다. **기존 소스는 1로 남아 동작이 바뀌지 않는다.**

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-02·04·05), §8 ADR-060 경계, §6-3 카드 파이프라인(분류 → 자동 승격)
- `/docs/planning/노션_전체수집_설계.md` §2, §5-2, §6
- `supabase/migrations/0030_source_lifecycle.sql` 전체(특히 `version_item`, `invalidate_item_derivatives`, `begin/finish/release_notion_sync`, `schedule_source_syncs`)
- `lib/pipeline/notion-import.ts`, `lib/pipeline/classify.ts`(분류 후 임베딩 예약·자동 승격), `lib/pipeline/embed*.ts`, `lib/jobs.ts`(`deterministicJobId`, `FAILURE_OWNER_MAPPINGS`)
- step 0·1·2 산출물: `lib/notion.ts`, `lib/notion-chunk.ts`, `lib/notion-workspace.ts`
- `app/api/d/[dept]/settings/notion/route.ts`, `components/settings-s5.tsx`의 노션 카드

## 작업

1. 새 migration:
   - `sources`에 `import_version smallint not null default 1 check in (1,2)`, `ingest_mode text not null default 'classify' check in ('classify','reference')`, `root_id uuid`(FK는 step 4에서), `remote_edited_at timestamptz`, `parent_external_id text`.
   - 부분 유니크 인덱스: `(dept_id, external_id) where kind='notion_page' and active`. 적용 전 기존 데이터에 중복이 있는지 확인하는 쿼리를 migration 주석과 완료 기록에 남긴다(중복이 있으면 migration이 실패해야 하며 조용히 지우지 않는다).
   - `finish_notion_sync`를 새 시그니처로 교체(`p_remote_edited_at timestamptz default null` 추가). 신규 item에 대해 `ingest_mode='reference'`면 `classify` 대신 `embed` job을 넣는다. job id는 **TS의 `deterministicJobId('embed', itemId:version)`과 같은 값**이 나오게 하거나, SQL 전용 접두(`md5('source-embed:'||id||':'||version)`)를 쓰되 TS 쪽 embed 예약과 이중 실행돼도 `complete_item_embedding`의 버전 조건으로 안전함을 테스트로 보인다. 어느 쪽을 골랐는지 기록한다.
   - `invalidate_item_derivatives`: 변경된 item의 소스가 `reference`면 `classify`가 아니라 `embed`를 예약한다. 기존 분기(열린 카드 `needs_review` 처리 등)는 그대로 둔다.
   - `release_notion_sync`의 허용 오류 코드에 step 0의 새 코드를 추가한다.
   - `retire_notion_source(p_source, p_lease, p_reason)` — service_role. `active=false`, `last_error=p_reason`, 그 소스의 item을 소프트 삭제(`content=''`, `deleted_at`). 결정 인용 스냅샷은 건드리지 않는다.
   - `convert_notion_source_v2(p_source)` — authenticated 부서장(`can_see(..., 'leads_only')`). `import_version=2`로 바꾸고 `notion_import`를 예약. 되돌리기 RPC는 만들지 않는다.
2. `lib/pipeline/notion-import.ts`:
   - 소스의 `import_version`으로 분기. 1은 현행 그대로(`descendChildPages` 기본값 + `toNotionItems`). 2는 `fetchNotionPage(id, {descendChildPages:false})` → `chunkNotionBlocks({blocks, properties})` → `finish_notion_sync(..., p_remote_edited_at)`.
   - `notion_not_found` 또는 `meta.inTrash`면 `retire_notion_source`.
   - 반환값에 `children: NotionChildRef[]`를 포함해 step 4의 발견이 재사용하게 한다(이 step에서는 버린다).
   - 토큰은 `withNotionForJob`/`withNotionForDepartment`로만 얻는다.
3. 임베딩 입력에만 마스킹된 소스 제목을 앞에 붙인다(`items.content`는 그대로). 임베딩 핸들러에서 소스 `import_version=2`일 때만 적용한다 — 1의 기존 벡터와 검색 결과가 바뀌지 않게.
4. 직접 등록 라우트: 새로 만드는 소스는 `import_version=2`·`ingest_mode='classify'`. 여러 줄 입력(최대 50개, 줄마다 `normalizeNotionPageId`)을 받아 각각 소스를 만들고 줄별 성공/실패를 돌려준다. 같은 부서에 이미 활성인 페이지는 새로 만들지 않고 기존 행을 돌려준다. S5 노션 카드에 여러 줄 입력과 기존 소스의 [새 방식으로 전환] 버튼(경고: "열려 있는 카드의 근거가 재검토 상태가 됩니다")을 붙인다. `하위 페이지 포함` 옵션은 step 4에서 추가한다.

## 코드 관계와 구조 확인

`finish_notion_sync` 호출자, `classify`→`embed` 예약 경로, `search_as`가 `classifications`에 의존하는지(의존하면 reference item이 검색에서 빠진다 — 반드시 확인하고 결과를 기록), 대시보드·분류 탭이 classification 없는 item을 어떻게 표시하는지를 `docs/verification/notion-collection/step3.md`에 적는다.

## Acceptance Criteria

```bash
npx vitest run tests/pipeline/notion-import.test.ts tests/notion-import.test.ts tests/notion-reimport-route.test.ts tests/notion-chunk.test.ts
npm run lint && npm run build && npm run test
```

로컬 Supabase에서 실행 기록으로 남길 것:
- `import_version=1` 소스를 다시 가져와도 item 수·id·`content_version`이 그대로다.
- `import_version=2`·`reference` 소스 수집 후 그 item에 대한 `classify` job 0건, `embed` job이 item당 1건, 임베딩 완료 뒤 `search_as`로 검색된다.
- 같은 스냅샷을 두 번 넣어도 item·job이 늘지 않는다(멱등). 청크 본문만 바뀌면 `content_version`+1, 재임베딩 1건, 분류 0건.
- 404 응답 → 소스 비활성·item 소프트 삭제, 기존 결정의 인용 `quote`는 남아 있다.
- 같은 부서에 같은 페이지를 두 번 등록 → 소스 1행.
- 일반 멤버의 `convert_notion_source_v2` 호출 → 42501.

## 검증 절차

AC → CRITICAL 점검(마스킹 전 텍스트 미저장, 인용 검증 회귀 — `tests/`의 인용 검증 테스트 전체 통과) → `index.json` step 3 갱신.

## 금지사항

- 기존 소스를 migration에서 일괄 `import_version=2`로 바꾸지 마라. 이유: item id가 바뀌어 운영의 열린 카드 근거가 전부 무효화된다. 전환은 부서장의 명시적 조작이다.
- `reference` item에 가짜 classification 행을 넣지 마라. 이유: 분류 탭과 지표를 오염시킨다. 검색이 classification에 의존한다면 검색 쪽 조건을 고치는 안을 기록하고 `blocked`로 멈춰 사람 판단을 받는다.
- `can_see()`나 RLS 정책을 바꾸지 마라. 이유: 가시성 판정은 한 곳이다.
- 운영 DB 적용·커밋을 하지 마라.
