# Step 14: ask-permission-e2e

## 읽어야 할 파일

- `/docs/PRD.md` §6-5 ASK(권한 인지 답변, "N건 제외" 비표시, 고정 문구), §6-9 권한 모델, §11 ASK 행(팀장/팀원 같은 질문 → 다른 답)
- `tests/e2e/vertical-slice.spec.ts` (seed lead 로그인 헬퍼 `signInLead`, `E2E_ALLOW_EXTERNAL_WRITES` 가드, 부서·채널 상수, 정리 패턴)
- `app/api/d/[dept]/ask/route.ts`, `app/api/d/[dept]/answers/[id]/route.ts`, `components/ask-s4.tsx`
- `app/api/d/[dept]/documents/route.ts` 또는 소스 visibility 설정 경로 (leads_only 근거를 만드는 방법)
- `supabase/migrations/0012_answer_security.sql`, `0017_card_decision_boundaries.sql`

## 작업

운영에서 **같은 질문에 팀장과 팀원이 다른 답을 받는다**를 E2E로 판정한다. 새 파일 `tests/e2e/ask-permission.spec.ts` (가드: `E2E_ALLOW_EXTERNAL_WRITES=1`, 아니면 skip).

1. 준비(테스트 안에서, run별 고유 토큰 사용):
   - seed lead 세션으로 파일럿 QA 부서(`vertical-slice.spec.ts`의 `DEPARTMENT_ID`)에 **leads_only** 근거 1건과 **dept** 근거 1건을 만든다. 기존 앱 경로(문서 업로드 API 등, lead 세션)만 쓴다 — service role로 직접 insert하지 마라. 기존 경로에 소스 visibility 지정이 없으면 이미 존재하는 leads_only 소스를 읽기 전용 쿼리로 찾아 쓰고, 둘 다 불가능하면 step을 `blocked`로 멈추고 이유를 적는다.
   - 내용 예: dept 근거 "합성 QA-{token} 프로젝트 공개 일정은 10월 둘째 주입니다." / leads_only 근거 "합성 QA-{token} 프로젝트 예산 상한은 4,200만원입니다(경영회의)." 실데이터·실회사명 금지, `[합성 QA 테스트]` 표기.
   - 워커 실행(`/api/jobs/run` + 시크릿, 기존 헬퍼 재사용)으로 임베딩 완료까지 대기.
2. 질문: "합성 QA-{token} 프로젝트 예산 상한과 공개 일정은?" 을 lead 세션과 member 세션(`SEED_MEMBER_EMAIL/PASSWORD`, lead 헬퍼와 같은 방식으로 헬퍼 추가)에서 각각 웹 ASK API로 보내고 answer 완료까지 polling.
3. 판정:
   - lead 답변 인용에 leads_only 근거 item이 포함된다(또는 답변에 4,200만원이 포함).
   - member 답변 인용에 leads_only 근거 item이 **없고** 답변 본문에 "4,200"이 **없다**.
   - member 응답 JSON 어디에도 제외 건수·숨김 존재를 암시하는 필드/문구가 없다(`excluded` 키, "제외" 문자열).
   - 두 응답 모두 고정 문구 "내 권한 범위 안의 부서 기록만 참고했습니다"가 UI 또는 응답에 있다(기존 구현 위치를 읽고 판정 대상 결정).
4. 정리: 테스트가 만든 근거는 기존 앱의 삭제/소프트 삭제 경로가 있으면 lead 세션으로 정리하고, 없으면 남기되 테스트 로그에 item id만 남긴다(본문 금지). 결정·원장은 만들지 않는다.
5. 로컬: 가드 없이 skip, `--list`로 인식 확인. **운영 대상으로 실행하지 마라.**

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npx playwright test tests/e2e/ask-permission.spec.ts --list
```

## 검증 절차

1. AC 실행. 2. 체크리스트(요청 경로 service role 금지 — 테스트 준비도 앱 경로 · 로그 본문 금지 · 실데이터 없음). 3. index.json step 14 갱신.

## 금지사항

- 앱 코드·마이그레이션을 수정하지 마라. 이유: 검증 step이다. 결함을 찾으면 summary에 적고 `error`로 닫는다.
- 운영 URL로 실행하지 마라. 이유: 오케스트레이터 실행.
