# 데스크톱 동반 앱 운영 반영·워커 장애 복구 — 2026-10-02

사용자 요청 "커밋 머지 푸시 운영배포 원격까지 정리"에 따라 phase 43(ADR-082)의 웹·DB 부분을 운영에 반영했다. 원천은 `b821a3e`와 문구 검사 수정 `4c30d95`이며, [PR #25](https://github.com/jooho1003/sasu/pull/25) 병합 커밋은 `47ff2ac`이다. 데스크톱 설치 파일은 게시하지 않았다.

## 워커 장애 — 10/1 22:13 ~ 10/2 20:34 KST

10/1 22:12 KST에 PR #24(phase 41·42)와 #23이 main에 병합됐고, Vercel Git 연동이 `366a26f`를 운영(`dpl_Gx8wS9yXuUEVfx2aeujfH7n1iwcf`)에 배포했다. 운영 DB에는 0068이 없었다. 그래서 `prepareWorker()` → `sweepPendingRows()`의 `sales_source_reviews` 갱신이 `JobWorkerDatabaseError`를 던졌고, 매분 워커 호출이 작업을 하나도 처리하지 못했다.

| 근거 | 값 |
|---|---|
| 마지막 처리 작업 | 2026-10-01 13:13:10Z |
| pg_net 워커 응답 (보존 구간 10/2 05:50~11:32Z) | 686건 모두 HTTP 500 |
| 대기 작업 | realtime 1건(10/1 15:00Z 생성). 사용자 요청 작업은 없었다 |
| 0068 적용 뒤 | 11:34Z부터 HTTP 200, 대기 1건은 11:34:07Z에 처리 |

약 22시간 동안 노션 동기화·카드 리마인더·스윕·일일 정리가 멈췄다. PR #24 본문은 "병합은 배포가 아니다"라고 적었지만, main 병합은 곧 운영 배포다. 따라서 migration이 든 PR은 **운영 DB 적용 → 병합** 순서로 진행해야 한다.

## 반영 순서

1. 사전 검사(루트 코드는 `b821a3e`와 같다): `npm run test` 183파일·1,834건 통과, `npm run build` 통과, ESLint 오류 0. 루트 ESLint·Vitest·tsconfig는 `desktop/`을 제외한다. `npm run lint`의 문구 검사는 `desktop/src/renderer/src/components/SettingsTab.tsx`의 `Ctrl`·`Alt` 2건을 차단했다. 키 이름은 키보드 표기 그대로 둬야 하므로 `wording-ok` 예외를 붙였다(`4c30d95`). `node scripts/check-wording.mjs --ref 4c30d95`의 차단 건수는 0이다.
2. 운영 DB 읽기 검사: 적용 대상은 0068·0069뿐이었다. `postgres`는 `auth.sessions`에 SELECT·DELETE 권한이 있다(소유자 `supabase_auth_admin`). `private` 스키마도 있다.
3. 백업: Docker 엔진이 꺼져 있어 `supabase db dump`는 하지 못했다. 두 migration은 새 객체만 `create`하고 기존 객체를 바꾸지 않는다. 새 함수 이름 10개는 충돌 0건이었다. 카탈로그 수만 기록했다: public 테이블·public 함수·private 함수·정책이 53·367·35·64에서 55·376·36·66이 됐다.
4. 20:33 KST에 `supabase db push --db-url … --skip-vault --yes`로 0068·0069를 적용했다. 이어서 dry-run을 다시 실행해 "Remote database is up to date"를 확인했다.
5. 원래 작업 트리에는 다른 세션의 step 13 미커밋 변경이 있었다. 그래서 별도 worktree에서 `release/desktop-companion-20261002`(`b821a3e`+`4c30d95`)로 PR #25를 열었다. Preview `dpl_DkrgaKjos8y4voAG9pSWyUmJhSdh`가 Ready가 된 뒤 20:41 KST에 병합했다.
6. Git 연동 운영 배포 `dpl_GGAHAspU5TGcMKQvTfpw3XtLNWLU`가 Ready가 됐다. `vercel inspect https://sasu-alpha.vercel.app`이 같은 ID를 가리킨다.

## 배포 후 검사

| 검사 | 결과 |
|---|---|
| 공개 `/`·`/privacy`·`/demo/features` | 200 |
| 무서명 `POST /api/jobs/run`·`/api/slack/events` | 401 |
| 무인증 `/api/companion/departments`·`/api/companion/inbox`·`/api/devices` | 401 |
| anon `device_links`·`sales_source_reviews` 직접 읽기와 `link_device`·`companion_context`·`revoke_device_link` RPC | 401 |
| 운영 guest E2E: `E2E_BASE_URL=https://sasu-alpha.vercel.app npx playwright test tests/e2e/guest.spec.ts` | 5/5, 2.1분 |
| pg_cron `sasu-jobs-tick`·`sasu-jobs-bulk-tick` | 매분 succeeded. 새 배포 워커 응답 HTTP 200 8건, pg_net 8초 타임아웃 2건(bulk 장시간 실행) |

실제 인증 사용자로 기기를 연결·해제하거나 운영 고객 자료를 읽지 않았다.

## 롤백

- 코드: `vercel promote dpl_Gx8wS9yXuUEVfx2aeujfH7n1iwcf` (`366a26f`). 이 배포가 쓰는 0068은 이제 운영 DB에 있다.
- DB: 0069는 `supabase/rollback/0069_device_links_down.sql`을 수동 실행한다(이미 삭제된 기기 세션은 되돌릴 수 없다). 0068은 down 파일이 없고, 지우면 `366a26f` 이후 코드의 워커가 다시 멈춘다.

## 남은 사람·운영 항목

- SMTP 전환(기본 발송기 2통 한도), 6자리 코드 메일 템플릿 `{{ .Token }}`.
- 배포 전용 공개 저장소 생성·첫 게시, 깨끗한 Windows 계정에서 설치 5분 녹화, 자동 업데이트 1회 실측.
- step 13(G2~G4 이월 보완)은 다른 세션에서 진행 중이며 이번 배포에 포함하지 않았다.
- `auth.sessions` 삭제 권한 확인과 0069 적용은 이번에 끝났다.

## 저장소 정리

- 원격: 병합된 브랜치 7개를 삭제했다. `docs/desktop-companion-plan-20261001`(2d1666a), `docs/sales-agent-design-review-20260930`(a5ddc8d), `feat/sales-review-conditions-20261001`(8e6078b), `feat/sales-review-real-sources-20260930`(3086497), `feat/sales-review-revision-20260930`(8bd3a68), `feat/sales-review-text-diff-20260930`(9dffd22), `feat/sales-source-review-history-20261001`(9c38894).
- 로컬: 병합된 브랜치 10개를 삭제하고 worktree 3개를 제거했다. phase34 worktree의 `node_modules`는 원래 트리를 가리키는 정션이라 링크만 먼저 끊었다. 그 worktree의 `.vercel/phase34-schema-before.sql`은 원래 트리 `.vercel/phase34-schema-before-20260930.sql`로 옮겼고 SHA-256이 일치한다.
- `feat-43-desktop-companion`은 다른 세션이 쓰는 중이라 남겼다.

## 후속 Windows 설치 반영

위 기록 이후 step13·14가 PR #27로 병합·운영 배포됐고, 공개 Windows 0.1.1 게시·현재 PC 설치·자동 업데이트·6자리 코드/메일 템플릿 반영을 확인했다. [후속 실행 기록](43-desktop-companion/production-install.md)을 따른다. 신규 Windows 5분 녹화·실제 메일 수신·도메인/Resend SMTP는 남아 있다.
