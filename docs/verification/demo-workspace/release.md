# 데모 수정 단독 반영 검증 — 2026-09-18

사용자 지시: 이번 데모 수정과 필요한 변경만 커밋·main 머지·원격 반영한다.

- 기능 커밋: 873c933 (37개 파일). 브랜치: feat/public-demo-workspace.
- main 머지: 71e2039. 기존 main의 선행 커밋을 유지하고 충돌 없이 병합했다.
- 제외: 미커밋 녹음·보안/원본 접근·채용 데모·노션 설계. 원래 작업 폴더에 보존했다.
- 공통 PRD/ADR/ARCHITECTURE와 demo/page는 데모 관련 부분만 분리했다. 노션 설계와 ADR 번호가 겹쳐 이번 공개 데모 결정은 ADR-061로 정리했다.
- 별도 채용 데모에 대한 추가 링크를 제외했다. 기존 합성 오피스 예고편은 데모 내부에서 직접 동작한다.

## 분리한 작업 폴더에서 실행

D:/바이브코딩/sasu-demo-release의 main 머지 결과만 검증했다. 기존 폴더의 미커밋 파일은 검증에 포함하지 않았다.

- npm run lint: 통과.
- npm run build -- --webpack: 컴파일·TypeScript·프로덕션 페이지 생성 통과.
- npm run test -- --reporter=dot: 84개 파일, 1,037개 테스트 통과.
- E2E_BASE_URL=http://localhost:3102 npx playwright test tests/e2e/demo-public-workspace.spec.ts tests/e2e/guest.spec.ts tests/e2e/ui-refresh.spec.ts --grep-invert '로그인한|모바일 메뉴로 로그인' --reporter=list: 13개 통과 (1.3분).
- 공개 4개 부서 전체 메뉴, 1440/390px, 근거 카드, 질문/샘플 음성, 문서별 보류 결정, 자료·설정·내보내기·예고편, 실제 부서 접근 차단 확인.
- 게스트 열람 전후 AI 호출 및 DB 행 수 증가 없음.
- 원격 대비 바뀐 텍스트 168개 파일을 로컬 환경의 비밀값과 비교: 일치 0건. 환경 파일·node_modules는 추적되지 않음을 확인했다.

앞선 README의 1,105개 단위 테스트는 다른 미커밋 작업까지 포함한 로컬 전체 검사다. 이번 분리 반영 코드의 검사 결과는 위 1,037개다. DB 마이그레이션·공용 시드는 변경하지 않았다. Graft/Archify 실행 결과 누락은 이전 기록과 같다.
