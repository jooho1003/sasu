# Step 0: guest-load-test

## 읽어야 할 파일

- `/docs/PRD.md` §9 D11 · §11 게스트 행
- `/docs/ARCHITECTURE.md` §6 불변식 · §8 테스트 경계
- `/docs/ADR.md` ADR-019(게스트 모드)
- `app/demo/**`, `scripts/seed-demo.ts`, `package.json`

## 작업

Node.js 내장 `fetch`만 사용하는 `scripts/load-test-demo.mjs`를 만든다. 기본값은 `LOAD_TEST_BASE_URL=http://127.0.0.1:3000`, `LOAD_TEST_USERS=100`이다. 각 가상 사용자는 `/demo`에서 실제 부서 링크를 찾고, 부서를 순환 배정받아 대시보드·원장·ASK·역할 화면과 첫 카드 상세를 순서대로 GET한다. 상태 코드·요청 시간만 집계하고 응답 본문이나 환경 변수는 출력하지 않는다. 요청 실패, 데모 오류 문구, 부서/카드 링크 부재가 하나라도 있으면 종료 코드 1이다. p50·p95·최대 응답 시간을 출력한다.

`package.json`에 `test:load:demo` 명령을 추가한다.

## Acceptance Criteria

```bash
npm run build
LOAD_TEST_BASE_URL=http://127.0.0.1:3000 LOAD_TEST_USERS=100 npm run test:load:demo
```

- 100명 전원이 게스트 흐름을 완주하고 HTTP 실패가 0건이다.
- 게스트 경로에서 POST·LLM 호출·DB 쓰기를 하지 않는다.

## 검증 절차

1. production 서버를 로컬에서 시작한 뒤 AC를 실행한다.
2. 요청 메서드가 GET뿐인지, 로그에 응답 본문·키가 없는지 확인한다.
3. 성공하면 index.json에 요약과 실행 수치를 기록한다.

## 금지사항

- 운영 URL에 자동으로 부하를 보내지 마라. 이유: 명시적인 대상 확인 없이 외부 자원을 소모하면 안 된다.
- 새 부하 테스트 의존성을 설치하지 마라. 이유: Node 내장 API로 충분하다.
- 게스트 경로에서 질문 생성이나 쓰기 API를 호출하지 마라. 이유: 게스트 LLM 0회·쓰기 0건 불변식이다.
