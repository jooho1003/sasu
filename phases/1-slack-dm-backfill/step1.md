# Step 1: slack-backfill

## 읽어야 할 파일

- `docs/PRD.md` §6-6, §8-2 컷 ①, §10 #18
- `docs/ARCHITECTURE.md` §4.1, §6 불변식, §6-12
- `lib/adapters/slack.ts`, `lib/jobs.ts`, `app/api/slack/events/route.ts`

## 작업

추가된 lead 전용 `POST /api/d/[dept]/backfill`은 세션 멤버십과 source의 부서·종류·활성 상태를 확인한 뒤 `slack_backfill` job을 하루 단위 dedupe key로 enqueue하고 즉시 202를 반환한다.

워커는 Slack `conversations.history`를 최근 7일 기준으로 페이지네이션하고 source cursor를 갱신한다. 각 메시지는 기존 `isCollectible`·동의 판정·`mask`·`unique(source_id, external_ref)` 경로를 재사용하고, 저장된 item마다 `classify` job을 멱등 enqueue한다. 미동의 멤버의 발언은 이름을 바꿔 저장하지 말고 완전히 건너뛴다.

## Acceptance Criteria

```bash
npm test
npm run lint
npm run build
```

- 백필 범위가 현재 시각에서 정확히 7일 전이다.
- history 페이지가 여러 장이어도 중복 item을 만들지 않는다.
- route의 dept/source ID는 세션 멤버십으로 검증하고 요청 본문에서 그대로 신뢰하지 않는다.

## 금지사항

- service role로 사용자에게 보여줄 데이터를 직접 조회하는 새 화면을 만들지 마라. 워커 내부의 Slack 수집·저장에만 service role을 사용하라.
- Slack 원문이나 API 응답을 로그에 남기지 마라.
