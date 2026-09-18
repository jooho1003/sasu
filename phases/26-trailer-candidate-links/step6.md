# Step 6: demo-invite-mock

데모(`/demo/d/[dept]/trailers`)에 지원자별 링크 발급을 **브라우저 안에서만** 흉내 낸다. DB 쓰기 0 · LLM 0 · 실제 토큰 0.

## 읽어야 할 파일

- `/docs/ADR.md` ADR-062 5항 · ADR-059(데모 경계) · `/docs/PRD.md` §3-2 phase 26 행 "데모는 브라우저 전용 흉내"
- `docs/planning/예고편_지원자링크_설계.md` §7
- `app/demo/d/[dept]/trailers/page.tsx` · `fixtures/trailer/scenarios.ts` · `fixtures/trailer/demo-attempts.snapshot.json`(합성 지원자 A·B·C 라벨) · `lib/trailer-snapshot.ts`
- step 2 `components/trailers/invites.tsx`(같은 표 모양을 재사용하되 데이터만 합성) · step 3 `components/trailer-invite-flow.tsx`(동의 화면 모양 재사용)
- `components/demo-safe-actions.tsx`·`components/demo-workspace-state.tsx`(데모의 "안전 체험" 배너·React 메모리 상태 패턴)
- `tests/e2e/demo-public-workspace.spec.ts` 94~121행(데모 조작 시 쓰기 요청 0건 검사)

## 작업

1. `components/demo-trailer-invites.tsx` (client): "지원자 링크 발급 체험" 구역. 합성 지원자 A·B·C(이메일은 `candidate-a@example.com` 형식의 예약 도메인만) 목록 + [링크 만들기] → 링크 `/demo/d/${dept}/trailers?candidate=A` 표시·[복사]. 상태는 React 메모리(새로고침 초기화, 배너 문구는 기존 "안전 체험"과 동일). 서버 요청 0.
2. `app/demo/d/[dept]/trailers/page.tsx`: `searchParams.candidate`가 `A|B|C`면 체험 상단에 "합성 지원자 A의 링크로 들어온 화면입니다. 실제 지원자 링크는 이메일 확인과 동의 뒤에 열립니다" 배너와 동의 화면 **모양만**(체크 → 계속) 보여 준 뒤 기존 `RecruitmentTrailer`(제출 prop 없음)를 렌더. 점수표는 기존 합성 스냅샷 그대로.
3. `/demo/features`·`lib/demo-access.ts`의 예고편 설명에 "지원자별 링크 발급 체험" 한 구절 추가(href는 기존 예고편 경로).
4. E2E: `tests/e2e/demo-public-workspace.spec.ts`에 케이스 추가 — 발급 체험 클릭·복사·`?candidate=A` 진입 동안 **비-GET 요청 0건**, `trailer_invites` 관련 API 호출 0건, 페이지 오류 0.

## Acceptance Criteria

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/demo-public-workspace.spec.ts tests/e2e/guest.spec.ts
```

## 금지사항

- 데모에서 `create_trailer_invites` 등 실제 RPC를 부르지 마라(SQL이 어차피 거부하지만 호출 자체가 없어야 한다). 이유: 게스트 라우트 쓰기 0(ADR-059).
- `RecruitmentTrailer`에 `submission` prop을 데모에서 넘기지 마라. 이유: 데모 체험은 전송·저장 0.
