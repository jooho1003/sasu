# Step 0 검증: url-resolver

- 변경: `lib/pipeline/send-slack.ts`, `app/api/slack/interactions/route.ts`, `app/api/d/[dept]/settings/consent/route.ts`의 로컬 `appBaseUrl()` 삭제, `metadataBase()`(`@/lib/site`)로 `new URL(path, metadataBase())` 링크 생성. 경로·쿼리·해시 문자열은 그대로.
- 테스트 추가: `tests/pipeline/send-slack.test.ts`(카드 링크), `tests/slack-decision-link.test.ts`(신규, 원장 링크), `tests/consent-route.test.ts`(동의 DM 링크). 각각 `NEXT_PUBLIC_APP_URL=https://getsasu.com` + `VERCEL_URL`/`APP_URL` 오염 상황, `VERCEL_PROJECT_PRODUCTION_URL=getsasu.com` fallback 상황을 검증.
- red(구현 전): 4 failed / 12 passed. 실패는 VERCEL_PROJECT_PRODUCTION_URL fallback 2건(카드·원장), 동의 DM 링크 2건(APP_URL 우선·fallback 불일치)이며 기대한 이유로 실패.
- green(구현 후): `npx vitest run` 4파일 16 passed (consent-route, send-slack, slack-decision-link, slack-consent-interactions).
- eslint 대상 파일 + 변경 테스트: 오류 0. `npx tsc --noEmit -p .`: 오류 0.
- `grep -rn "appBaseUrl\|process.env.APP_URL\|process.env.VERCEL_URL" app lib`: 출력 없음.
- 바뀐 기존 기대값: `tests/consent-route.test.ts`의 `vi.stubEnv("VERCEL_URL", "sasu.example")`를 `vi.unstubAllEnvs()` + 암호화 키 재설정으로 교체. 이유: 링크가 `VERCEL_URL`을 더 이상 쓰지 않는 새 계약(불변식 51)이며, 환경 변수를 각 테스트가 명시하기 위함.
