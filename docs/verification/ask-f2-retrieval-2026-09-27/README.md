# ASK F2 상태 질문 검색 보강 — 2026-09-27

[운영 재시험](../ask-pilot-followup-2026-09-27/production-release.md)에서 기준 질문의 안내 범위는 개선됐지만, 상태 질문과 9/15 회의 결론 확인은 `근거 없음`으로 끝났다. 웹 화면만으로는 검색 누락과 모델 선택 실패를 구분할 수 없다. 현재 `search_as`는 임베딩이 있는 항목 중 유사도 상위 8개만 돌려주므로, 보이는 회의록이 답변 후보에 없을 수 있다. 이를 검증 가능한 원인 가설로 삼았다.

## 변경

- 상태 질문에 한해 안건 단어가 모두 들어간 항목을 `search_topic_items_as`로 최대 8개 추가 검색한다. 임베딩이 없는 항목도 후보가 될 수 있다. 새 SQL 함수는 `can_see()`·호출자 일치·채널 `dept` 범위를 기존 검색과 같이 적용한다.
- 보조 검색 결과와 기존 의미 검색 결과를 ID로 중복 제거해 근거 선택 모델에 준다. 인용 원문 일치와 늦은 같은 안건 기록 검사는 그대로 적용한다. 다른 질문은 기존 의미 검색만 사용한다.
- 실제 DB 연결 시 팀원·팀장·타인 ID 사칭·채널 범위의 결과를 확인하는 RLS 통합 검사를 추가했다. 실행은 DB 연결 후에 가능하다.
- 실제 운영 자료의 검색 순위·새 SQL 실행은 아직 검증하지 못했다. Supabase CLI의 `db push --dry-run`은 `ProjectRefNotLinkedError`였고 SQL 도구 인증도 실패했다. 마이그레이션 0055를 운영에 적용하기 전에 코드 배포를 머지하면 상태 질문이 새 RPC를 찾지 못할 수 있으므로 PR은 대기한다.

## Graft와 Archify

- Graft 구현 전 [`searchAs` 호출자](graft-before-search-callers.json)는 `answerQuestion`과 검색 테스트였다. 구현 후 597파일·2,685노드·6,757관계([빌드 요약](graft-after-build.txt)), [그래프 검사](graft-after-check.txt) `OK`. 새 [`searchTopicItemsAs` 호출자](graft-after-callers.json)도 `answerQuestion`과 검색 테스트다. 의미 요약은 수행하지 않았다.
- Archify [흐름 명세](answer-flow.json)는 상태 질문의 의미 검색 8개와 안건 단어 검색 8개를 합친 뒤 근거를 선택하는 경로를 표시한다. [검증](archify-validate.json) 9/9, [HTML 생성](archify-delivery.json), Chrome [화면 검사](answer-flow.visual-check.json) 통과. [도식](answer-flow.html)과 [1440px 화면](answer-flow.visual-check.1440x900.light.png)을 직접 확인했다. 독립 사람 검수는 `pending`이다.

## 로컬 검증

| 검사 | 결과 |
|---|---|
| 대상 Vitest | 구현 전 3건 실패([요약](red.txt)), 구현 후 44/44 통과 |
| 전체 Vitest | 139파일·1,412건 통과 |
| `npx tsc --noEmit` | 통과 |
| `npm run lint` | 차단 0, 기존 경고 77 |
| `SASU_VERIFY_BUILD=1 npm run build` | 공개 Supabase 자리표시자 값으로 통과 |
| `git diff --check` | 통과 |
| `tests/rls/rls.test.ts`의 새 보조 검색 검사 | 작성, 실DB 미실행 |

## 다음 확인

프로젝트 연결 후 마이그레이션 0055의 SQL·권한 경계를 실DB에서 검증하고 운영 DB에 적용한다. 이어 코드 PR을 머지해 운영 배포한 뒤, 같은 파일럿 상태 질문에서 9/15 보류 기록 인용과 기준 질문의 안내 범위를 재확인한다. 실제 Groq 선택이 늦은 기록을 다시 빠뜨리거나 거절하면 그 결과를 기록하고 선택 단계까지 추가 수정한다. Slack DM/채널 실제 발송 검증은 별도 미완료다.
