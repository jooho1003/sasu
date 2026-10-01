# Step 7 — companion-sales-review 검증 기록

- 일시: 2026-10-02
- 설계: `docs/02-design/features/desktop-companion.design.md` §4(E14~E16·W06), §5.3
- 범위: AG-07의 기존 원문 선택·재검사·작업 생성 계약을 웹과 데스크톱 앱이 같은 `ActorContext` 경로로 사용하게 한다.

## 구현 결과

- `startSalesSourceReview()`는 팀장·동의·비데모 확인 뒤 `sales_source_review_inputs`와 `request_sales_source_review`를 호출하고 기존 워커를 깨운다.
- `readSalesSourceReviewStatus()`는 현재 요청자·부서의 작업 상태만 반환한다.
- 웹 AI POST와 후보 GET도 같은 공용 함수를 사용한다. 웹의 결과 상세 읽기는 그대로 유지한다.
- E14 후보, E15 요청, E16 상태 경로는 결과 본문·원문을 복제하지 않는다. E16은 상대 웹 경로와 상태만 반환한다.
- 받은 일의 `sales`에는 현재 팀장의 최근 24시간 작업 ID·상태만 넣었다.

## 경계 확인

- AG-07 SQL/RLS/job 마이그레이션은 수정하지 않았다.
- 멤버 E14는 `403 lead_only`다. 데모 계정은 기기 연결 단계에서 `403`으로 차단되어 E14에 도달하지 못한다.
- 동일 `request_id` 재요청은 같은 작업 ID를 반환한다. 다른 사용자의 E16은 `404`다.
- E15는 의도적으로 기존 AG-07 워커를 시작하므로 작업 자체의 모델 호출은 가능하다. 후보·받은 일·상태 조회가 별도 모델 호출을 만들지 않는다.

## 도구 및 관계 확인

- 구현 전후 `rg`로 웹 AI POST/GET, 후보 GET, `sales_source_review_inputs`, `request_sales_source_review`, 받은 일 소비 경로를 대조했다.
- 이 실행 환경에는 Graft와 Archify의 호출 가능한 도구가 없어, 해당 도구의 그래프·시각화 산출물은 만들지 못했다. 공용 함수의 호출자와 데이터 경계는 코드 검색 및 아래 로컬 API/E2E로 확인했다.

## 실행 결과

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/sales-source-review-start.test.ts tests/sales-review-source-candidates.test.ts tests/companion` | PASS — 5 files, 30 tests |
| `npm run lint` | PASS — 오류 0, 기존 경고 2개 및 wording 비차단 경고 82개 |
| `npm run build` | PASS — Next.js production build 및 TypeScript 통과 |
| `npm run test` | PASS — 183 files, 1,834 tests |
| `node scripts/verify-companion-api.mjs` | PASS — member E14 403, 데모 기기 연결 403, lead E15 202·멱등, inbox 표시, 타 사용자 E16 404 확인 |
| `node scripts/review-qa.mjs sales-review-sources-test` | 서버 미기동으로 최초 실행은 연결 거부. 동일 로컬 QA 서버를 기동하고 필요한 QA 환경 변수로 재실행한 Playwright는 PASS — 1 test |
| `git diff --check` | PASS |

운영 DB·배포·외부 발송은 수행하지 않았다.
