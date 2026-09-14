# Step 2: polish-verification

## 읽어야 할 파일

- `/docs/PRD.md` §9 D11 · §11 전체
- `/docs/submission-checklist.md` §12 게이트 · 제출 전 확인
- `phases/6-polish/step0-output.json`, `phases/6-polish/step1-output.json`

## 작업

lint → build → unit test → Playwright test list → 로컬 production 게스트 100명 부하 검증을 순서대로 실행한다. 결과를 `docs/verification/D11-polish.md`에 명령·시각·수치와 함께 기록한다. 사람 작업과 운영 부하 검증은 완료로 과장하지 않고 남은 항목으로 분리한다.

## Acceptance Criteria

```bash
npm run lint
npm run build
npm run test
npx playwright test --list
LOAD_TEST_BASE_URL=http://127.0.0.1:3000 LOAD_TEST_USERS=100 npm run test:load:demo
```

## 금지사항

- 로컬 결과를 운영 100명 검증으로 기록하지 마라. 이유: 실행 환경이 다르다.
- Claude가 수정한 PRD·ADR·제출 문서를 되돌리거나 재포맷하지 마라. 이유: 사용자 작업 보존 원칙이다.
- 새 기능을 추가하지 마라. 이유: D10 기능 프리징 범위다.
