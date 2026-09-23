# Step 2: decision-search-terms

`search_decisions_as`의 단어 일치를 고친다. 질문 뒤쪽(현재 질문)의 단어를 우선하고, 흔한 조사를 떼어 비교한다. **권한 절은 0053과 글자 그대로 같게 둔다.** 근거: ADR-067 "결정 검색".

## 읽어야 할 파일

- `docs/ADR.md` ADR-066 · ADR-067
- `docs/PRD.md` §3 "ASK 근거 확인 보완" 첫 항목 · §6-5 2항
- `docs/ARCHITECTURE.md` §1 Q&A 줄
- `supabase/migrations/0053_answer_decision_search.sql` — 이번에 다시 정의할 함수의 원본
- `supabase/migrations/0031_decision_followup.sql` 152~169행 — `recent_decisions_as` 권한 절 선례
- `scripts/verify-answer-grounding-sql.mjs` — 0053 검증(권한 조합·미임베딩·정정·채널·anon)
- `scripts/verify-security-sql.mjs` 110~150행 — `supabase/migrations`를 이름 순으로 자동 적용한다(0054는 따로 등록하지 않는다)
- `lib/pipeline/answer.ts`의 `searchQuestion` — 이전 질문들 + 현재 질문을 `\n`으로 이어 붙이고 뒤 7,000자를 쓴다. 현재 질문이 **맨 뒤**에 있다

## 왜 바꾸는가

- 0053은 단어를 `order by term limit 32`, 즉 **가나다순으로 32개** 자른다. 후속 질문에서는 이전 질문까지 합친 텍스트라 단어가 32개를 쉽게 넘는다. 그러면 현재 질문의 핵심 단어가 가나다 순서 때문에 빠질 수 있다.
- 한국어 조사가 붙은 단어는 맞지 않는다("견적은" ≠ "견적"). 미임베딩 결정은 단어 일치로만 찾기 때문에 이 영향이 크다.

## 작업

### 1. 회귀 테스트 먼저 (red)

`scripts/verify-answer-grounding-sql.mjs`에 아래 검사를 추가한다. **0053만 적용된 상태에서 실패하는지** 먼저 확인하고, 그 출력을 `docs/verification/grounded-answer-selection-2026-09-23/sql-red.txt`에 남긴다.

- 조사: `p_text = "견적은 어떻게 정했나요"`이면 미임베딩 결정 "재입찰 견적 기준"이 결과에 있어야 한다.
- 뒤쪽 우선: `p_text`를 ASCII 단어 40개(예: `aaa01 … aaa40`, 가나다순에서 한글보다 앞선다) + `\n재입찰`로 만든다. 이때 미임베딩 결정 "재입찰 견적 기준"이 결과에 있어야 한다.
- 함수 속성: `pg_proc.prosecdef = true`여야 한다. `anon`의 EXECUTE는 false, `authenticated`·`service_role`은 true여야 한다.

### 2. `supabase/migrations/0054_decision_search_terms.sql`

- `create or replace function public.search_decisions_as(p_user uuid, p_dept uuid, p_query vector(1024), p_text text, p_limit int default 8, p_scope text default 'user')`로 다시 정의한다. 시그니처·반환 컬럼·`language plpgsql stable security definer set search_path=public,pg_temp`는 0053과 같다.
- `terms` CTE만 바꾼다.
  - `regexp_split_to_table(lower(left(coalesce(p_text,''),7000)), '[^[:alnum:]가-힣]+') with ordinality as t(term, pos)`로 위치를 함께 얻는다.
  - 끝에 붙은 조사를 한 번 뗀다. 목록은 `(으로|에서|에게|한테|부터|까지|께서|처럼|보다|은|는|이|가|을|를|에|의|도|로|와|과|만)$`이다. **뗀 결과가 2자 이상일 때만** 떼고, 아니면 원래 단어를 둔다. 뗀 단어는 원래 단어의 앞부분이므로 `strpos` 일치가 줄지 않는다.
  - 길이 2자 이상인 단어를 `group by term`으로 모으고 `order by max(pos) desc limit 32`로 자른다. 텍스트 뒤쪽에 나온 단어가 먼저 남는다.
- `candidates`의 `where` 절(부서·`can_see`·`auth.uid()`/`service_role`·채널 범위·정정 제외)과 점수식(0.65·0.35, 의미 기준 0.25), 정렬, `limit`은 **0053과 글자 그대로 같게** 둔다.
- 함수 뒤에 0053과 같은 `revoke … from public,anon` / `grant execute … to authenticated,service_role`을 다시 적는다.
- 파일 머리에 한 줄 주석을 둔다: `-- ADR-067: 단어 일치는 뒤쪽(현재 질문) 단어를 우선하고 흔한 조사를 뗀다. 권한 절은 0053과 같다.`

### 3. green

`node scripts/verify-security-sql.mjs D:/바이브코딩/.sasu-qa-db`로 1의 새 검사와 기존 0053 검사(권한 조합 2,016개 포함)가 모두 통과하는지 확인한다. 출력은 `sql.txt`로 남긴다.

## 코드 관계와 구조 확인

- 호출처는 `lib/search.ts`의 `searchDecisionsAs` 하나다. 앱 코드는 바꾸지 않는다. Graft 결과가 없으면 `grep -rn "search_decisions_as" lib app scripts supabase` 결과로 대체하고 누락을 적는다.

## Acceptance Criteria

```bash
# 권한 절이 0053과 같다 — 출력이 없어야 한다
diff <(sed -n '/from public.decisions d/,/supersedes_id=d.id)/p' supabase/migrations/0053_answer_decision_search.sql) \
     <(sed -n '/from public.decisions d/,/supersedes_id=d.id)/p' supabase/migrations/0054_decision_search_terms.sql)
node scripts/verify-security-sql.mjs D:/바이브코딩/.sasu-qa-db   # 새 검사 3개 + 기존 검사 전부 통과
npm run test
git diff --stat -- lib app components   # 이 step에서 앱 코드 변경 0
```

## 검증 절차

1. 위 AC를 실행한다. `sql-red.txt`(0053만 적용했을 때 실패)와 `sql.txt`(0054 적용 후 통과)를 `docs/verification/grounded-answer-selection-2026-09-23/`에 남기고, README의 "step2" 절에 요약한다.
2. 체크리스트:
   - `can_see()` 호출과 채널 범위 절이 그대로인가?
   - 판정 로직을 앱 코드로 옮기지 않았는가?
   - `security definer`와 `search_path` 고정이 유지되는가?
3. `phases/32-grounded-answer/index.json`의 step 2를 갱신한다.

## 금지사항

- `where` 절·`grant`/`revoke`·함수 시그니처를 바꾸지 마라. 이유: 권한 판정은 `can_see()` 하나라는 CRITICAL 규칙이 있다. 바꿔야 한다고 판단되면 구현하지 말고 **blocked**로 멈춘다. 그 경우 이 노드를 security 도메인으로 재배정하고 게이트를 다시 통과해야 한다.
- 0053 파일을 수정하지 마라. 이유: 이미 로컬 실DB와 검증 기록에 적용된 파일이다. 변경은 새 마이그레이션으로만 한다.
- 의미 유사도 기준(0.25)이나 가중치를 바꾸지 마라. 이유: ADR-067은 이번 범위에서 그대로 둔다고 정했다. 바꾸려면 평가 근거가 먼저 필요하다.
- 형태소 분석기·확장(`pg_trgm` 등)을 추가하지 마라. 이유: 운영 DB 확장 추가는 별도 승인이 필요하고, 조사 목록만으로 이번 문제는 풀린다.
- `lib/`·`app/` 코드를 바꾸지 마라. 이유: 이 step은 SQL만 다룬다. step1과 파일이 겹치지 않아야 병렬로 실행할 수 있다.
- 운영·QA DB에 적용(`supabase db push`)하지 마라. 이유: 운영 반영은 step4 뒤 사용자 승인이다.
