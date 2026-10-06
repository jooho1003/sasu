# demo-document-summary — Design

2026-10-07 · phase 53 · ADR-092 · [plan](../../01-plan/features/demo-document-summary.plan.md)

## Context Anchor

| Key | Value |
|---|---|
| WHY | 데모 "문서 정리" 소개와 화면 불일치, phase 51 결과가 데모에 안 보임 |
| WHO | 로그인 없는 데모 방문자 |
| RISK | 익명 읽기 범위 확장 · 재시드 회귀 |
| SUCCESS | SC1~SC4 (plan §4) |
| SCOPE | PRD §6-7·§8 / ADR-092 |

## 1. 선택한 설계

설계안 A(사용자 선택 2026-10-07): DB 데모 읽기 정책 + 시드 + 읽기 시 재검증. 대안 B(코드 정적 데이터)·C(데모 전용 RPC)는 ADR-092 대안 참조.

## 2. 구성

| # | 대상 | 변경 |
|---|---|---|
| M1 | `supabase/migrations/0070_demo_document_summaries_read.sql` (신규) | `create policy document_summaries_demo_read on public.document_summaries for select to anon using (public.is_demo_department(dept_id) and exists (select 1 from public.sources s where s.id = source_id and s.dept_id = document_summaries.dept_id and s.active))`. 쓰기 정책 없음. 롤백 `supabase/rollback/`에 drop policy. |
| M2 | `lib/document-summary-check.ts` (신규, 순수) | `groundedOverview`·`verifyDocumentSummary`·`VerifiedDocumentSummary`를 `lib/pipeline/document-summary.ts`에서 옮긴다(import는 `@/lib/contracts` 타입만). 파이프라인은 이 모듈을 import하고 같은 이름을 다시 export한다(기존 테스트·호출부 불변). |
| M3 | `lib/demo-document-summaries.ts` (신규, 순수) | `verifiedDemoSummaries(rows: {source_id; summary: unknown}[], items: {id; source_id; content}[]): Record<string, DocumentSummary>` — `DocumentSummary.safeParse` 실패 행 제외, 소스별 item 맵으로 `verifyDocumentSummary`, `valid.citations.length > 0`인 것만 `valid`로 반환. |
| M4 | `lib/supabase/demo-workspace.ts` | `document_summaries`(`source_id, summary`, `dept_id = dept`, `status = 'summarized'`)를 함께 읽어 M3 결과를 `summaries`로 반환. 조회 오류는 기존처럼 throw하지 않고 빈 요약으로 둔다(요약은 보조 구역 — 데모 문서 화면 전체를 깨지 않는다). |
| M5 | `lib/demo-workspace.ts` | `DemoWorkspaceData`에 `summaries: Record<string, DocumentSummary>` 추가, `salesDemoRecords`는 `{}`. |
| M6 | `components/document-summary-sections.tsx` (신규) | 실제 화면의 `SECTION_LABELS`와 한눈에 보기 + 항목 구역 렌더를 옮긴 공유 컴포넌트 `DocumentSummarySections({ summary })`. 마크업·클래스(`document-overview`, `summary-section`)는 그대로. |
| M7 | `components/document-assistant.tsx` | M6 사용으로 교체(출력 불변). 원문 근거·하단 버튼은 그대로. |
| M8 | `components/demo-document-workspace.tsx` | `!ledger`이고 `data.summaries[source.id]`가 있으면 기존 고정 "한눈에 보기" 문단 대신 M6 + "원문 근거 N"(인용 `blockquote`, 링크 없음)을 렌더. 요약이 없으면 기존 표시 유지. 쓰기 버튼 없음. |
| M9 | `scripts/seed-demo.ts` | (a) `applicantSummary` overview = 검증 항목 앞 2개 문장을 공백으로 연결(원문 문장). (b) 개발 부서 합성 문서 `20000000-0000-4000-8000-000000000110`(…0107은 개발 부서 노션 소스가 이미 사용 — step 1에서 확인) "배포 점검 회의록 (합성)"(kind `document`, visibility `dept`)과 items `…0171`~`…0175`: 핵심 내용 1·결정·정책 2·다음 할 일 1·확인이 필요한 질문 1. 작성자는 기존 개발 부서 인물(도윤·서연·개발 리드). 요약은 모든 항목 text·인용 quote가 원문 그대로, overview는 원문 두 문장. classification label은 내용에 맞게(info/decision/action/info). |

## 3. 비교 목록 (`/pdca analyze`용)

- 테이블·정책: `document_summaries` + `document_summaries_demo_read`(anon SELECT)
- 모듈: `lib/document-summary-check.ts`, `lib/demo-document-summaries.ts`, `lib/supabase/demo-workspace.ts`, `lib/demo-workspace.ts`, `lib/pipeline/document-summary.ts`(re-export)
- 컴포넌트·화면: `components/document-summary-sections.tsx`, `components/document-assistant.tsx`, `components/demo-document-workspace.tsx`, `/demo/d/[dept]/documents`
- 시드: `scripts/seed-demo.ts`
- 엔드포인트·job: 없음

## 8. Test Plan

| ID | 종류 | 시나리오 |
|---|---|---|
| S1 | SQL 하니스(`scripts/verify-*-sql.mjs` 모듈 추가) | anon: 데모 부서 요약 1행, 비데모 0행, 비활성 소스 0행, INSERT/UPDATE/DELETE 거부 |
| U1 | 단위 | M3: 원문에 없는 overview → 원문 문장으로 대체된 요약 반환 |
| U2 | 단위 | M3: 인용이 모두 원문 밖이면 그 소스는 결과에서 제외 |
| U3 | 단위 | M3: 스키마가 깨진 행은 제외, 다른 행은 유지 |
| U4 | 단위 | M3: 다른 소스 item의 문장은 근거로 인정하지 않음(소스별 맵) |
| U5 | 단위 | 시드: 지원서 3건 + 합성 문서 요약 `dropped === 0`, 합성 문서는 네 구역 모두 1개 이상 |
| U6 | 단위 | 기존 `tests/pipeline/document-summary.test.ts` 그대로 통과(M2 이동 후) |
| E1 | E2E(`tests/e2e/demo-public-workspace.spec.ts` 또는 신규 데모 스펙) | `/demo/d/<개발>/documents`에서 "배포 점검 회의록 (합성)" 펼침 → 한눈에 보기·결정·정책·다음 할 일·확인이 필요한 질문·원문 근거 표시, overview 문장마다 원문 기록 목록에 존재, 업로드 버튼 없음. 1440·390 캡처 |
| E2 | E2E 회귀 | 기존 데모 스펙(guest·demo-reviewer·demo-public-workspace) 통과 |

## 9. 운영 반영 (사용자 승인 단계)

1. migration `0070` → 운영 `db push`(`--skip-vault`, 사전 dry-run).
2. 데모 시드 재생성 `npx tsx scripts/seed-demo.ts`(데모 조직만, LLM 호출 없음).
3. PR main 병합 → Vercel 배포 → 운영 E1·E2(쓰기 없음).

## 11. Step

| step | name | 내용 |
|---|---|---|
| 0 | demo-summary-read-path | M1·M2·M3·M4·M5 + S1·U1~U4·U6 |
| 1 | demo-summary-screen-and-seed | M6·M7·M8·M9 + U5·E1·E2(로컬 QA) |
