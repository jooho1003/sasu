# 공개 데모 기능 완주

입력: PRD §3·§8, ADR-061, AI-DEVELOPMENT.md.

완료 기준: 로그인 없는 직접 진입에서 모든 좌측 메뉴가 유지되고, 메뉴 토글·근거 카드·기능 지도·묻기·샘플 음성 전사·문서별 결정·보류 후속 결정·예고편이 동작한다. 브라우저 조작은 서버 쓰기/LLM 호출 없이 끝난다. 데스크톱과 390px Playwright 확인 및 lint/build/test 실행 기록을 남긴다.

변경 의존: demo layout → WorkspaceShell + DemoWorkspaceState → DemoDocumentWorkspace/결정 체험. readDemoWorkspace → anon RLS sources/items/decisions/citations + 명시적 합성 영업 기록. DemoQuestions → closestDemoAnswer. 기능 지도와 예고편은 공개 데모 경로.

Graft/Archify: 현재 세션에 호출 가능한 도구와 로컬 실행 파일이 없다. 실제 파일·참조 검색으로 의존 관계를 확인했으며 도구 기반 그래프/시각화 검증은 누락이다. 수동 구조 기록과 실행 결과는 docs/verification/demo-workspace/에 연결한다.
