# Step 7: notion-reimport

## 읽어야 할 파일

- `/docs/PRD.md` §4 노션 행("1회 가져오기 + [다시 가져오기]"), §6-2 노션, §6-6 노션, §6-12 원문 삭제 소프트 삭제
- `/docs/ADR.md` ADR-004
- `lib/notion.ts`, `lib/pipeline/notion-import.ts`, `tests/notion.test.ts`
- `app/api/d/[dept]/settings/notion/route.ts`, `components/settings-s5.tsx` 노션 섹션

## 작업

1. `lib/pipeline/notion-import.ts`: 가져오기 결과로 받은 블록 `external_ref` 집합에 **없는** 그 소스의 기존 items(`deleted_at is null`)를 `deleted_at=now()`, `embedding=null`로 소프트 삭제. 본문은 유지(조직 원칙 문서이며 원장 인용 대상). 새·변경 블록은 기존 upsert 유지하되 content가 바뀐 item은 `embed_status='pending'`으로 되돌려 재임베딩 job을 enqueue. 결과 `{ inserted, updated, deleted }` 반환.
   - 노션 API가 부분 실패(페이지네이션 중 에러)하면 삭제 단계를 실행하지 마라 — 일부만 받아 온 목록으로 전체를 지우게 된다.
2. S5 노션 섹션: 연결된 노션 소스마다 `마지막 가져오기: {last_synced_at KST}` + **[다시 가져오기]** 버튼(lead만 노출, 서버도 lead 검증) → 기존 라우트에 source id로 요청 → 결과 `"추가 n · 변경 n · 삭제 n"` 표시. `sources.last_synced_at`·`last_error` 갱신.
3. 테스트 먼저: 사라진 블록 소프트 삭제 · 변경 블록 재임베딩 enqueue · 페이지네이션 실패 시 삭제 0 · member 요청 403.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC 실행. 2. 체크리스트(마스킹 후 저장 · 로그 본문 금지 · 서버 lead 검증). 3. index.json step 7 갱신.

## 금지사항

- 폴링·웹훅·cron을 추가하지 마라. 이유: ADR-004, PRD §8-0.
- 실제 노션 API를 테스트에서 호출하지 마라. 이유: 단위 테스트는 mock, 외부 의존 불안정.
