# 로그인 없는 데모 기능 완주 검증 — 2026-09-18

## 구현

- 공개 부서 4곳의 9개 메뉴를 로그인 없이 열 수 있다. 문서/세팅/보존/검토 화면의 심사 계정 요구 및 inert 화면 의존을 제거했다. 실제 인증 API의 권한은 변경하지 않았다.
- 좌측 메뉴 접기/열기, 스크롤바, 로딩 상태, 근거 확인의 실제 카드 이동을 추가했다.
- `/demo/features?dept=...`는 기능 설명과 현재 부서 바로가기를 제공한다.
- 영업 합성 기록 64개: 슬랙 24개, 회의 기록 24개(2개 회의), 문서 기록 16개(8개 문서). 8개 결정/보류 안건을 원문과 연결했다. 공용 DB 시드는 변경하지 않았다.
- 문서/회의별 결정 조회 및 보류 후속 결정은 부서별 React 메모리에 추가한다. 기존 기록과 연결하며 문서↔원장 이동에서 유지한다. 새로고침하면 초기화된다.
- `외주사 b견적은?` 근사 매칭, 무관한 질문의 근거 없음, 답변으로 스크롤/포커스 이동을 검증했다. 음성은 샘플 입력→전사 문구→근거 답변 체험이며 실제 마이크/STT가 아니다.
- 자료 검토, 동의/채널/공개 범위 설정, 보존 정책, 합성 JSON 내려받기, 예고편의 단서 선택→결정 기록을 조작했다.

## 실행 기록

- TDD: `npx vitest run tests/demo-workspace.test.ts` — 모듈 작성 전 import 실패 확인 후 구현, 2개 통과.
- `npm run lint` — 통과.
- `SASU_VERIFY_BUILD=1 npm run build -- --webpack` — 프로덕션 컴파일·타입·페이지 생성 통과. 기존 개발 서버와 빌드 산출물을 분리했다.
- `npm run test -- --reporter=dot` — 94개 파일, 1,105개 테스트 통과.
- `E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/demo-public-workspace.spec.ts` — 공개 메뉴/질문/보류 결정/390px/4개 부서 전체/자료·설정·예고편, 6개 통과. 브라우저 쓰기 요청 0건 및 첫 직접 진입의 인증 쿠키 0개 확인.
- 최종 회귀: `E2E_BASE_URL=http://localhost:3100 npx playwright test tests/e2e/demo-public-workspace.spec.ts tests/e2e/guest.spec.ts tests/e2e/ui-refresh.spec.ts --grep-invert '로그인한|모바일 메뉴로 로그인' --reporter=list` — **13개 모두 통과 (1.2분)**. 실제 부서 404, 잘못된 Slack/worker 요청 거부, 데모 열람 전후 llm_calls/jobs/items/answers/decisions/citations 행 수 불변을 확인했다.
- 추가 회귀에서 원장 직접 기록의 긴 근거 select가 390px 가로 넘침을 유발했다. form/label/select 최소 너비를 제한한 후 모바일 원장과 기존 UI 회귀가 통과했다. 기존 질문 검사도 스트리밍 완료 후 버튼을 확인하도록 보완했다.
- 기존 개발 서버(3011)에서는 컴파일 중 응답 지연으로 첫 E2E가 시간 초과됐다. DB 공개 RPC는 412ms에 4개 부서를 반환했다. 분리한 프로덕션 서버에서 검증을 완료했다. 테스트 서버 재시작 시 잔여 3100 프로세스도 확인 후 종료·재기동했다.

## 시각 확인

- [문서 모바일](documents-mobile.png): 390px에서 메뉴 접기, 문서 선택, 결정·보류·원문 표시. 가로 넘침 없음.
- [원장 데스크톱](ledger-desktop.png): 과거 보류 이력을 보존하면서 새 결정과 이유를 추가. 현재 부서 탐색 유지.
- [수동 흐름도](flow.md): 파일/참조 검색으로 작성했다. Graft/Archify 도구와 로컬 실행 파일이 없어 두 도구의 실행 결과는 없다. React/Next.js 스킬 및 설치된 Next.js 탐색 가이드를 참고했다.

## 반영 경계

로컬 소스와 검증만 수행했다. 운영 배포·공용 DB 시드·마이그레이션·git 커밋/푸시는 수행하지 않았다. 기존 작업 트리의 다른 변경을 보존했다. Vercel CLI가 없어 이후 배포·환경·로그 관리를 위해 `npm i -g vercel` 설치를 권장한다.

검토용 프로덕션 서버: `http://localhost:3100/demo/d/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb`. 기존 개발 서버 3011은 종료하지 않았다. 검증 빌드가 바꾼 next-env.d.ts 경로는 기존 `.next/types`로 복원했다.
