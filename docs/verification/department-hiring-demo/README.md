# 5개 부서 신입 채용 데모 검증

2026-09-18. 상태: **로컬 구현·검증 통과 / 운영 미반영**. 원천: PRD §3-3·§8, ADR-059.

사용자 선택: 합성 지원자, 브라우저 메모리 내 제출. 서버 저장·LLM·실제 합불 없음.

## 구현 관계

`fixtures/hiring/missions.ts` → `/demo/hiring` → `HiringDemo` → 브라우저의 부서별 상태/단계 기록/첨부 File/제출 스냅샷.

같은 미션 데이터 → `scripts/seed-demo.ts`의 인사·프론트·백엔드 합성 부서 → 로컬 Supabase 게스트 읽기 RPC → 기존 결정/원장/묻기 화면. 기존 영업·개발·기획·디자인은 보존한다.

- 미션: 5개, 참고자료: 15개, 단계: 15개, 샘플 산출물: 5개.
- 신규 부서: 각각 4개 소스·16개 항목·2개 결정 카드·1개 이전 결정·6개 준비 답변.
- 결과는 같은 브라우저 화면에서만 확인한다. 파일은 File 객체로만 유지하며 내용 분석/실행·원격 게시·영속 저장을 하지 않는다.
- Graft·Archify 연결 도구를 이용할 수 없어 파일/호출자 수동 확인 범위만 기록했다. 도구 생성 그래프·시각화 결과는 없다.

## 실행 기록

신규 순수 검증 테스트를 먼저 실행해 모듈 없음 실패 확인 후 구현했다. 부서 시드 확장은 인사팀 누락·사용자 수 불일치 실패 확인 후 구현했다. 실제 시드에서 디자인/인사 소스 ID 충돌을 발견했고, 부서 간 ID 유일성 회귀 테스트를 먼저 추가해 실패 확인 후 새 ID 범위를 분리했다.

| 검증 | 결과 | 기록 |
|---|---|---|
| `npm run test` | 92파일·1,101개 통과 | [unit.txt](unit.txt) |
| `npm run lint` | 통과 | [lint.txt](lint.txt) |
| `SASU_VERIFY_BUILD=1 npm run build` | 타입 검사 포함 통과, `/demo/hiring` 생성 | [build.txt](build.txt) |
| `node scripts/review-qa.mjs hiring-test --max-failures=1` (부서 데이터 테스트 추가 전) | 미션 PC/모바일 10 + 격리/첨부/초기화 2 = 12개 통과 | [browser-verified.txt](browser-verified.txt) |
| `node scripts/review-qa.mjs hiring-test --grep '부서 데이터' --max-failures=1` | 5개 부서의 실제 로컬 DB→카드→원장→근거 답변 통과 | [workspaces-final.txt](workspaces-final.txt) |
| `node scripts/review-qa.mjs seed-demo` | 7개 부서·155개 항목·42개 답변, 2회 동일 결과 | [seed-final.txt](seed-final.txt), [seed-idempotent.txt](seed-idempotent.txt) |

브라우저 합계 **17개 통과**, 모두 실제 Next 개발 서버와 Chromium에서 실행했다. 부서 데이터 검증은 실제 로컬 Supabase를 사용했고 전후 `items/decisions/answers/jobs/llm_calls` 행 수가 동일했다. 미션 입력의 요청 전송 0, POST 등 쓰기 요청 0, localStorage/sessionStorage 0, 앱 IndexedDB 0을 확인했다. 개발 프레임워크가 만드는 `__next_debug_channel` DB 1개는 이름을 직접 확인한 뒤 앱 영속 저장 검사에서 제외했다. 운영 브라우저 검증이나 강제 CSP 성공을 의미하지 않는다.

초기 브라우저 실패는 Next의 숨은 route announcer와 `role=alert` 선택자가 겹친 문제, 개발용 IndexedDB를 앱 저장으로 계산한 문제, 초기 라우트 컴파일 시 URL 전환 대기를 빠뜨린 문제였다. 실제 미션을 건너뛰거나 검증 조건을 삭제하지 않고 대상/경계를 명확히 해 재검증했다.

| 부서 | 미션 | PC·모바일·부서 데이터 | 스크린샷 |
|---|---|---|---|
| 기획 | 온보딩 우선순위·출시 범위 | 통과 | [1440px](planning-1440.png), [390px](planning-390.png), [근거 답변](planning-workspace.png) |
| 인사 | 직무 기반 채용·온보딩 운영 | 통과 | [1440px](hr-1440.png), [390px](hr-390.png), [근거 답변](hr-workspace.png) |
| 프론트 | 실패 복구·접근성 제출 폼 코딩 과제 | 통과 | [1440px](frontend-1440.png), [390px](frontend-390.png), [근거 답변](frontend-workspace.png) |
| 백엔드 | 권한·멱등성 API 코딩 과제 | 통과 | [1440px](backend-1440.png), [390px](backend-390.png), [근거 답변](backend-workspace.png) |
| 디자인 | 모바일 제출 UI/UX·상태·복구 | 통과 | [1440px](design-1440.png), [390px](design-390.png), [근거 답변](design-workspace.png) |

## 인계와 경계

- 로컬 실행: `node scripts/review-qa.mjs dev --webpack`, `http://localhost:3011/demo/hiring`. 테스트 재실행: `node scripts/review-qa.mjs hiring-test`.
- Next.js/React 스킬을 적용해 고정 서버 입력과 클라이언트 메모리 상태를 분리했고, 독립 부서 상태·이벤트 처리·명시적 레이블·코드 텍스트 렌더링을 점검했다.
- 기존 데모 4개 부서의 합성 시드를 로컬 QA에서 재생성하고 3개 부서를 추가했다. 같은 ID로 재생성하는 시드이므로 원본은 리포 fixture에서 복구 가능하다. 운영 데이터는 변경하지 않았다.
- 실제 지원자 초대·업로드·코드 실행기·평가·외부 게시·영속 보관은 만들지 않았다. 샘플은 실제 수행 증거가 아닌 예시임을 표시한다.
- 기존 전체 기능/운영 회귀 전부를 새로 실행한 것은 아니다. 운영 배포·운영 시드 갱신은 별도 승인과 배포 후 확인이 필요하다. Vercel CLI는 미설치이며 운영 작업 전 `npm i -g vercel` 설치를 권장한다.
