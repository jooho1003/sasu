# Step 5: source-removal

## 읽어야 할 파일

- `/docs/PRD.md` §6-6 "채널 제거 시", §6-12 "지워야 하는 것과 남겨야 하는 것" 채널 제거 행·"채널 오제거" 되돌리기, §8-3, §9 D9 완료 조건("채널 추가·제거가 수집에 반영")
- `docs/pilot-consent.md` 4번(원장 인용은 남음)
- `app/api/d/[dept]/settings/source/route.ts`, `components/settings-s5.tsx`
- `supabase/migrations/0013_authenticated_write_boundaries.sql`, `0014_atomic_slack_ingest.sql`(inactive 소스 수집 거부 여부 확인)
- 검색 함수들(`0012`)이 `deleted_at is null`을 거르는지 확인

## 작업

1. 마이그레이션 `supabase/migrations/0020_remove_source.sql`
   - `remove_source(p_source uuid) returns jsonb` — security definer, `auth.uid()`가 해당 부서 **lead**일 때만. 한 트랜잭션:
     - `sources.active=false`
     - 그 소스의 items: `embedding=null`, `embed_status='deleted'`(check 제약이 있으면 확장), `deleted_at=now()`, `content=''` **단 원장 citation(owner_kind in ('decision','decision_request'))이 인용한 item도 content는 지운다** — 인용 문장은 `citations.quote`에 이미 남아 있다.
     - 그 items의 `classifications` 삭제
     - 반환 `{ removed_items: n }`
   - 수집 경로(0014 `ingest_slack_atomic`, 백필, 노션·전사 insert)가 `active=false` 소스에 쓰지 않는지 확인하고, 아니면 막는다.
   - 게스트 org 소스는 거부.
2. 라우트: `DELETE /api/d/[dept]/settings/source?id=` (또는 `[id]` 세그먼트 — 기존 라우팅 관례 따름). 세션 클라이언트로 RPC 호출. 슬랙 채널 공지는 보내지 않는다.
3. S5: 연결된 소스 목록에 [제거] 버튼 → 확인 모달 문구(PRD §6-12): `"제거하면 이 채널의 저장된 본문과 검색 데이터가 삭제됩니다. 원장에 인용된 문장은 남습니다. 다시 연결하면 최근 7일만 복구됩니다."` → 완료 후 목록 갱신.
4. 테스트 먼저: SQL(lead만 실행·member 거부·content/embedding 삭제·citations.quote 보존·inactive 소스 수집 거부·검색 결과 0건) + 라우트 테스트.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"   # failed 0
```

## 검증 절차

1. AC 실행. 2. 체크리스트(요청 경로 service role 금지 · 서버 집행 · 로그 본문 금지). 3. index.json step 5 갱신.

## 금지사항

- items 행 자체를 DELETE하지 마라. 이유: citations FK·원장 근거 보존(§6-12).
- `citations.quote`를 지우지 마라. 이유: 동의문 4번 약속.
- 운영 DB 반영 금지 · 기존 마이그레이션 수정 금지.
