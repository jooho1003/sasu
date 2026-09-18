# Step 6: poll-reconcile

수정된 페이지만 다시 읽는 증분 갱신과 하루 1회 재조정을 만든다.

## 읽어야 할 파일

- `/docs/PRD.md` §3-5(NOT-05), §6-10의 Notion API 실패 행
- `/docs/planning/노션_전체수집_설계.md` §5-3
- step 0·3·4·5 산출물: `searchNotion`, `sources.remote_edited_at`, `register_notion_page`, `notion_discover`, bulk 레인
- `supabase/migrations/0030_source_lifecycle.sql`의 `schedule_source_syncs()`, `lib/worker.ts`의 `scheduleNotionSync()`

## 작업

1. migration: `notion_installations.poll_watermark timestamptz`, `next_poll_at`, `next_reconcile_at`. `schedule_notion_polls()` — active·비데모 설치 중 `next_poll_at<=now()`인 것에 `notion_poll` job(조직당 1개, 실행 중이면 생략)을 넣고 5분 뒤로 민다. `next_reconcile_at<=now()`면 그 조직의 `idle` root마다 `notion_discover`(payload `{rootId, reconcile:true}`)를 넣고 24시간 뒤로 민다. 워커 틱에서 `schedule_source_syncs()`와 함께 호출한다.
2. `schedule_source_syncs()`는 `root_id is null and auto_sync`인 소스에만 적용되게 조건을 추가한다(자동 수집 소스는 5분 전체 재읽기를 하지 않는다). `import_version=2`이고 `remote_edited_at`이 있는 직접 등록 소스는 전체 재읽기 전에 페이지 메타만 읽어 편집 시각이 같으면 건너뛴다.
3. `lib/pipeline/notion-poll.ts`(테스트 먼저): `searchNotion({sortByEditedDesc:true})`를 워터마크보다 오래된 결과가 나올 때까지 읽는다(1회 40초 상한, 넘으면 커서 저장 후 재예약).
   - 등록된 페이지: 원격 `lastEditedTime` > 저장값이면 `notion_import` 예약. **같은 값이어도** 저장된 `last_synced_at`이 그 분(minute) 안이면 한 번 더 예약한다(노션 편집 시각은 분 단위).
   - 모르는 페이지: `parent`가 등록된 소스(또는 그 DB)이고 그 root가 `include_new`면 `register_notion_page`. 부모를 모르면 건너뛴다(재조정이 잡는다). `parent.type==='block_id'`는 블록의 부모를 최대 5단계 따라 올라간다.
   - 워터마크는 **한 회차를 끝까지 읽은 뒤에만** 그 회차 시작 시각 − 2분으로 올린다.
4. 재조정(`reconcile:true`): 트리를 다시 내려가며 본문은 읽지 않고 편집 시각만 비교해 달라진 페이지를 예약하고, 트리에서 사라진 활성 소스(이동·삭제·공유 해제)를 `retire_notion_source`로 정리한다. 다른 root 밑으로 옮겨진 페이지는 그 root의 발견이 새로 등록한다. **또한 `workspace` root 소속 소스 중 지금은 다른 부서의 `subtree` root가 더 가까운 페이지(나중에 추가된 매핑)는 `register_notion_page`의 `excluded` 판정과 같은 규칙으로 workspace 부서에서 retire한다** — step 4 리뷰에서 남긴 항목(`docs/verification/notion-collection/step4.md`).
5. 수동 [다시 가져오기]는 편집 시각 비교 없이 항상 읽는다.

## 코드 관계와 구조 확인

워커 틱의 예약 함수들, `notion_import` 예약 지점 전수, 소스 정리 경로를 `docs/verification/notion-collection/step6.md`에 기록한다.

## Acceptance Criteria

```bash
npx vitest run tests/pipeline/notion-poll.test.ts tests/pipeline/notion-discover.test.ts tests/pipeline/notion-import.test.ts
npm run lint && npm run build && npm run test
```

로컬 실행 기록(노션 mock): 100페이지 중 3페이지 수정 → `notion_import` 3건만 예약 / 같은 분 재수정 → 추가 1회 읽기 / 페이지 삭제·휴지통·공유 해제 → 재조정 후 소스 비활성·item 소프트 삭제·결정 인용 유지 / 새 하위 페이지와 새 DB 행 → 다음 poll에서 등록 / `include_new=false` root는 새 페이지 0건 / poll 중단 후 재개 시 워터마크가 앞서 나가지 않음 / 데모 조직은 poll 예약 0건.

## 검증 절차

AC → CRITICAL 점검 → `index.json` step 6 갱신.

## 금지사항

- 검색 API 결과만으로 삭제를 판정하지 마라. 이유: 검색 색인은 지연·누락이 있다. 삭제는 페이지 직접 조회(404·휴지통) 또는 재조정의 트리 부재로만 판정한다.
- 워터마크를 부분 회차에서 올리지 마라. 이유: 중단된 구간의 수정분을 영구히 놓친다.
- 운영 DB 적용·커밋 금지.
