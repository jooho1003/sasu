# phase 53 step 1 — demo-summary-screen-and-seed 검증 기록

2026-10-07 · ADR-092 · design M6~M9, §8 U5·E1·E2. worktree `.vercel/wt-demo-docs`. 커밋·푸시·운영 DB 접속 없음. `npm run build` 직접 실행 없음(로컬 QA 서버용 래퍼 build만).

## 변경

| # | 파일 | 내용 |
|---|---|---|
| M6 | `components/document-summary-sections.tsx` (신규) | `DocumentSummarySections({ summary })` — 한눈에 보기 + 구역(핵심 내용·결정·정책·다음 할 일·확인이 필요한 질문). 마크업·클래스 그대로. |
| M7 | `components/document-assistant.tsx` | `SECTION_LABELS`와 구역 렌더를 M6 호출로 교체. 원문 근거·하단 버튼 불변. |
| M8 | `components/demo-document-workspace.tsx` | `!ledger`이고 `data.summaries[source.id]`가 있으면 M6 + "원문 근거 N"(`blockquote`, 링크 없음). 없으면 기존 문구. 쓰기 버튼 없음. |
| M9 | `scripts/seed-demo.ts` | `applicantSummary` overview = 앞 2개 항목 문장을 공백으로 연결(인자 `overview` 제거). 합성 문서 소스 + items 0171~0175 + `DEMO_DEPLOY_REVIEW_SOURCE_ID`·`DEMO_DOCUMENT_SUMMARIES`(지원서 3건 + 합성 1건) export, `document_summaries` insert가 이를 사용. `DEMO_AGENT_ROLE.documents`(역할 평가 데이터)는 그대로 3건. |
| U5 | `tests/seed-demo.test.ts` | 요약 시드 4건 `dropped === 0`·`valid`가 요약과 동일, 합성 문서 소스 속성·items 5개·네 구역 존재. |
| E1 | `tests/e2e/demo-document-summary.spec.ts` (신규) | 1440·390 두 케이스. |

## 설계와의 차이

- 소스 id: 지시의 `…0107`은 개발 부서 Notion 소스("배포·롤백 체크리스트", `lib/demo-access.ts`)가 이미 사용 중이라 충돌한다(기존 ID 충돌 테스트도 깨짐). 미사용 `20000000-0000-4000-8000-000000000110`을 썼다. items 0171~0175는 미사용 확인.
- overview(합성 문서)는 원문 두 문장: "정책: 금요일 오후에는 운영 배포를 하지 않는다. 결론: 결제 모듈 배포는 다음 주 화요일 오전으로 미룬다."
- item 0171 본문은 "이번 점검은 결제 모듈 배포 시점과 로그 보관 설정을 함께 확인하는 자리였습니다." (나머지는 지시 예시 문장 그대로).

## red → green

| 대상 | red | green |
|---|---|---|
| `tests/seed-demo.test.ts` | 구현 전 2 failed / 12 passed (`DEMO_DOCUMENT_SUMMARIES` 없음) | 14 passed |

기존 지원서 overview는 원문 문장이 아니어서 `dropped` 1이던 것을 0으로 맞췄다(기존 테스트의 `<= 1` 완화 제거).

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/seed-demo.test.ts` | 14 passed |
| `npm run lint` | exit 0, blocking 0 / warnings 84(기존) |
| `npm run test` | 1916 passed (step 0의 1915 + 신규 1) |
| `npx tsc --noEmit` | exit 0 |
| `node scripts/review-qa.mjs setup` | 0070 적용(로컬 QA DB만) |
| `node scripts/review-qa.mjs seed-demo` | demo_org=1 departments=7 items=160 (로컬 QA DB만) |
| E1 `demo-document-summary.spec.ts` | **2 passed** (1440·390). 구역 5개 표시, overview 두 문장이 원문 기록 목록에 존재, 업로드·정리 시작 버튼·파일 입력 0개, 쓰기 요청 0건 |
| E2 `review-qa.mjs ui-regression` (guest, demo-public-workspace, demo-reviewer, ui-refresh, workspace-polish, hiring-demo, plain-language, site, security-headers, review-state-recovery) | **61 passed / 4 failed** |

E2 실패 4건: `guest.spec.ts`(1440·390, 카드 링크 `a[href*="/cards/"]` 없음), `ui-refresh.spec.ts`(1440·390, 기록 분류 버튼 0개). 실패 화면은 기본 데모 부서 `d2f21e3f-…`("데모 부서")의 대시보드인데, 이 부서는 로컬 QA DB에 다른 QA 시드로 남은 부서이고 items·카드가 0건이다(`select count(*) from items where dept_id=...` = 0). 이번 변경은 문서 화면과 시드(개발 부서)만 건드려 이 대시보드와 무관하고, 같은 로컬 DB에서 재실행해도 동일하게 실패한다. 기준선(변경 전) 대조 실행은 하지 않았다. 따라서 "환경 불일치 추정"이며 root가 깨끗한 QA DB 또는 기준선으로 확인해야 한다. demo-public-workspace·demo-reviewer 등 나머지는 모두 통과.

## 캡처

- `docs/verification/53-demo-document-summary/demo-documents-1440.png`
- `docs/verification/53-demo-document-summary/demo-documents-390.png`

## 로컬 QA 환경 메모

- 로컬 QA 빌드: `NEXT_PRIVATE_OUTPUT_TRACE_ROOT='D:\바이브코딩\sasu'` 필요(node_modules 정션). 그래도 메인 체크아웃의 미커밋 `instrumentation.ts`·`sentry.server.config.ts`가 워크트리 빌드에 섞여 `@/lib/telemetry`를 찾지 못해, 빌드 동안만 임시 스텁 `lib/telemetry.ts`를 두고 빌드 후 삭제했다(커밋 대상 아님).
- 포트 3011은 2026-10-05부터 떠 있던 다른 `next start`(PID 25384, 500 응답)가 점유 중이라 건드리지 않았다. 래퍼 복사본(`scripts/_review-qa-3012.mjs`, 삭제함)으로 3012에서 서버를 띄워 E1·E2를 실행했고 종료했다.
- 래퍼의 `E2E_BASE_URL`이 3011로 고정이라 첫 E2 시도(3011 오접속, 500)는 폐기하고 3012로 재실행했다.
- 덮어쓴 기존 증거 파일(`docs/verification/csp-rendering-*`, `department-hiring-demo`, `plain-language-audit-*`, `review-state-recovery-*`)은 `git restore`로 되돌렸다.

## 실행하지 않은 것

- 운영 DB 시드·`db push`·운영 E2E: 사용자 승인 단계(design §9).
- Graft·Archify: 세션에 CLI 없음.

## root 검토·보완 (2026-10-07)

- **번호 변경**: 같은 날 메인 체크아웃에서 다른 세션이 `phase 52`·`ADR-091`(search-observability, 미커밋)을 쓰고 있어 이 작업을 `phase 53`·`ADR-092`로 바꿨다. 폴더(`phases/53-…`, `docs/verification/53-…`)·문서·주석만 바뀌고 동작은 같다.
- **E2 실패 4건 원인 확인**: 로컬 QA DB의 `is_demo` 부서 목록을 조회하니 데모 시드가 만든 7개 부서 외에 2026-10-05 21:41·21:43(KST)에 다른 테스트가 만든 빈 "데모 부서" 2개(`d2f21e3f-…`, `27328386-…`, items 0)가 있었다. guest·ui-refresh 스펙은 이 부서를 먼저 열어 실패했다. 데모 시드(데모 조직만 truncate)와 이번 변경은 이 부서들을 만들거나 바꾸지 않는다 → 환경 원인. 운영 E2E는 반영 후 다시 돌린다.
- **화면 보완**: 캡처에서 데모 요약 구역이 실제 문서 화면보다 간격이 없고 「원문 근거」 인용에 카드 스타일이 빠져 있었다(실제 화면은 `.document-detail` grid 간격과 링크 카드). `components/demo-document-workspace.tsx`에 `.demo-document-summary` 래퍼를 두고 `app/globals.css`에 grid 간격·인용 카드 규칙 2줄을 더했다. 로컬 개발 서버는 worktree의 `node_modules` 정션 때문에 Turbopack이 거부하고 webpack 컴파일이 I/O에서 멈춰, 실제 `globals.css`를 읽는 정적 페이지로 전후를 비교했다: [전](style-fix-before.png) · [후](style-fix-after.png). 운영 반영 후 E1로 실제 화면을 다시 캡처한다.
- 「원문 기록 5개」 목록이 4개만 보이는 것은 기존 `max-height: 480px` 스크롤 영역 때문이다(5번째는 스크롤 안쪽). 변경 없음.
- 재실행: `npm run lint` blocking 0 · `npx tsc --noEmit` 0 · 관련 vitest 4파일 33 passed.
- 3011 포트를 잡고 있던 2026-10-05 로컬 QA 서버(PID 25384, 500 응답)와 이번 개발 서버는 종료했다.
