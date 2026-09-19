# 쉬운말 UI 검증

추천값 8개를 확정해 이름표 단일화, 핵심 메뉴 문구, LLM 공통 문체 지시, 보고 전용 검사기를 구현했다.

실행 기록:

- `npm run wording:check`: 198개 화면 파일을 검사했고 기존 문구 후보를 보고했다. 전체 위반을 차단하지 않는다.
- `npx vitest run tests/labels.test.ts tests/retro`: 통과
- `npm run lint`, `npx tsc --noEmit`, `npm run build`: 통과

동의 전문·개인정보 본문은 법률 검토 전까지 유지했다. 제출 스크린샷과 운영 배포는 9/20 제출 이후 별도 승인한다.
