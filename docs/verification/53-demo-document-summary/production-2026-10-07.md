# phase 53 운영 반영 기록 (2026-10-07)

사용자 승인(①~④ 모두 진행) 후 실행. 화면 캡처: [1440](demo-documents-1440.png) · [390](demo-documents-390.png) — 운영 E1이 다시 찍은 실제 화면(스타일 보완 반영).

## ① migration 0070

- worktree에서 `npx supabase db push --workdir . --db-url <운영> --dry-run --skip-vault` → 대상 `0070_demo_document_summaries_read.sql` 한 건 확인. (`--workdir` 없이 돌리면 CLI가 메인 체크아웃의 `supabase/`를 잡아 "up to date"로 잘못 나온다.)
- 스키마 백업 `.vercel/schema-before-0070-20261007.sql`(리포 밖) → `db push --workdir . --skip-vault --yes` 적용.
- 확인(익명 키 REST): 데모 개발 부서 요약 3행, 익명으로 보이는 요약 전체가 그 부서뿐(파일럿 부서 요약 0).

## ② 데모 시드 재생성

- `scripts/seed-demo.ts`(이 브랜치) → `demo_org=1 departments=7 reviewer=1 prepared_answers=42 items=160`. 익명 REST로 요약 4행(합성 배포 점검 회의록 + 지원서 3건), overview가 모두 원문 문장임을 확인.

## ③ PR #46 병합

- 머지 커밋 `2b0d208`, Vercel `success`.

## ④ 운영 E2E

- 1차: `demo-document-summary`·guest·demo-public-workspace·demo-meeting-recorder·site·security-headers 통과, **demo-reviewer 3건 실패**("심사위원 데모 계정으로 접속했습니다" 없음) → 아래 사고.
- 복구 후 최종: 같은 묶음 **26 passed**(1 skipped) + `demo-reviewer.spec.ts` **5 passed**(Supabase URL·anon 키 환경변수를 넣어 단독 재실행 — worktree에 운영 `.env`가 없어 첫 재실행 1건이 `NEXT_PUBLIC_SUPABASE_URL is not set`으로 실패했던 것은 실행 환경 문제).
- E1: 합성 문서 펼침 → 한눈에 보기·결정·정책·다음 할 일·확인이 필요한 질문·원문 근거 5 표시, overview 두 문장이 원문 기록에 존재, 쓰기 버튼 0.

## 사고: 데모 심사 계정 자동 연결 중단과 복구

- 원인: 운영 재시드를 로컬 `.env`로 실행했는데, 로컬에는 `SASU_DEMO_AUTO_LOGIN_ENABLED`·`SASU_DEMO_USER_EMAIL`·`SASU_DEMO_USER_PASSWORD`가 없다. 시드는 자동 로그인이 꺼진 것으로 보고 심사 계정(`99999999-…991`)을 비밀번호 없이 다시 만들었다 → 운영 `/demo/access`가 `/demo?demo=unavailable`로 이동.
- 1차 복구 시도: `vercel env pull --environment=production`으로 받은 값으로 재시드 — 그러나 `SASU_DEMO_USER_PASSWORD`는 Vercel **Secret**이라 pull 값이 자리표시자 `[sensitive]`(11자)였고, 심사 계정 비밀번호가 그 문자열로 설정됐다(운영 서버 값과 불일치). 원래 비밀번호는 어디에도 사본이 없어 복원할 수 없었다.
- 복구(사용자 승인): 무작위 비밀번호 생성 → Supabase admin API로 심사 계정 비밀번호 변경·로그인 확인 → `vercel env add SASU_DEMO_USER_PASSWORD production --sensitive --force`(stdin) → 운영 배포 `vercel redeploy … --target production`(Ready 8m, getsasu.com 연결). 비밀번호는 화면·파일·로그에 남기지 않았고, pull한 임시 env 파일은 바로 삭제했다.
- 결과: `/demo/access` → 303 `/demo`, demo-reviewer 5/5 통과. 중단 구간은 약 03:46~04:30(KST). 그 사이 게스트 체험 화면은 열렸고 심사위원 자동 연결만 실패했다.
- 재발 방지: 운영 재시드 절차에 데모 로그인 변수 필요를 기록(메모리 `sasu-production-rollout`). 시드가 운영 대상에서 데모 로그인 변수 없이 실행되면 멈추게 하거나, 심사 계정을 지우지 않고 유지하도록 바꾸는 것은 후속 후보로 남긴다. 새 비밀번호는 Vercel Secret에만 있으므로 다음 재시드도 같은 문제를 겪는다 — 재시드 전에 반드시 위 후속 조치나 비밀번호 재설정 절차가 필요하다.
