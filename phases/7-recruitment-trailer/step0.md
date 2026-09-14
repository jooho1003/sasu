# Step 0: 공개 예고편 체험 슬라이스

## 읽어야 할 파일

- `docs/PRD.md` §3-1·§8-1·§11
- `docs/ARCHITECTURE.md` §6-1·§8
- `docs/ADR.md` ADR-039·040
- `lib/contracts.ts`, `app/layout.tsx`, `playwright.config.ts`

## 작업

PRD §3-1 범위의 `/trailers` 프리뷰를 구현한다. `lib/trailer.ts`는 테스트를 먼저 작성한다. 합성 퀘스트 3개와 모든 NPC·엔딩의 사실집 인용을 검증한다. 맵과 목록은 상태를 공유하며 단서 선택·결정 이유·기록실·재시작까지 구현한다. 기본 비활성 서버 환경 변수와 noindex를 적용한다.

## Acceptance Criteria

- `npm run lint` → `npm run build` → `npm run test` 통과.
- Playwright 데스크톱/모바일 3퀘스트 완주, 입력 누락·조작·모드 전환·초기화·비활성 404 확인.
- 플레이 데이터 전송·브라우저 영속 저장 0, 잘못된 인용 차단.
- 실행 결과·스크린샷을 `docs/verification/recruitment-trailer.md`에서 연결한다.

## 금지사항

- 실제 데이터·DB·LLM·채점·발행을 붙이지 않는다. 이 단계의 범위는 합성 체험 검증이다.
- R1 전체 완료나 실제 원장 자동 생성을 주장하지 않는다.
- 홈·게스트·제출물을 수정하지 않는다.

## 후속 단계 (이번 step 범위 밖)

실제 원장 입력 자격과 can_see/RLS → 가상화 job → 결정적 발행 검사 → lead 검수/승인/철회 → 공개 payload 조회를 별도 설계·검증한다.
