# Step 5: purge-withdraw

파기 job, 부서장 삭제·본인 철회의 연결 확인, 개인정보 처리 안내 문구.

## 읽어야 할 파일

- `/docs/ADR.md` ADR-062 3항·법적 한계 · `/docs/ARCHITECTURE.md` 불변식 8·9·21
- `docs/planning/예고편_지원자링크_설계.md` §6
- step 0 `purge_expired_trailer_invites`(service_role만)·`private.purge_trailer_invite`
- `lib/jobs.ts` — `JobKind` 목록(28행 `purge_review_files`), `sweepPendingRows`(311행)·`registerHandler("sweep")`(490행)의 매분 트리거 구조, 실패 매핑 표(98행 부근)
- `lib/pipeline/review-material.ts` 136행 `purge_review_files` 핸들러(service role은 워커 안에서만)
- `app/(site)/privacy/page.tsx` — 6개 절 구조와 "법률 검토 전 초안" 표기
- 기존 파기 검증 `docs/verification/`의 retention 관련 문서(있으면)

## 작업

### 1. 파기 job

- `JobKind`에 `purge_trailer_invites` 추가. 핸들러는 `lib/pipeline/trailer-purge.ts`(TDD: `tests/pipeline/trailer-purge.test.ts` 먼저): service role 클라이언트로 `purge_expired_trailer_invites()` RPC 1회 호출 → 파기 건수를 로그(건수만).
- 스케줄: `sweep`이 매분 도는 구조 안에서 **하루 1회**만 큐잉되게 `enqueue("purge_trailer_invites", {}, { dedupeKey: <KST 날짜> })`를 `sweepPendingRows` 끝에 추가(같은 날 중복은 `dedupeKey`로 흡수). 별도 cron을 만들지 않는다.
- 실패 매핑 표에 항목 추가(테이블 갱신 없음 → `write: "none"` 류의 기존 표현이 있으면 그것을, 없으면 매핑 생략이 허용되는지 `lib/jobs.ts`에서 확인해 따른다).

### 2. 철회·삭제 경로 점검

- step 2의 `DELETE …/invites/[inviteId]`와 step 4의 `/api/t/i/withdraw`가 **둘 다** `private.purge_trailer_invite`를 통과함을 SQL 하니스 케이스 6·7과 라우트 테스트로 교차 확인한다(코드 추가가 아니라 테스트 추가).
- 예고편 철회(`unpublish_trailer`) 뒤 초대 열람이 막히는지(게이트) E2E B에 케이스 추가.

### 3. 개인정보 처리 안내 (`app/(site)/privacy/page.tsx`)

각 절에 지원자 항목을 **문단 추가**로 넣는다(기존 문장 수정 없음). 상단 표기는 "법률 검토 전 초안 · <오늘 날짜>"로 갱신.
- 1절: 채용 예고편 지원자 — 채용 담당자가 입력한 이메일, 지원자가 입력한 결정 선택·이유 서술·단서 선택 기록. 목적: 채용 과제 참고 자료와 면접 질문 준비. AI 점수는 참고 자료이며 합격 여부를 자동으로 결정하지 않는다.
- 2절: 지원자는 링크를 열 때 수집·이용에 동의한 뒤에만 제출할 수 있고, 동의하지 않아도 불이익이 없다.
- 3절: 제출 후 90일이 지나면 자동 파기하며, 지원자는 링크에서 언제든 제출을 철회할 수 있고 채용 담당자도 즉시 삭제할 수 있다 `(확인 필요: 법률 자문 — 채용절차법 §11의 반환·파기 기간)`.
- 5절: 자동화된 결정에 대한 설명·거부 요청은 채용 담당자 또는 문의 이메일로.

`tests/site.test.ts`(있으면)에서 처리방침 페이지가 "지원자"·"자동으로 결정하지 않" 문구를 포함하는지 확인.

## Acceptance Criteria

```bash
npx vitest run tests/pipeline/trailer-purge.test.ts      # 구현 전 실패 기록 → 통과
npm run lint && npx tsc --noEmit && npm run test && npm run build
```

## 금지사항

- 파기 job에서 `trailer_invites`를 직접 update/delete 하지 마라. 이유: 파기 규칙은 `private.purge_trailer_invite` 한 곳에만 둔다(부서장 삭제·본인 철회와 같은 경로).
- 처리방침에서 "AI가 거른다"·"적합도"·"평가" 표현을 쓰지 마라. 이유: ADR-045 법적 한계·금지 카피.
