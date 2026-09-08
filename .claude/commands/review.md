이 프로젝트의 변경 사항을 리뷰하라.

먼저 다음 문서들을 읽어라:
- `/CLAUDE.md`
- `/docs/ARCHITECTURE.md` (§2 디렉토리 · §3 패턴 · §6 불변식 · §8 테스트 경계)
- `/docs/ADR.md`

그런 다음 변경된 파일들을 확인하고, 아래 체크리스트로 검증하라.

## 체크리스트

1. **아키텍처 준수**: ARCHITECTURE.md §2 디렉토리 구조를 따르는가? 비즈니스 로직이 `lib/`에 있고 `route.ts`·컴포넌트에 새지 않았는가?
2. **기술 스택 준수**: ADR에 정의된 기술 선택을 벗어나지 않았는가? (Edge Function·별도 벡터 DB·외부 큐·OAuth 설치 흐름·SSE가 들어오지 않았는가 — ARCHITECTURE §7)
3. **테스트 존재**: 새 `lib/` 모듈에 `tests/` 미러 테스트가 있는가? RLS 변경에 `tests/rls/` 케이스(anon·member·lead)가 있는가?
4. **CRITICAL 규칙**: CLAUDE.md의 CRITICAL 규칙을 위반하지 않았는가? 특히:
   - 사용자 요청 경로(`app/api/d/**`, `app/api/cards/**`, `app/api/slack/interactions`, 슬랙 Q&A)에서 `lib/supabase/service.ts`를 import하지 않았는가
   - 가시성 판정이 `can_see()` 밖에 복제되지 않았는가 (TypeScript에서 `visibility === 'leads_only'` 같은 분기가 있으면 의심)
   - Anthropic SDK 호출이 `lib/llm.ts` 밖에 없는가
   - `citations[]` 검증(실존 + quote 문자열 포함) 없이 카드·답변을 저장·발송하는 경로가 없는가
   - 어댑터가 미동의 `author_ext_id`를 저장하지 않는가
   - `dept_id`·`decided_by`·`asked_by`를 요청 본문에서 읽지 않는가
   - `console.log`·로거에 슬랙 본문·전사·질문 원문이 들어가지 않는가
   - 마스킹 전 원문이 어디에도 저장되지 않는가
5. **RLS 정책**: 새/변경 정책마다 USING **과** WITH CHECK가 둘 다 있는가? `jobs`·`ingest_events`·`llm_calls`·`orgs`에 사용자 정책이 생기지 않았는가? `is_demo` anon 정책이 select만인가?
6. **멱등·상태**: `ingest_events`·`unique(source_id, external_ref)`·`decisions.request_id unique`·`one_open_request_per_item`을 우회하는 insert가 없는가? PRD §6-12 전이표 밖의 상태 전이를 서버가 허용하지 않는가?
7. **빌드 가능**: `npm run lint && npm run build && npm test`가 에러 없이 통과하는가?

## 출력 형식

| 항목 | 결과 | 비고 |
|------|------|------|
| 아키텍처 준수 | ✅/❌ | {상세} |
| 기술 스택 준수 | ✅/❌ | {상세} |
| 테스트 존재 | ✅/❌ | {상세} |
| CRITICAL 규칙 | ✅/❌ | {위반 항목별 파일:줄} |
| RLS 정책 | ✅/❌/해당 없음 | {정책명별 USING/WITH CHECK} |
| 멱등·상태 | ✅/❌/해당 없음 | {상세} |
| 빌드 가능 | ✅/❌ | {상세} |

위반 사항이 있으면 수정 방안을 구체적으로 제시하라. D8 사람 리뷰 대상(RLS·워커·슬랙 서명 검증)이 변경에 포함되면 결과 표 아래에 "사람 리뷰 필요" 절을 따로 두고 해당 파일과 줄을 나열하라.
