# Step 8: 실제 모델 검증 재개

기준: PRD §3-7·§11, ADR-065·066, step6. 기존 작업 트리의 ASK 보완은 보존한다.

- 기존 샘플 도구를 현재 AnswerDraft의 문단 선택 계약에 맞춘다. 답변 원문은 문체 평가에서 제외하고 카드 3·요약 2건만 문체 분모로 사용한다.
- 생성 본문·질문·인용 원문을 결과에 저장하지 않는다. 건수·코드·지표만 저장한다.
- 실제 로컬 DB의 합성 시드와 llm.structured를 사용하고, 운영 DB·Slack 전송은 하지 않는다.
- 회귀 테스트 → 실제 표본 11건 → lint/build/test. 위반율 30% 초과면 step6의 프롬프트 보강을 1회 적용하고 재측정한다.
- phase30의 개발·기획 3일 검증에 선택적 실제 초안 생성 경로를 추가하여 실제 모델·DB·브라우저를 연결한다. 기존 수동 검증 경로는 유지한다.
- Graft/Archify MCP·PATH 도구가 확인되지 않아 실제 소스 import/호출 검색으로 대체한다. 누락 및 결과는 `docs/verification/model-resume-2026-09-23/README.md`에 기록한다.
- 외부 제공자 인증·실기기·사람 판정·운영 반영은 별도 조건으로 유지한다.

## 실행 명령

```powershell
npx vitest run tests/llm-style-report.test.ts tests/pipeline/retro-draft.test.ts
node scripts/review-qa.mjs llm-style
npm run lint
$env:SASU_VERIFY_BUILD='1'; node scripts/review-qa.mjs build
npm run test -- --maxWorkers=2
$env:SASU_VERIFY_BUILD='1'; node scripts/review-qa.mjs start
$env:E2E_RETRO_CONNECTORS_LIVE='1'; node scripts/review-qa.mjs connector-test --reporter=line
```

`start` 서버는 별도 터미널에서 실행한다. 개발 서버와 빌드를 겹치지 않는다. 자동 생성된 dev 타입 파일의 잔여 오류가 빌드를 막으면 실행 중인 QA 개발 서버를 종료하고 해당 생성 파일만 재생성한다.
