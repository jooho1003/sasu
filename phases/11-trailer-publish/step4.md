# Step 4: trailer-review-ui

## 읽어야 할 파일

- `/docs/PRD.md` §7 디자인 가이드 · §8-3
- `/docs/ADR.md` ADR-045 (특히 2항 발행 조건 세 가지, 법적 한계)
- `docs/planning/메인웹사이트_관리자콘솔_설계.md` §C-3 · §C-5 화면 표(S17·S18·S19·관리자 행) · §L1 "부서장 — 예고편" 흐름·고칠 것 9 · §L3 사용자가 보는 것 열
- 화면 시안: https://claude.ai/code/artifact/a1bb2164-6ad5-4659-bfd5-2cdeb68839c3 (접근할 수 없으면 설계 표만 따른다)
- step 2·3 산출물: `lib/trailer-gate.ts`(`trailerApprovalItems`), `lib/contracts.ts`(`TrailerScenario`, `TrailerGateReport`, `AdminOverview`), `app/api/d/[dept]/trailers/**`, `app/api/admin/trailer-publishing`, `app/api/admin/trailers/[id]/unpublish`, `lib/features.ts`
- phase 10 산출물: `app/admin/page.tsx`, `components/admin/*`(개요 KPI의 "공개 중인 예고편" 칸)
- 부서 화면 내비게이션: `components/dashboard-s1.tsx` 242~249행, `components/document-assistant.tsx`, `components/agent-roles.tsx`(내비 링크 모양)

## 작업

모든 화면은 `trailerPublishEnabled()`가 false면 `notFound()`이고, 부서장 화면은 `requirePageMembership` 후 lead가 아니면 "부서장만 볼 수 있습니다" 안내를 렌더한다(표시는 UX, 권한은 RLS·RPC).

### 1. S17 목록 `app/(auth)/d/[dept]/trailers/page.tsx`

- 상태 칩: 생성 중 · 검사 중 · 검토 · 발행 · 철회 · 실패(`status_reason` 한국어 문구: `invalid_scenario` "가상화 초안을 만들지 못했습니다", `timeout` "시간이 초과됐습니다", `trailer_decisions_invalid` "선택한 결정을 쓸 수 없습니다") · [새 예고편].
- `generating`·`checking` 행이 있으면 목록을 10초마다 갱신한다(클라이언트 폴링, `GET …/trailers`). 떠나도 된다는 안내 한 줄.
- 원장 후보가 0개면 빈 상태: "원장에 부서 공개 결정이 있어야 예고편을 만들 수 있습니다" + 원장 링크.

### 2. S18 만들기 `app/(auth)/d/[dept]/trailers/new/page.tsx`

- `GET …/trailers/candidates` 표(결정 요약·결정일·카드 제목), 1~3개 선택 체크박스.
- 가릴 고유명사 입력(쉼표·줄바꿈 구분, 최대 50개) · 공고 URL(선택, "https로 시작하는 주소만") · 기준표는 기본 4개를 읽기 전용으로 보여 준다(편집 없음).
- 생성 → 202 → 목록으로 이동. 429면 "오늘 생성 한도를 넘었습니다".

### 3. S19 검토·발행 `app/(auth)/d/[dept]/trailers/[id]/page.tsx`

- **좌: 원문** — 세션 클라이언트로 그 예고편의 `source_decision_ids` 결정(`outcome`·`rationale`)과 카드 제목을 읽는다(RLS). 원칙 문서는 제목과 "원칙 문서 N개가 입력에 쓰였습니다"만 표시한다.
- **우: 가상화본** — 시나리오별 필드 편집기(제목·요약·사실·대화·선택지·엔딩). 저장 → PATCH(`seenUpdatedAt` 포함) → 422면 해당 입력란 아래 오류, 409 `trailer_stale`이면 "다른 곳에서 바뀌었습니다. 새로고침하세요".
- 위반 표시: `gate_report.violations`의 `path`에 해당하는 필드를 강조하고 규칙 라벨(원문 20자 겹침·고유명사·개인정보 형식·형식 오류)을 붙인다. 위반이 20개를 넘으면 "다시 생성을 권합니다" + [다시 생성](재생성은 실패 상태에서만 가능하므로, 검토 상태에서는 [삭제 후 새로 만들기] 안내).
- [다시 검사] → recheck.
- **항목별 공개 승인**: `trailerApprovalItems(scenarios)`로 체크박스 목록을 만든다. "승인 N / 전체 M" 표시. 저장 → approve 라우트. 검사 통과(`gate_report.passed`)가 아니면 체크박스를 비활성화한다.
- **고정 문구**(항상 보임): "자동 검사는 수치·전략이 가상화됐는지 판단하지 못합니다. 항목마다 직접 확인한 뒤 승인하세요."
- 발행 영역: 조직 공개 허용이 꺼져 있으면(세션 RPC로 확인할 방법이 없으면 발행 시도의 409 `trailer_publishing_disabled` 응답으로 판단) "조직 관리자가 공개 예고편을 허용해야 발행할 수 있습니다" 안내 · [발행] → 확인 대화상자 → 링크 표시 + [복사] · 발행 상태면 [철회] · `review`·`failed`·`unpublished`에서만 [삭제].
- 철회 후 재발행하면 "새 링크로 발행되었습니다"를 보여 준다.

### 4. 조직 관리자 개요 섹션 (`app/admin/page.tsx`, `components/admin/*`)

- `AdminOverview.trailer_publish_enabled` 스위치(모드 `on`이고 발행 플래그 on일 때만 조작 가능, 끌 때 "공개 중인 예고편이 모두 철회됩니다" 확인) · `published_trailers` 목록(부서·제목·발행일·공개 경로 링크) + [철회].
- KPI "공개 중인 예고편" 칸에 개수를 채운다. `readOnly`(게스트)면 스위치·[철회] 없이 목록만.

### 5. 내비게이션

- 부서장에게만 부서 화면 내비에 "예고편" 링크를 추가한다(플래그 on일 때). 공용 내비 컴포넌트가 없으므로 `dashboard-s1.tsx`의 링크 묶음 한 곳에만 추가하고 다른 화면은 건드리지 않는다.

### 카피 규칙

- 쓰지 않는 표현: "적합도", "평가", "합격", "AI가 거른다", "심판", 경쟁사 이름. 예고편은 "지원자가 입사 전에 부서의 일을 체험하는 가상 사례"로 설명한다.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
rg -n "적합도|합격|AI가 거|심판" "app/(auth)/d/[dept]/trailers" components/trailers   # 결과 0줄
```

## 검증 절차

1. AC를 실행한다.
2. 체크리스트: 발행 버튼 활성 여부를 화면이 판정하더라도 실제 발행은 RPC 응답으로만 결정되는가 · 원문 영역이 세션 클라이언트(RLS)로만 읽는가 · 고정 문구가 항상 렌더되는가 · `readOnly`에서 스위치·철회가 사라지는가.
3. 로컬 서버를 `SASU_TRAILER_PUBLISH_ENABLED=true`로 띄워 `/d/<임의 uuid>/trailers`가 로그인으로 보내는지만 확인한다(0027 미적용 DB라 데이터 확인은 하지 않는다).
4. `phases/11-trailer-publish/index.json` step 4를 갱신한다.

## 금지사항

- 공개 체험 페이지(`/t/[slug]`)와 phase 7 컴포넌트를 수정하지 마라. 이유: step 5 범위다.
- 게스트 화면을 만들지 마라. 이유: step 6 범위다.
- 해시·승인 완료 여부를 화면에서 계산해 저장하지 마라. 이유: SQL이 판정한다.
- 운영 DB에 예고편을 만드는 수동 확인을 하지 마라. 이유: 생성은 실제 LLM 호출이고 O11 승인 범위다.
