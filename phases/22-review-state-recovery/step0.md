# Step 0: review-state-recovery

## 읽어야 할 파일

- `docs/PRD.md` §3-3·§8, `docs/ADR.md` ADR-054
- `docs/planning/자료검토_음성전사_요구사항.md` §4 A-03/A-04/A-08·§6·§8
- `components/review-detail.tsx`, `app/api/d/[dept]/reviews/[id]/route.ts`
- `supabase/migrations/0034_reviewed_materials.sql`의 `save_review`·`review_action`
- `node_modules/next/dist/docs/01-app/01-getting-started/05-server-and-client-components.md`

## 작업

이미 확정된 자료 검토 설계의 편집 보존·부분 실패 복구를 보완한다.

- 원본 파일만 삭제하거나 처리를 중단한 뒤에도 저장하지 않은 제목·구간 편집과 편집 기준 버전을 유지한다. 다른 창의 변경은 기존 SQL 버전 검증으로 거절한다.
- 일부 구간이 실패해도 다른 구간이 처리 중이면 진행 상태를 계속 확인한다. 모든 구간이 종료되면 폴링을 멈춘다.
- 늦게 도착한 이전 조회가 최신 조회·편집 상태를 덮어쓰지 않게 한다.
- API 지연·부분 실패·원본 삭제·편집 충돌을 브라우저 테스트로 재현한다. 합성 API fixture 검증과 실제 DB/Storage 연동 검증을 구분해 기록한다.

## 코드 관계와 도구

`ReviewDetail`의 load/command → 세션 API GET/PATCH/POST → 기존 SQL RPC 관계를 확인한다. Graft·Archify의 MCP/CLI는 현재 세션에서 발견되지 않았으며 실제 파일 검색으로 확인한 범위와 도구 결과 누락을 실행 기록에 남긴다. 서비스 구조·SQL 권한·LLM·외부 연동은 변경하지 않는다.

## Acceptance Criteria

```powershell
npm run lint
node scripts/review-qa.mjs build
npm run test
node scripts/review-qa.mjs guest-test tests/e2e/review-state-recovery.spec.ts
git diff --check
```

운영 DB·배포·Slack 게시 없이 로컬 QA에서 실행한다. 검증 기록은 `docs/verification/review-state-recovery-2026-09-17/README.md`에 남긴다.

## 실행 결과 — 2026-09-17

수정 전 브라우저 실패 5개를 재현한 뒤 구현했다. lint·production build·단위 1,027개·production 브라우저 9개(검토 복구 5·게스트 4)가 통과했다. 1440px·390px 화면과 명령 출력은 [실행 기록](../../docs/verification/review-state-recovery-2026-09-17/README.md)에 연결했다. Graft·Archify 미사용 범위와 실제 연동 시험의 한계를 같은 기록에 명시했다. 운영 반영은 수행하지 않았다.
