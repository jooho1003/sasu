# 실제 모델 검증 재개 — 2026-09-23

phase 31의 문체 평가와 phase 30의 회고 초안 생성 검증을 재개했다. 기존 2026-09-19/20의 실패 기록은 보존한다. 운영 DB·배포는 변경하지 않았다.

## 문체 측정과 수정

`node scripts/review-qa.mjs llm-style`을 공통 프롬프트 수정 전후에 각각 실행했다. 실제 로컬 Supabase의 합성 시드와 Groq `openai/gpt-oss-120b`를 사용한다. `llm.structured`가 호출·사용량을 로컬 DB에 기록한다.

기존 평가 도구의 문제도 수정했다. 제거된 `answer` 필드를 여전히 읽으면 새 문장 0개를 문체 준수로 잘못 셀 수 있었고, 결과 JSON에는 생성 본문 전체를 저장하고 있었다. 현재 AnswerDraft·groundAnswer로 완전한 문단을 확인하며 보고서에는 건수·코드·지표만 남긴다. 거절 기대값은 표본의 고정 순번 대신 시드의 상태에서 읽는다.

ADR-066 이후 질문 답변은 원문 선택이므로 문체 분모에서 제외한다. 질문 6건 중 원문 선택 5건·예상 거절 1건은 두 실행 모두 통과했다. 새 문장을 만드는 카드 3건·문서 요약 2건의 문체 지표는 다음과 같다.

| 지표 | 수정 전 | 수정 후 |
|---|---:|---:|
| 문체 평가 대상 | 5 | 5 |
| 기준 통과 | 0 | 2 |
| 준수율 | 0% | 40% |
| 40자 초과 문장 | 6 | 1 |
| 끝맺음 위반 | 1 | 0 |

`lib/llm.ts`의 공통 지시에 20~30자 목표, 공백·문장부호 포함 40자 상한, 사실별 문장 분리, background/recommendation/overview 적용, 원문 복사 필드 보존을 명시했다. 출처 원문이나 인용 게이트는 변경하지 않았다. 표본의 무작위성과 작은 표본 수 때문에 일반 업무 품질 향상으로 해석하지 않는다.

**문체 목표는 아직 미달이다.** 수정 후 카드 2건은 금지어, 요약 1건은 문장 길이 위반이 남았다. 모델 변경·추가 품질 개선은 별도 후속이며 문체를 이유로 사용자 응답을 차단하지 않는다.

- [수정 전 수치](llm-samples-before.json)
- [수정 후 수치](llm-samples.json)
- [항목별 측정표](llm-style-samples.md)

## 회고 실제 연결 검증

실행: `SASU_VERIFY_BUILD=1 node scripts/review-qa.mjs dev`, `E2E_RETRO_CONNECTORS_LIVE=1 node scripts/review-qa.mjs connector-test --reporter=line`.

기존 수동 회고 E2E에 명시적으로 켜는 실제 모델 경로를 추가했다. 개발·기획 각 3일에 합성 파일·내부 활동·직접 쓴 한 줄을 준비한 다음, 브라우저의 다시 생성 → 실제 워커 → Groq → 로컬 Postgres → 화면 표시를 확인한다. 생성 리비전의 문장별 인용과 최상위 인용을 현재 활동에 대조하고, 이어 편집·확정·공개·철회·연결 해제를 검증한다. 외부 제공자 수집은 하지 않는다.

새 합성 조직에는 Slack 설치가 없으며, `withSlackDepartment`의 null 토큰을 `post.ts`가 네트워크 요청 전에 거부한다. 합성 Slack 신원은 내부 활동 귀속 확인에만 사용한다.

**개발 서버 E2E 1개 통과(6.2분), Groq 6회**를 [첫 DB 결과](retro/dev-results.json)에 보존했다. 이후 프로덕션 빌드 앱에서 문장별 인용 전체의 일치 단언까지 추가해 **E2E 1개 통과(4.4분), Groq 8회, 개발·기획 각 3일 생성, 브라우저 오류 0건**을 확인했다([최종 DB 결과](retro/local-pilot-results.json), [최종 E2E 로그](retro/production-build-e2e.txt)). 두 실행 모두 실제 생성된 초안 6건을 확인했다.

[개발 AI 초안](retro/development-ai-draft.png)·[기획 AI 초안](retro/planning-ai-draft.png), 검토 후 1440/390px 화면과 설정 화면도 같은 폴더에 있다. 첫 실행의 개발 390px 초안은 이미지로 직접 확인했다. 실행을 마친 QA 앱 서버는 종료했다.

결과의 `citations` 수치는 최상위 인용 목록이다. 첫 실행의 기획 3건, 최종 실행의 2건은 이 목록이 검증 후 비어 highlight가 제거됐지만, 본문 문장별 인용은 전부 유효했고 내보내기 각주도 확인했다. 문장별 원문 일치와 모델의 서술 적합성은 서로 다른 검사다. 실제 계정 OAuth·제공자 sandbox·사람 파일럿을 이 검사로 대체하지 않는다.

## 코드 관계와 검증 범위

- 변경 전: `review-qa.mjs` → `sample-llm-style.ts` → `AnswerDraft/CardDraft/DocumentSummary`·`llm.structured` → 구형 answer 필드 읽기·본문 JSON 저장.
- 변경 후: 같은 경로 → `groundAnswer/evidenceParagraphs` 원문 검증 → `llm-style-report.ts` 문체 통계 → 본문 없는 결과. 모든 텍스트 모델 호출은 기존 `lib/llm.ts`만 사용한다.
- 회고: `retro-connectors.spec.ts` → 세션 API의 regenerate → kickWorker/jobs → `draftRetro` → `llm.structured` → `verifyRetroDraft` → finish RPC → 실제 화면·확정·공개 철회.
- 신규 통계 테스트는 모듈 구현 전 missing-module 실패를 확인했다. 첫 구현 뒤에는 장문 fixture의 필수 title 누락 1건을 수정했고 12개 집중 테스트가 통과했다.
- Graft/Archify는 현재 MCP 목록·PATH에 없다. 실제 import·함수·SQL 검색과 소스 확인으로 대체했으며 두 도구 실행 증거는 누락이다. 서비스 구조·SQL 권한 정책은 바꾸지 않았다.

## 전체 코드 검사

| 명령 | 실행 결과 |
|---|---|
| `npm run lint` | 통과. 209파일, 문구 차단 0·경고 77. [로그](lint.txt) |
| `eslint tests/e2e/retro-connectors.spec.ts` | 본문 인용 전수 비교를 추가한 뒤 통과. [로그](lint-followup.txt) |
| `SASU_VERIFY_BUILD=1 node scripts/review-qa.mjs build` | 프로덕션 빌드·타입 검사·페이지 생성 통과. [로그](build.txt) |
| `npm run test -- --maxWorkers=2` | 139파일, 1,357 통과·1 시간 초과. [로그](unit.txt) |
| `vitest run tests/recording/session.test.ts --maxWorkers=1 --testTimeout=15000` | 시간 제한을 늘려 해당 파일 6개 모두 통과. 총 실행 8.11초. [로그](unit-recording-retry.txt) |

첫 빌드는 `.next-verify/dev/types/validator.ts`의 생성 코드 끝에 잘못 이어진 문자열 때문에 실패했다([로그](build-first.txt)). 이 작업이 실행한 개발 서버를 종료하고 해당 생성 파일만 삭제한 뒤 같은 소스로 다시 빌드해 통과했다. 제품 소스나 Next.js 타입 검사를 우회하지 않았다.

단위 테스트의 유일한 실패는 기존 녹음 30분·1,800개 체크포인트 시뮬레이션의 기본 5초 제한이었다. 녹음 코드와 단언은 바꾸지 않고 해당 파일만 15초 제한으로 재실행했다. 첫 전체 실행을 무실패로 표시하지 않는다. 현재 1,358개 항목 모두 통과 실행을 확보했다.
