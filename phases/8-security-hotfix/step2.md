# Step 2: production-gate

> **이 step은 하네스(Codex)가 실행하지 않는다.** 메인 오케스트레이터 노드 O8이다(플랜 `D:\바이브코딩\.claude\plans\sasu-scope-expansion-2026-09-15.plan.json`). 하네스로 실행되면 아무것도 변경하지 말고 `phases/8-security-hotfix/index.json` step 2를 `"blocked"`, `"blocked_reason": "O8 사용자 승인 대기"`로 두고 즉시 종료하라.

## 읽어야 할 파일

- `docs/ADR.md` ADR-042 · `docs/PRD.md` §10 #23 · §11 "보안 핫픽스" 행
- `docs/verification/security-hotfix.md`
- `phases/8-security-hotfix/step0.md`, `step1.md`

## 작업 (O8, 사용자 승인 후 메인이 수행)

순서가 중요하다. **새 코드 배포가 0025보다 먼저다.** 지금 운영 중인 옛 코드는 세션 클라이언트로 `items`에 insert하므로, 0025를 먼저 적용하면 운영 업로드가 깨진다. 새 코드는 0025 전후 모두 동작한다.

1. 운영 DB 읽기 전용 조회(PRD §10 #23): `information_schema.role_table_grants`에서 `anon`·`authenticated`의 `departments`·`items` 권한, `pg_policies`에서 두 테이블 정책. 결과를 기록한다.
2. R8 리뷰 통과본(main)을 스냅샷 배포한다(`git archive` → `vercel deploy <dir> --prod`). `/demo`·로그인·문서 화면이 뜨는지 확인한다.
3. 운영 대상 E2E: `guest`·`team-coverage`(읽기), `vertical-slice`·`ask-permission`·`agent-roles`·`upload-boundaries`(`E2E_ALLOW_EXTERNAL_WRITES=1`).
4. `supabase db push`로 **0025만** 적용한다. 다른 phase 마이그레이션이 로컬에 있으면 적용 대상에서 빠졌는지 먼저 확인한다.
5. 재검증: 1번 조회 재실행(쓰기 권한 회수 확인) · `upload-boundaries`를 `E2E_EXPECT_0025=1`로 재실행 · `guest`·`vertical-slice` 재실행 · member 세션으로 PostgREST `departments` update(`org_id` 변경) 시도 → 거부.
6. `docs/verification/security-hotfix.md`에 "운영 반영" 절(시각·배포 id·명령·결과)을 추가하고 이 step을 `completed`로 기록한다.

## 금지사항

- 승인 없이 1~5를 실행하지 않는다.
- 모의 라우트 테스트나 PGlite 결과를 운영 E2E 증거로 적지 않는다.
- 0026 이후 마이그레이션을 함께 적용하지 않는다. 이유: 불변식 22 — phase별 검증 뒤에만 적용한다.
