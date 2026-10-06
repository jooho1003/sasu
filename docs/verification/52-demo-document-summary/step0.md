# phase 52 step 0 — demo-summary-read-path 검증 기록

2026-10-07 · ADR-091 · design `docs/02-design/features/demo-document-summary.design.md` §2 M1~M5, §8 S1·U1~U4·U6
worktree `D:\바이브코딩\sasu\.vercel\wt-demo-docs` (branch `feat/demo-document-summary-20261007`). 커밋·푸시·운영 DB 접속·`npm run build` 없음.

## 변경

| # | 파일 | 내용 |
|---|---|---|
| M1 | `supabase/migrations/0070_demo_document_summaries_read.sql` (신규) | `document_summaries_demo_read` — `for select to anon using (is_demo_department(dept_id) and exists(활성 sources, 같은 dept_id))`. 쓰기 정책·RPC·테이블 없음. |
| M1 | `supabase/rollback/0070_demo_document_summaries_read_down.sql` (신규) | `drop policy if exists document_summaries_demo_read`. 기존 `*_down.sql` 형식. |
| S1 | `scripts/verify-demo-document-summaries-sql.mjs` (신규) · `scripts/verify-security-sql.mjs` (import·호출 2줄) | anon 시나리오 5개(아래). |
| M2 | `lib/document-summary-check.ts` (신규, 순수) | `groundedOverview`·`verifyDocumentSummary`·`VerifiedDocumentSummary`(+ 파이프라인 병합이 쓰는 `sectionKey`·`SummaryGroup`)를 이동. import는 `@/lib/contracts` 타입만. |
| M2 | `lib/pipeline/document-summary.ts` | 이동한 코드 삭제, 새 모듈 import + `groundedOverview`·`verifyDocumentSummary`·`VerifiedDocumentSummary` 같은 이름 re-export. 동작 불변. |
| M3 | `lib/demo-document-summaries.ts` (신규, 순수) | `verifiedDemoSummaries(rows, items)` — `DocumentSummary.safeParse` 실패 제외 → 소스별 item 맵으로 `verifyDocumentSummary` → `valid.citations.length > 0`만 반환. |
| M4 | `lib/supabase/demo-workspace.ts` | `document_summaries`(`source_id,summary`, `dept_id = dept`, `status = 'summarized'`)를 기존 `Promise.all`에 추가, 결과를 M3로 검증해 `summaries`로 반환. 요약 조회 오류는 throw 없이 `{}`. 가시성 판정은 RLS만(앱 코드 복제 없음). |
| M5 | `lib/demo-workspace.ts` | `DemoWorkspaceData.summaries: Record<string, DocumentSummary>` 추가, `salesDemoRecords.summaries = {}`. |
| 테스트 | `tests/document-summary-check.test.ts` (신규 4) · `tests/demo-document-summaries.test.ts` (신규 5) | 아래 red→green. |

## red → green

| 대상 | red (구현 전) | green |
|---|---|---|
| S1 SQL | 0070을 임시로 scratchpad로 옮기고 실행 → 314 PASS 후 `demo document summaries: anon policy is SELECT-only…`에서 `AssertionError`(정책 `[]`), exit 1 | 0070 복귀 후 **321 passed / failed 0** (기준선 316 + 신규 5) |
| M2 | `npx vitest run tests/document-summary-check.test.ts` → `Cannot find package '@/lib/document-summary-check'` (suite 실패) | M2 + U6: `tests/document-summary-check.test.ts`·`tests/pipeline/document-summary.test.ts` 14 passed |
| M3 | `npx vitest run tests/demo-document-summaries.test.ts` → `Cannot find package '@/lib/demo-document-summaries'` | 5 passed (기본 1 + U1~U4) |

TDD 가드: 새 lib 모듈 두 개 모두 테스트 파일을 먼저 Write한 뒤 구현을 Write했다. 가드 우회 없음(`lib/pipeline/document-summary.ts`는 기존 미러 테스트가 있어 가드 허용 대상이며 스크립트로 블록 치환).

## S1 시나리오 (PGlite, `scripts/verify-demo-document-summaries-sql.mjs`)

1. anon 정책은 `document_summaries_demo_read` 하나, `SELECT`, `{anon}`, qual에 `is_demo_department(dept_id)`·`active` 포함.
2. anon이 데모 부서 요약을 정확히 1행(활성 소스) 읽음, `status = summarized`, summary 내용 일치.
3. 비데모 부서 0행 · 비활성 소스(0034 트리거로 내용은 비워졌지만 행은 남음) 0행.
4. anon INSERT → 42501 거부, UPDATE·DELETE → 0행 영향·행 내용 그대로, anon/public 대상 INSERT·UPDATE·DELETE·ALL 정책 0개.
5. 0070 롤백 파일 적용(트랜잭션 안) → anon 0행, rollback 후 다시 1행.

기존 "all public tables: authenticated/anon direct-write policy and grant matrix" 검사도 그대로 통과(anon 쓰기 표면 `[]` 유지).

## Acceptance 명령 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/document-summary-check.test.ts tests/demo-document-summaries.test.ts tests/pipeline/document-summary.test.ts` | 3 files · **19 passed** |
| `node scripts/verify-security-sql.mjs %LOCALAPPDATA%\Temp\sasu-pglite-phase36` (pglite 0.5.8 · pgvector 0.0.9, 기존 설치본 — `sasu-pglite-verify-20260920`은 없었음) | **passed 321, failed 0** (exit 0) |
| `npm run lint` | exit 0 · ESLint 0 errors / 3 warnings(기존 파일 `docs/verification/43-…/flow.mjs`, `tests/e2e/settings-devices-local.spec.ts`) · 문구 검사 blocking 0 / warnings 84 |
| `npm run test` | 1차: 1914 passed / 1 failed — `tests/recording/session.test.ts` "streams 30 minutes…" 5301ms 시간 초과(5000ms, 부하 의존·이번 변경과 무관). 단독 재실행 6 passed, 전체 재실행 **190 files · 1915 passed** (exit 0) |
| `npx tsc --noEmit` | exit 0, 출력 없음 |

## 실행하지 않은 것

- `npm run build`: step 금지사항(메인 체크아웃 `.next` 충돌 방지, root가 실행).
- 운영 `db push`·시드: 사용자 승인 단계(design §9).
- Graft·Archify: 이 세션에 CLI가 없어 실행하지 않았다. 대신 `grep`으로 `lib/pipeline/document-summary`·`DemoWorkspaceData`·`readDemoWorkspace` 참조처를 확인했다(`lib/worker.ts`, `scripts/verify-document-injection.ts`, `tests/seed-demo.test.ts`, 데모 `documents`·`ledger`·`settings`·`retention` 페이지, `components/demo-document-workspace.tsx`·`demo-settings.tsx`). 구조 변경은 단일 읽기 경로 추가라 Archify 도식은 생략.
- 화면(M6~M8)·시드(M9)·U5·E1·E2: step 1 범위.

## 설계와의 차이

- M2: 설계는 `groundedOverview`·`verifyDocumentSummary`·`VerifiedDocumentSummary` 이동만 적었다. 파이프라인 `mergeDocumentSummaries`도 같은 `sectionKey`·`SummaryGroup`을 쓰므로 중복을 두지 않으려고 이 둘도 새 모듈에서 export해 파이프라인이 import한다(re-export 대상은 설계대로 세 개).
- M4: 요약 조회가 `readDemoWorkspace`에 들어가므로 이 함수를 쓰는 데모 `ledger`·`settings`·`retention` 페이지도 요약 조회 1회가 늘어난다(화면은 아직 `summaries`를 쓰지 않음). 설계 범위 안의 부수 효과.
