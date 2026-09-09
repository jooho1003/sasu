# Step 0: slack-dm-delivery

## 읽어야 할 파일

- `docs/PRD.md` §6-3 DECIDE, §6-4 LEDGER, §8-2 컷 ⑤
- `docs/ARCHITECTURE.md` §4.1~§4.2, §6 불변식
- `lib/pipeline/card.ts`, `lib/jobs.ts`, `app/api/cards/[id]/decide/route.ts`
- `lib/slack/verify.ts`

## 작업

결정 카드가 검증된 인용을 하나 이상 가진 `open` 상태로 저장되면 `send_slack` job을 카드 ID 기준으로 멱등 enqueue한다. 워커는 카드 visibility와 담당자 멤버십·동의 상태를 다시 확인한 뒤 Block Kit DM을 보낸다. Block Kit에는 카드에 필요한 배경·마감·추천·인용 링크·충돌·웹 링크와 결정/보류/반려 버튼을 포함한다.

`/api/slack/interactions`는 raw body에 대한 Slack signing secret 검증 후에만 block action과 modal submission을 처리한다. 클릭자의 Slack 매핑·동의·담당자 또는 lead 권한을 서버에서 재검증하고, 카드 상태와 `decisions.request_id` unique 제약으로 중복 결정을 안내한다. 결정자는 요청 본문이 아니라 `members`에서 가져온다.

## Acceptance Criteria

```bash
npm test
npm run lint
npm run build
```

- `send_slack`이 실패해도 원문·토큰을 로그나 `jobs.last_error`에 기록하지 않는다.
- citations가 없는 카드에는 DM job을 만들지 않는다.
- `supabase/migrations/0005_slack_delivery.sql`이 DM 발송 상태와 메시지 식별자를 저장한다.

## 금지사항

- 검증되지 않은 citation quote를 Slack DM에 렌더링하지 마라.
- `leads_only` 카드의 담당자를 member로 바꾸거나 member에게 보내지 마라.
- `/api/slack/interactions`에서 서명 검증 전에 payload를 처리하지 마라.
