# Step 4: admin-ui

## 읽어야 할 파일

- `/docs/PRD.md` §7 디자인 가이드 · §8-3 법적·윤리 전제
- `/docs/ADR.md` ADR-044 (특히 "권한만으로는 내용을 볼 수 없다" 표현)
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §B-3 · §B-7 화면 표(S11·S12·S13·S14·S16·S5 보강) · §L1 4·5·6 · §L3 사용자가 보는 것 열
- 화면 시안: https://claude.ai/code/artifact/a1bb2164-6ad5-4659-bfd5-2cdeb68839c3 (접근할 수 없으면 설계 표만 따른다)
- step 2·3 산출물: `lib/contracts.ts` Admin 계약, `lib/org-admin.ts`(`adminErrorMessage`·`answerStatsRange`), `lib/features.ts`, `lib/supabase/org-admin.ts`, `app/api/admin/**`, `app/api/d/[dept]/invites/**`, `app/api/d/[dept]/members/**`, `app/api/invites/accept/route.ts`, `app/auth/signout/route.ts`
- `components/settings-s5.tsx`(370~416행 멤버 목록, 277~303행 동의 요청), `app/(auth)/d/[dept]/settings/page.tsx`, `app/(auth)/d/[dept]/layout.tsx`
- 스타일 기준: `app/globals.css`(phase 9 base layer·토큰), `components/site-shell.tsx`, `components/settings-s5.tsx`

## 작업

### 1. `/admin` 영역 (서버 컴포넌트, 세션 클라이언트 RPC → Zod 파싱 → 렌더)

- `app/admin/layout.tsx`: `requireOrgAdmin()` → `forbidden`이면 "조직 관리자 권한이 없습니다" 안내(로그아웃·데모 보기 링크). 헤더: 조직명 · "조직 관리자" 표시 · 탭(개요 `/admin` · 멤버 `/admin/members` · 수집 채널 `/admin/sources` · 기록 `/admin/audit`) · 고정 안내 "조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다". `metadata.robots = { index: false }`.
- `app/admin/page.tsx` (S11): KPI 4개(부서 · 멤버·동의 · 연결 소스 · 공개 중인 예고편 — 예고편 칸은 phase 11 전까지 "준비 중") · 부서 표(부서장·멤버·동의·소스·30일 결정·30일 질문; 멤버 0명 부서는 "부서장 없음" 배지 + [첫 부서장 초대]) · [부서 만들기] · 이번 달 AI 호출 수 · 부서 0개 빈 상태("첫 부서 만들기").
- `app/admin/members/page.tsx` (S12): 탭 [멤버 / 대기 중 초대] · 멤버 표(이름·이메일·부서·역할·동의·슬랙) · 행 동작 [부서장 해제](그 부서에 다른 부서장이 있을 때만) · [제외] 확인 대화상자 · 안내 "기존 부서의 멤버 초대와 부서장 지정은 부서장이 부서 세팅에서 합니다" · **초대 버튼 없음** · 대기 초대 [철회].
- `app/admin/sources/page.tsx` (S13): 조직 전체 소스 표 + 부서 필터(searchParams) · 안내 "채널 추가·제거는 부서장이 부서 세팅에서 합니다" · 읽기 전용.
- `app/admin/audit/page.tsx` (S14): 탭 [답변 집계 / 관리 기록] · 설명 카드 3칸 "보이는 것(일별·부서별 답변·거절·실패 수, 인용 가시성별 합계) / 보이지 않는 것(질문 원문, 질문자, 답변 한 건의 시각과 인용) / 준비 중(권한 경계 판정)" · 기간 선택(`from`·`to` searchParams, `answerStatsRange`로 검증, 최대 31일) · 관리 기록 표(행위자·액션 한국어 라벨·대상).
- 쓰기 버튼은 `orgAdminWritesEnabled()`가 false면 렌더하지 않는다(모드 `readonly`). 표시 여부와 무관하게 서버·SQL이 권한을 집행한다.

### 2. 재사용 컴포넌트 (`components/admin/`)

- `AdminOverviewView`, `AdminMembersTable`, `AdminSourcesTable`, `AdminAnswerStatsTable`, `AdminEventsTable`은 `readOnly?: boolean` prop을 받는다. step 5의 `/demo/admin`이 같은 컴포넌트를 쓴다. `readOnly`면 이메일 열·행 동작·초대 탭을 렌더하지 않는다.
- 쓰기 동작은 클라이언트 컴포넌트(`AdminActions` 등)로 분리한다: 부서 만들기 대화상자, 첫 부서장 초대 대화상자(이메일 입력 → 링크 표시 + [복사] + "이 창을 닫으면 링크를 다시 볼 수 없습니다"), 해제·제외·철회 확인 대화상자. 성공 후 `router.refresh()`. 오류는 응답의 `message`를 입력란 아래에 표시한다.
- 이미 대기 중 초대가 있으면(409 `invite_pending`) "[기존 초대 철회 후 새 링크]" 동작을 제공한다(설계 §L3).

### 3. 초대 수락 `app/invite/[token]/page.tsx` (S16)

- 플래그 off → `notFound()`. 세션 클라이언트로 `invite_preview` 호출. null → "초대 링크를 찾을 수 없습니다".
- 상태별: `valid` + 비로그인 → 부서·역할·가린 이메일 + [이 이메일로 로그인](`/login?next=/invite/<token>`) · `valid` + 로그인 → 표시 이름 입력(현재 이메일 로컬 파트로 미리 채움, 1~40자) + [초대 수락] → accept 라우트 → 응답 `next`로 이동 · 수락 응답이 `invite_email_mismatch` → "다른 계정으로 로그인되어 있습니다" + 로그아웃 폼(POST `/auth/signout`, `next=/invite/<token>`) · `expired`·`revoked`·`accepted` → "관리자나 부서장에게 새 초대를 요청하세요".
- `metadata.robots = { index: false }`. 토큰을 화면 텍스트·로그에 출력하지 않는다.

### 4. 부서장 S5 보강 (`components/settings-s5.tsx`)

- `app/(auth)/d/[dept]/settings/page.tsx`가 `memberAdminEnabled={orgAdminWritesEnabled()}` prop을 넘긴다. false면 아래 UI를 렌더하지 않는다.
- lead에게만: [멤버 초대] 대화상자(역할은 "멤버" 고정 표시, 링크 복사) · 멤버 행마다 [부서장으로 지정] / [부서장 해제] / [제외](확인 대화상자) · 대기 초대 목록(`GET /api/d/[dept]/invites`: 이메일·만료·초대한 사람·일시) + [철회].
- 기존 동의 상태·슬랙 매핑·동의 요청 DM 동작은 그대로 둔다.

### 5. 부서 화면에서 관리 콘솔로 가는 링크

- `app/(auth)/d/[dept]/layout.tsx`: `orgAdminReadEnabled()`이고 세션 RPC `admin_org_id()`가 null이 아니면 상단에 "조직 관리 →"(`/admin`) 링크 하나를 추가한다. 호출 오류는 링크를 숨기고 페이지 렌더를 막지 않는다.

### 카피 규칙

- 쓰는 문장: "조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다"
- 쓰지 않는 표현: "관리자는 내용을 볼 수 없습니다"(절대 문장, ADR-044) · "감시"(부정문 포함) · "위반 0건"·"안전" 같은 판정 값 · 경쟁사 이름

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
rg -n "관리자는 (내용|부서 내용)을 볼 수 없|감시|위반 0" app/admin components/admin app/invite   # 결과 0줄
```

## 검증 절차

1. AC를 실행한다. `rg`가 1줄이라도 찾으면 문구를 고친다.
2. 체크리스트: 모든 관리 페이지가 RPC 결과를 Zod로 파싱하는가 · `readOnly`에서 이메일·행 동작이 사라지는가 · 쓰기 버튼이 모드 `readonly`에서 사라지는가 · 초대 링크가 대화상자 밖에 저장되지 않는가.
3. 로컬 서버를 `SASU_ORG_ADMIN_MODE=on`으로 띄워 `/admin`이 비로그인에서 `/login?next=/admin`으로 가는지, `/invite/abc`가 오류 없이 "찾을 수 없습니다"(0026 미적용 DB면 RPC 오류 화면)를 보여 주는지 확인한다. DB 쓰기가 필요한 확인은 하지 않는다.
4. `phases/10-org-admin/index.json` step 4를 갱신한다.

## 금지사항

- 새 UI 라이브러리·아이콘 패키지를 추가하지 마라. 이유: ADR-043 — 프리징 직전 번들·공격면 증가.
- 서버 컴포넌트에서 service role을 쓰지 마라. 이유: 요청 경로 service role 금지(불변식 2).
- 관리 화면에 부서 콘텐츠(카드·원장·답변 본문, 질문)를 조회하는 코드를 넣지 마라. 이유: ADR-044 1.
- 운영 DB에 쓰는 수동 확인(부서 생성·초대 수락)을 하지 마라. 이유: O10 승인 범위다.
- `/demo/admin`·동의 문구·시드는 만들지 마라. 이유: step 5 범위다.
