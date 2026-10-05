# Step 0: url-resolver

## 읽어야 할 파일

- `/AGENTS.md` (CRITICAL 규칙)
- `/docs/ARCHITECTURE.md` §6-13 불변식 51
- `/docs/ADR.md` ADR-088 결정 2
- `/docs/PRD.md` §8 "운영 주소 이전 범위"
- `/docs/02-design/features/app-domain-migration.design.md` §8 U6 · §10 · §11.2 step 0
- `lib/site.ts` (`metadataBase()` — 바꾸지 않는다)
- `lib/pipeline/send-slack.ts` (로컬 `appBaseUrl()`, 카드 링크·원장 링크 사용처)
- `app/api/slack/interactions/route.ts` (로컬 `appBaseUrl()`, 원장 링크)
- `app/api/d/[dept]/settings/consent/route.ts` (로컬 `appBaseUrl()`, `APP_URL` 사용, 동의 DM 링크)
- 위 세 파일의 기존 테스트: `tests/` 아래에서 `send-slack`·`interactions`·`consent-route`를 검색해 찾는다 (`tests/consent-route.test.ts`는 `VERCEL_URL`을 stub한다).

## 작업

1. 세 파일의 로컬 `appBaseUrl()` 함수를 지우고 `metadataBase()`(`@/lib/site`)를 쓴다. 링크는 `new URL(path, metadataBase()).toString()` 또는 `metadataBase().origin + path`로 만든다. 지금 만들어지는 경로·쿼리 문자열은 그대로 유지한다(호스트의 출처만 바뀐다).
2. 테스트를 먼저 고치거나 추가한다(red 확인 후 구현):
   - `NEXT_PUBLIC_APP_URL=https://getsasu.com`, `VERCEL_URL=preview-x.vercel.app`, `APP_URL=https://wrong.example`일 때 카드 링크·원장 링크·동의 DM 링크가 모두 `https://getsasu.com/`으로 시작한다.
   - `NEXT_PUBLIC_APP_URL`이 없고 `VERCEL_PROJECT_PRODUCTION_URL=getsasu.com`이면 `https://getsasu.com/`으로 시작한다.
   - 기존 테스트가 `VERCEL_URL`·`APP_URL` 동작에 기대고 있으면 새 계약(`metadataBase()`)에 맞게 기대값을 바꾸고, 바꾼 이유를 요약에 적는다.
3. `grep -rn "appBaseUrl\|process.env.APP_URL\|process.env.VERCEL_URL" app lib`가 0건인지 확인한다(테스트·문서 제외).

## Acceptance Criteria

```bash
npx vitest run <위 세 파일의 테스트 경로들>
npx eslint lib/pipeline/send-slack.ts app/api/slack/interactions/route.ts "app/api/d/[dept]/settings/consent/route.ts"
npx tsc --noEmit -p .
grep -rn "appBaseUrl\|process.env.APP_URL\|process.env.VERCEL_URL" app lib   # 출력 없음
```

## 검증 절차

1. AC 명령을 실행하고 결과(통과 수, red 결과, 바꾼 테스트 기대값)를 `docs/verification/49-app-domain-migration/step0.md`에 짧게 적는다.
2. 성공 → `phases/49-app-domain-migration/index.json` step 0을 `"status": "completed"`, `"summary": "한 줄 요약"`. 3회 시도 후 실패 → `"error"` + `error_message`.

## 금지사항

- `npm run build`·`npm run test` 전체·`npm run e2e`를 실행하지 마라. 이유: 같은 작업 트리에서 다른 step이 동시에 돌고 `.next`가 충돌한다. 대상 테스트만 `npx vitest run <경로>`로 돌린다.
- `lib/site.ts`·`proxy.ts`·`app/auth/**`를 고치지 마라. 이유: step 1·2 범위이고 동시에 실행 중이다.
- `scripts/hooks/tdd-guard.sh` 등 훅을 Bash로 우회하지 마라.
- 링크에 `VERCEL_URL` fallback을 남기지 마라. 이유: 불변식 51 — 주소 계산은 하나다.
- 커밋·푸시하지 마라. root가 한다.
