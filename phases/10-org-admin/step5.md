# Step 5: admin-guest-notice

## 읽어야 할 파일

- `/docs/PRD.md` §6-7 게스트 모드 · §8-3 · §11 "조직 관리자" 행의 `/demo/admin` 조건
- `/docs/ARCHITECTURE.md` §6 불변식 10(게스트 LLM 0·쓰기 0·실데이터 0) · §6-2 불변식 17
- `/docs/ADR.md` ADR-044 5·7항
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-7 "S6 보강" 행 · §B-8 동의문 · §L1 3
- step 0·4 산출물: `demo_admin_*` RPC(0026), `components/admin/*`(`readOnly`)
- `app/demo/page.tsx`, `app/demo/d/[dept]/layout.tsx` (phase 9에서 CTA가 추가됨 — 현재 구조를 먼저 읽는다), `lib/supabase/public.ts`
- `lib/consent.ts` 48~52행 "누가 보나", `tests/consent.test.ts` 53~62행, `lib/slack/blocks.ts` 246~251행, `tests/slack/blocks.test.ts` 83~84행, `docs/pilot-consent.md` 8~30행
- `scripts/seed-demo.ts` — 9~16행 고정 id, 402행 `DEMO_DEPARTMENTS`, 404~442행 `removeExistingDemoData`, 444~452행 `seedDemoDevLead`, 454~596행 `seedDepartment`; `tests/seed-demo.test.ts`

## 작업

### 1. 게스트 관리자 화면 `app/demo/admin/page.tsx`

- `orgAdminReadEnabled()`가 false면 `notFound()`.
- `createPublicSupabaseClient()`로 `demo_admin_overview`·`demo_admin_members`·`demo_admin_sources`·`demo_admin_answer_stats`(최근 14일)를 부르고 step 2의 `AdminOverview`·`DemoAdminMemberRow` 등으로 파싱한다. 실패하면 "데모를 준비하는 중입니다" 상태(기존 `/demo`와 같은 톤).
- step 4 컴포넌트를 `readOnly`로 렌더한다. 상단 "게스트 모드 · 읽기 전용" + 고정 안내 "조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다". 초대 탭·관리 기록·이메일 열·쓰기 버튼 없음.
- `export const revalidate = 60`. LLM 호출·쓰기 요청 0.
- `/demo` 부서 선택 아래에 카드 "조직 단위로 보기 →"(`/demo/admin`)를 **`orgAdminReadEnabled()`일 때만** 추가한다. 이유: 플래그가 꺼져 있으면 링크가 404로 간다.
- 메인 `/`(`app/(site)/page.tsx`)의 신뢰 섹션 제목 아래에 "조직 관리자 권한만으로는 질문·답변·카드의 내용을 볼 수 없습니다." 한 줄을 **`orgAdminReadEnabled()`일 때만** 렌더한다. R9 리뷰(9/15)에서 phase 10이 운영에 올라가기 전에 없는 역할을 설명하는 문장이라 뺐다. 절대 문장("관리자는 볼 수 없다")으로 바꾸지 않는다(ADR-044).

### 2. 데모 합성 멤버 (`scripts/seed-demo.ts`)

게스트 관리자 화면이 "부서장 없음"으로 비지 않게 한다.

- 네 데모 부서마다 부서장 1명 + 멤버 2명이 되도록 합성 사용자를 추가한다(개발팀은 기존 `DEMO_DEV_LEAD_ID` 유지). 고정 UUID, 이메일은 `@demo.invalid`, 표시 이름은 합성 한국어 이름, 동의 상태는 부서마다 섞는다(예: 3명 중 2명 동의).
- `removeExistingDemoData`가 새 사용자·멤버십도 지운다. 조직 삭제 전에 데모 조직의 `member_invites`·`org_admins`를 지우고, 데모 조직에 `admin_events` 행이 있으면 삭제하지 말고 명확한 오류로 중단한다(`admin_events`는 삭제 권한이 없다).
- 새 멤버는 기존 데모 데이터(카드 담당자·답변·역할)의 의미를 바꾸지 않는다. 기존 `asked_by`·`assignee_id`를 새 사용자로 바꾸지 않는다.
- `tests/seed-demo.test.ts`: 부서마다 부서장 ≥1 · 모든 데모 이메일이 `@demo.invalid` · 기존 `MASK_PATTERNS` 검사 대상 문자열에 이메일이 섞이지 않게(이메일은 계정 필드에만 있고 본문 픽스처에는 없음) 확인.

### 3. 조직 관리자 열람 범위 고지 (설계 §B-8, 문장은 ADR-044에 맞춰 조정)

`lib/consent.ts` "누가 보나" 항목의 `body` 끝에 아래 세 문장을 그대로 붙인다. **테스트를 먼저 바꾼다**(`tests/consent.test.ts`, `tests/slack/blocks.test.ts`의 전체 원문 비교).

> 조직 관리자는 멤버 목록(이름·이메일·부서·역할)과 동의 상태, 부서별 질문 수와 인용 통계를 볼 수 있습니다. 조직 관리자 권한만으로는 질문·답변·카드·원장의 내용과 질문자별 기록을 볼 수 없습니다. 조직 관리자는 새 부서의 첫 부서장을 지정할 수 있고, 지정된 부서장은 부서 설정에서 확인할 수 있습니다.

- 설계 §B-8 원문의 "…볼 수 없습니다"(주어가 조직 관리자인 절대 문장)를 쓰지 않는 이유: 관리자가 부서 멤버이기도 하면 그 부서는 볼 수 있으므로 거짓이 된다(ADR-044, R-2).
- `CONSENT_VERSION`은 1 그대로 둔다. 이유: 수집·이용 범위가 바뀌지 않아 고지로 처리한다(ADR-044 5).
- `docs/pilot-consent.md`의 5번 "누가 보나" 본문을 같은 문장으로 맞춘다.
- 슬랙 동의 DM(`lib/slack/blocks.ts`)이 같은 `CONSENT_SECTIONS`를 쓰는지 확인한다. 따로 복제된 문장이 있으면 원천을 하나로 합치지 말고 같은 문장으로 맞춘 뒤 테스트로 고정한다.

## Acceptance Criteria

```bash
npm run test -- tests/consent.test.ts tests/slack/blocks.test.ts tests/seed-demo.test.ts
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
```

- `SASU_ORG_ADMIN_MODE` 없이 로컬 서버를 띄우면 `/demo/admin`이 404이고 `/demo`에 "조직 단위로 보기" 카드가 없다(Playwright 한 번 또는 `curl -s -o NUL -w "%{http_code}"`로 확인).

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: `/demo/admin`이 public 클라이언트만 쓰는가 · 렌더 HTML에 `@` 이메일 문자열이 없는가(`demo_admin_members`에 email 키가 없어야 한다) · 고지 문장이 세 곳(`lib/consent.ts`·슬랙 블록·`pilot-consent.md`)에서 같은가.
3. `phases/10-org-admin/index.json` step 5를 갱신한다.

## 금지사항

- `npx tsx scripts/seed-demo.ts`를 실행하지 마라. 이유: 운영 DB의 데모 데이터를 지우고 다시 쓴다. O10 승인 범위다.
- 동의 버전을 올리거나 재동의 게이트를 만들지 마라. 이유: ADR-044 5, 설계 §B-8(R-7).
- 게스트 화면에서 세션 클라이언트·service role·LLM을 쓰지 마라. 이유: 불변식 10.
- 데모 조직에 `org_admins` 행을 시드하지 마라. 이유: 게스트 화면은 조직 인자 없는 `demo_admin_*`로 충분하고, 관리자가 생기면 데모 조직에 `admin_events`가 쌓일 수 있다.
