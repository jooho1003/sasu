# 평가 데이터

작성일: 2026-09-12. 모든 본문·인물·회사·식별자는 합성이다. 실제 고객 발언이나 개인정보를 복제하지 않았다.

## 구성과 한계

- `classification.ts`: 서로 다른 한국어 업무/잡담 문장 64개. 개발 32개, holdout 32개 각각 decision/action/info/chatter 8개씩. 정답과 이유를 함께 보관한다.
- 정답은 에이전트가 작성한 **잠정 라벨**이며 독립적인 사람의 검수를 받지 않았다. holdout은 파일 내 분할 이름이지 독립 블라인드 성능 인증이 아니다. 이번 실측 이후 holdout에 맞춰 규칙을 조정하지 않았다.
- `tests/evaluation-corpus.test.ts`: 데이터 무결성 1개 + 공백 변형 40개 + 마스킹 96개 + 동의/어댑터 72개 + 인용 변형 64개 = 273개. 변형 조합을 독립적인 업무 문장 273개라고 세지 않는다.
- `scripts/verify-security-sql.mjs`: 합성 조직 4개, 부서 12개, 사용자 24명, 항목 72개에 대한 권한 검증 2,016개. 독립 로컬 DB에서 실제 SQL을 실행한다. 임베딩은 동일한 가짜 벡터이므로 검색의 의미 정확도 실험은 아니다.

라벨 기준: 미결 선택·승인 = decision; 확정 방향의 실행 요청 = action; 완료 사실·상태 공유 = info; 비업무 대화 = chatter. 애매한 문장은 사람이 맥락과 기준을 검수해야 한다. 특히 C020(완료 사실), C039(도입 검토)의 경계를 확인할 것.

## 실행

```powershell
npm test
npx vitest run --config vitest.eval.config.ts
```

두 번째 명령은 실제 Groq API를 호출하며 비용이 발생한다. 환경 변수는 기존 로컬 설정에서 읽고 출력하지 않는다. 업무 테이블과 enqueue는 모의 처리하여 실제 카드·Slack 발송은 없다. 기존 LLM 게이트웨이의 `llm_calls` 기록은 실제 DB에 시도한다(저장 성공 자체는 이 평가의 검증 대상이 아님).

기존 `docs/verification/evaluation-results/classification-live.json`은 변경 전 기준으로 보존한다. 현재 실행은 `classification-semantic-v2.json`에 결과와 전후 비교를 쓰며 정답 불일치가 있으면 종료 코드 1로 실패한다. 정규 테스트와 분리한 이유는 외부 API 비용·비결정성이지 실패를 숨기기 위해서가 아니다. 2026-09-12 전수 의미 분류 변경 후 23개 불일치가 2개로 줄었다. 기존 결과를 검토한 뒤 개선한 것이므로 이 64개는 회귀 평가이지 독립 블라인드 평가가 아니다.

다음 데이터 확장은 동의받은 업무 사례를 안전하게 합성 재작성하고, 2인 독립 라벨링 → 불일치 조정 → 버전 동결 → 개발/블라인드 평가 분리 순서로 진행한다. 단순 문구 복제로 표본 수를 늘리지 않는다.

답변 후속 스모크 평가 6건은 `tests/evals/answer-live.eval.ts`에 있다. `npx vitest run --config vitest.eval.config.ts tests/evals/answer-live.eval.ts`로 별도 실행한다. 실제 Groq를 사용하지만 검색/임베딩/업무 저장/Slack은 격리한다. 결과는 `answer-live.json`에 기록한다. 최신 실행은 6/6 통과이며 독립 검수된 검색·추론 품질 평가는 아니다.
