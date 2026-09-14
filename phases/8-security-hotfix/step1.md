# Step 1: upload-e2e

## 읽어야 할 파일

- `/docs/PRD.md` §11 "보안 핫픽스 (ADR-042)" 행 — 이 step이 만드는 것은 그 행의 "문서 업로드·전사 업로드 E2E(서버 어댑터 insert, 마스킹 확인)"다
- `/docs/ADR.md` ADR-042 · `/docs/ARCHITECTURE.md` §6 불변식 7·8·9 · §6-2 불변식 16
- `phases/8-security-hotfix/step0.md`, `docs/verification/security-hotfix.md` (step 0 결과와 "다음 게이트")
- `app/api/d/[dept]/documents/route.ts`, `app/api/d/[dept]/meetings/transcript/route.ts`, `lib/adapters/upload.ts`, `lib/mask.ts`
- 인증·외부 쓰기 E2E 패턴: `tests/e2e/ask-permission.spec.ts` 36~72행(`signInSeedUser`: `signInWithPassword` → `sb-<ref>-auth-token` 쿠키 주입), `tests/e2e/agent-roles.spec.ts`, `tests/e2e/vertical-slice.spec.ts`(`E2E_ALLOW_EXTERNAL_WRITES` skip)
- `scripts/seed-dept.ts` (`SEED_LEAD_*`·`SEED_MEMBER_*` 계정이 속한 부서와 멤버 표시 이름)
- `app/api/d/[dept]/settings/source/route.ts` DELETE (테스트가 만든 소스 정리 경로)

## 작업

`tests/e2e/upload-boundaries.spec.ts`를 만든다. 운영 Supabase에 쓰는 테스트이므로 **이 step에서는 작성과 skip 확인까지만 하고, 실제 쓰기 실행은 O8(사용자 승인)에서 한다.**

1. 파일 맨 위에서 `E2E_ALLOW_EXTERNAL_WRITES !== "1"`이거나 `SEED_LEAD_EMAIL`·`SEED_MEMBER_EMAIL`·`SUPABASE_SERVICE_ROLE_KEY`가 없으면 전체 skip한다. skip 사유 문자열에 어떤 값이 빠졌는지 적는다(값 자체는 출력하지 않는다).
2. 로그인은 기존 `signInSeedUser` 패턴을 복사하지 말고 `tests/e2e/support/auth.ts`(신규)로 뽑아 이 스펙에서 import한다. 기존 스펙은 이번 step에서 수정하지 않는다.
3. 테스트 케이스 (모두 합성 텍스트만 사용. 실제 이름·이메일·전화번호를 쓰지 않는다 — 마스킹 확인용 값은 `sasu-e2e-<timestamp>@example.com`, `010-0000-0000` 형식의 명백한 가짜 값):
   - **문서 업로드(lead)**: 이메일·전화번호 형식이 섞인 합성 TXT를 `POST /api/d/<lead 부서>/documents`로 올린다 → 2xx. 테스트 코드에서 service role 클라이언트로 그 소스의 `items.content`를 조회해 원문 이메일·전화번호 문자열이 **0건**이고 `[이메일]`·`[전화번호]` 토큰이 있는지 확인한다.
   - **문서 업로드(member)**: 같은 요청을 member 세션으로 → 403. 소스·items가 생기지 않았는지 service role로 행 수 확인.
   - **데모 부서 업로드**: lead 세션으로 데모 부서 id(`demo_departments` anon RPC로 조회)에 업로드 → 403 또는 404, items 증가 0.
   - **전사 업로드(lead)**: 화자 2명(`seed-dept.ts`의 동의한 멤버 표시 이름 1명 + 멤버가 아닌 이름 1명)이 있는 합성 `.vtt`를 올린다 → 2xx. 동의한 화자 발언만 items에 있고, 멤버가 아닌 화자 발언은 0건, 저장된 본문은 마스킹돼 있다.
   - **직접 INSERT 거부**: lead 세션의 anon-key 클라이언트(`Authorization: Bearer <access_token>`)로 PostgREST `items` insert → 에러(권한 거부). 0025 적용 전에는 이 케이스가 실패할 수 있으므로 `test.fixme`가 아니라 **환경 변수 `E2E_EXPECT_0025=1`일 때만 실행**한다. O8이 적용 후 이 값을 켜고 다시 돌린다.
   - **정리**: `afterAll`에서 테스트가 만든 소스를 기존 `DELETE /api/d/[dept]/settings/source`로 제거한다. 실패해도 테스트 결과를 덮지 않게 로그에는 소스 id만 남긴다.
4. 로그·첨부에 업로드 본문·전사 원문·이메일을 출력하지 않는다. 실패 메시지에는 id·행 수·HTTP 상태만 넣는다.
5. `docs/verification/security-hotfix.md`의 "다음 게이트" 절에 이 스펙의 실행 조건(`E2E_ALLOW_EXTERNAL_WRITES=1`, `E2E_EXPECT_0025=1`)과 O8 순서를 추가한다.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run e2e -- tests/e2e/upload-boundaries.spec.ts   # 외부 쓰기 env 없이 실행 → 전부 skipped, 실패 0
```

## 검증 절차

1. 위 AC를 실행한다. skip 외의 결과가 나오면 env가 로드된 것이므로 즉시 중단하고 `blocked`로 기록한다.
2. 체크리스트: 스펙이 운영 DB에 쓰는 코드 경로가 전부 `E2E_ALLOW_EXTERNAL_WRITES` 뒤에 있는가 · service role은 테스트 검증 조회에만 쓰는가 · 본문을 로그에 남기지 않는가.
3. `phases/8-security-hotfix/index.json` step 1을 갱신한다. summary에 스펙 경로·케이스 수·skip 조건을 적는다.

## 금지사항

- `E2E_ALLOW_EXTERNAL_WRITES=1`로 실행하지 마라. 이유: 운영 Supabase 쓰기와 문서 요약 LLM 호출은 O8의 사용자 승인 범위다.
- `supabase db push`·배포·step 2 작업을 하지 마라. 이유: step 2는 메인 오케스트레이터 노드다.
- 업로드 라우트·어댑터·마이그레이션을 고치지 마라. 버그를 찾으면 고치지 말고 `blocked_reason`에 재현 조건을 적는다. 이유: step 0 코드는 R8 리뷰 대상이다.
- 기존 E2E 스펙을 수정하지 마라. 이유: 기존 통과 기록의 재현성을 깨지 않는다.
