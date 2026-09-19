# Step 0 — 5개 부서 합성 신입 미션

입력: PRD §3-3·§8, ADR-059, ARCHITECTURE §6-3. 사용자가 합성 지원자·브라우저 내 제출을 승인했다.

구현: `fixtures/hiring/missions.ts`·`lib/contracts.ts`·`lib/hiring-demo.ts`·`components/hiring-demo.tsx`·`app/demo/hiring/page.tsx`. 기존 `scripts/seed-demo.ts`·`lib/demo-access.ts`·`app/demo/page.tsx`에서 신규 부서와 진입점을 연결한다.

완료 조건: 5개 직무별 참고자료·3단계·제출 조건, 부서 상태 격리, 코드 비실행, 파일 형식/크기 제한, 새로고침/선택 부서 초기화, 브라우저 무전송·서버 쓰기/LLM 0, 기존 부서 카드/원장/근거 답변 검증. 실제 채용 서버 기능과 운영 반영은 포함하지 않는다.

결과: [검증 기록](../../docs/verification/department-hiring-demo/README.md)의 실행 로그·스크린샷 기준 로컬 통과. Graft·Archify 연결 미제공으로 수동 의존 관계 확인만 수행한 범위를 명시했다.
