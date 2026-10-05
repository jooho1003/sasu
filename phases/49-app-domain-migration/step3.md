# Step 3: verification

## 읽어야 할 파일

- `/AGENTS.md`, `/docs/AI-DEVELOPMENT.md`
- `/docs/ADR.md` ADR-088 · `/docs/PRD.md` §8 "운영 주소 이전 범위" · `/docs/ARCHITECTURE.md` §6-13
- `/docs/02-design/features/app-domain-migration.design.md` 전체 (§8 R1·E1, §10 환경변수, §11.4 전환 순서)
- `phases/49-app-domain-migration/index.json`의 step 0~2 summary와 `docs/verification/49-app-domain-migration/step0.md`~`step2.md`
- `.env.example`, `docs/setup-guide.md` 상단과 배포·워커·Slack 주소 절(`setup-worker-cron`·`Request URL`·`OAuth` 검색)

## 작업

1. `.env.example`에 `NEXT_PUBLIC_APP_URL`(정식 주소, 예 `https://getsasu.com`, 비면 `VERCEL_PROJECT_PRODUCTION_URL`)과 `SASU_LEGACY_HOSTS`(서버 전용, 쉼표 구분 호스트, 운영에만 `sasu-alpha.vercel.app`, `/api/*`는 이동 안 함)를 주석과 함께 추가한다. 비밀값은 넣지 않는다.
2. `docs/setup-guide.md`에 "운영 주소 이전 (ADR-088)" 절을 추가한다. design §11.4 T1~T12를 절차형으로 옮기고 각 단계의 확인값·되돌리기를 적는다. 상단 2026-10-05 Cloudflare 302 문장에 "phase 49 전환 때 이 규칙은 삭제한다"를 덧붙인다. 아직 전환하지 않았으므로 현재 운영 값은 바꿔 적지 않는다.
3. 전체 회귀 R1을 실행한다.
   - `npm run lint`, `npm run build`, `npm run test`
   - 로컬 E2E: `scripts/review-qa.mjs`의 실제 하위 명령·env를 먼저 읽는다. Docker Desktop이 꺼져 있으면 켠다(`C:\Program Files\Docker\Docker\Docker Desktop.exe`). `node scripts/review-qa.mjs setup` → `build` → `start`(3011) → `E2E_BASE_URL=http://127.0.0.1:3011 npx playwright test tests/e2e/auth-confirm.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts tests/e2e/security-headers.spec.ts` → 3011 프로세스를 포트로 찾아 종료한다. 로컬 PostgREST가 첫 인증 요청을 `PGRST303`으로 거절하면 `/rest/v1/`을 몇 번 호출해 깨운 뒤 다시 실행한다. 과거 검증 파일을 덮어쓰는 spec이 있으면 끝난 뒤 `git checkout`으로 되돌린다.
   - `SASU_VERIFY_BUILD=1` 빌드를 썼다면 `git restore next-env.d.ts`.
   - Docker를 켤 수 없으면 E2E를 "미실행 + 사유"로 기록하고 나머지를 진행한다.
4. `docs/verification/49-app-domain-migration/verification.md`: 명령·결과·통과 수·실패와 재실행·미실행 범위·Graft/Archify 사용 여부(못 쓰면 이유와 수동 확인 범위)를 적고 step0~2 기록을 링크한다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm run test
E2E_BASE_URL=http://127.0.0.1:3011 npx playwright test tests/e2e/auth-confirm.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts tests/e2e/security-headers.spec.ts
git status --short   # 의도한 파일만 변경
```

## 검증 절차

1. 결과를 verification.md에 기록한다. 실패는 원인과 함께 남기고 숨기지 않는다.
2. 성공 → index.json step 3 `completed` + summary. 사람이 해야 하는 일 때문에 막히면 `blocked` + 사유.

## 금지사항

- 운영(Vercel·Supabase·Cloudflare·Slack·운영 DB)에 아무것도 쓰지 마라. 이유: 운영 전환은 root가 단계마다 사용자 승인으로 한다(ADR-088).
- `.env`·`.vercel/` 안의 값을 문서·로그에 옮기지 마라. 이유: 비밀값.
- 테스트를 통과시키려고 제품 코드의 계약(design §4)을 바꾸지 마라. 실패하면 기록하고 멈춘다.
- 훅 우회 금지, 커밋·푸시 금지.
