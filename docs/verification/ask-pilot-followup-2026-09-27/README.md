# ASK 파일럿 후속: 코드 관계, 흐름, F2 회귀 수정

2026-09-27. 기준 커밋 `3887244e36274ffe596b1a1a91bff2769f2bff9e`. 운영 재확인 기록의 F2(늦은 보류 기록 누락)와 기준 질문에 붙는 현재 상태 안내를 다음 로컬 수정 대상으로 삼았다. 이 폴더의 검증은 운영 반영을 뜻하지 않는다.

## Graft

- `@nanonets/graft@0.19.0`을 WSL Ubuntu에서 `DO_NOT_TRACK=1`로 실행했다. `git archive HEAD`에 민감한 환경 파일을 넣지 않고 구현 전 그래프를 만들었다. 결과: 597/597파일, 2,684노드, 6,754관계([빌드](graft-build.txt), [구조 검사](graft-check.txt)). 의미 요약은 실행하지 않았다.
- [`laterRelatedEvidence` 호출자](graft-later-callers.json)는 `answerQuestion`이며, 후속 경로는 `registerAnswerHandler`와 답변 평가·저장 테스트다. [`answerQuestion` 호출자](graft-answer-callers.json)도 확인했다. 이 관계를 따라 `lib/pipeline/answer.ts`와 `tests/pipeline/answer-persistence.test.ts`만 수정했다.
- 변경한 두 파일을 그래프 입력에 반영해 다시 빌드했다. 597파일 중 2파일을 새로 파싱했고 [구조 검사](graft-after-check.txt)는 `graph check: OK`였다([빌드](graft-after-build.txt)).

## Archify

- 고정된 Archify 소스 커밋 `8809b273c278a813a47fa37698864779c0d4cf08`으로 [ASK 흐름 명세](answer-flow.json)를 작성했다. 질문자·대화 확인 → 안건 특정 → SQL 권한 검색 → Groq 문단 선택 → 원문·시각 검증 → 저장·원문 확인과, 안건 확인 요청·근거 부족 거절·형식 오류를 표현했다.
- showcase [검증 9/9](archify-validate.json), [HTML 생성](archify-delivery.json), Chrome [화면 자동 검사](answer-flow.visual-check.json) 통과. [도식 HTML](answer-flow.html)과 [1440px 화면](answer-flow.visual-check.1440x900.light.png)을 직접 살폈다. 자동 영수증의 독립 사람 검수는 `pending`이다.

## 다음 step: F2 회귀 수정

- 실제 운영 질문의 `건은`은 한 글자 어간을 보존하는 기존 규칙 때문에 안건 단어로 남았다. 두 근거 모두에 `건은`이 없으면 늦은 기록 검사가 실행되지 않았다. 상태 질문의 일반 표현 `건/일`을 조사 형태까지 제외했다.
- `승인하면 안 되나요? 기준이 뭔가요?`는 현재 상태 조회가 아닌 기준 질문인데, 기존 `승인` 포함 검사 때문에 불확실성 안내가 붙었다. 상태를 묻는 형태로 조건을 좁혔다.
- 두 운영 사례를 합성 근거로 재현한 테스트는 수정 전 **2건 실패**([출력 요약](red.txt)), 수정 후 대상 **35/35 통과**했다. 검색 결과의 원문·사건 시각은 SQL 권한 검색이 반환한 값만 사용한다. `can_see`, 인용 원문 일치 검증, 거절·실패 경계는 바꾸지 않았다.

| 검사 | 결과 | 기록 |
|---|---|---|
| `npm run lint` | 통과, 차단 0·기존 경고 77 | [lint.txt](lint.txt) |
| `npm run test -- --maxWorkers=2 --testTimeout=30000` | 139파일·1,409검사 통과 | [unit.txt](unit.txt) |
| `npx tsc --noEmit` | 통과 | [typecheck.txt](typecheck.txt) |
| `SASU_VERIFY_BUILD=1 npm run build` | 공개 Supabase 자리표시자 값으로 프로덕션 빌드 통과 | [build.txt](build.txt) |
| `git diff --check` | 통과 | 실행 확인 |

## 남은 확인

운영 `3887244`에는 이번 수정이 없다. 배포 후 파일럿의 동일 상태 질문과 기준 질문을 다시 보내고, 인용된 결정·보류 기록 및 안내 문구를 확인해야 한다. 검색은 기존대로 항목·결정 각 상위 8개만 사용하므로 보류 기록이 검색 결과 밖이면 이번 수정만으로 찾을 수 없다. 실제 Groq·운영 자료·Slack DM/채널 발송은 이번 로컬 검증에 포함되지 않았다.
