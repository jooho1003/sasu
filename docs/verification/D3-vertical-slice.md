# D3 세로 슬라이스 검증 기록

이 문서는 `docs/PRD.md` §8-2 ⓪와 ADR-026에 따른 사람 판정 기록이다. 코드와 자동 테스트가 통과해도, 아래 배포 URL에서 시크릿 창으로 직접 완주한 기록이 없으면 D3 게이트를 통과한 것으로 보지 않는다.

## 배포

- 배포 URL: `https://sasu-alpha.vercel.app` (프로덕션 alias · 인증 벽 없음, 시크릿 창에서 200 확인)
- 배포 커밋 해시: `6fa6555` (워킹트리 clean 상태의 스냅샷)
- 확인 일시(KST): `2026-09-10 03:2x`
- Vercel CLI 버전: `59.14.0`

> 배포 방식 주의 — Hobby 플랜은 **커밋 작성자가 Vercel 계정 소유자가 아니면 배포를 `BLOCKED`로 막는다**
> ("The deployment was blocked because the commit author did not have contributing access to the project on Vercel.
> The Hobby Plan does not support collaboration for private repositories.").
> 이 리포의 커밋 작성자는 `wade0528 <wade@uzen.net>`이고 Vercel 계정은 `wadelee1005@gmail.com`이라 정면으로 걸린다.
> 현재는 git 메타데이터 없는 소스 스냅샷을 CLI로 올려 우회했다. **항구 대책 둘 중 하나를 D4까지 정한다**:
> ① Vercel 계정에 `wade@uzen.net`을 보조 이메일로 추가(검증 메일 클릭 필요) ② 커밋 작성자 이메일을 Vercel 계정 이메일로 변경.
> 정하기 전에는 GitHub 연동 자동 배포를 켜면 안 된다 — 전부 BLOCKED 된다.

## 워커 트리거 판정

setup-guide §2의 판정 결과를 기록한다.

- 플랜: `Hobby` (Vercel API `/v2/teams/team_zKvH3LpgiM9aftxjgdOUcPzE` → `billing.plan = "hobby"`)
- Cron 간격: `하루 1회` — 더 잦은 표현은 배포 단계에서 실패
- `after()` 상한: `문서에 별도 표기 없음` — 함수 maxDuration에 묶이는 것으로 가정(300초)
- `maxDuration`: `기본 300초 / 최대 300초`
- 매분 트리거: `[ ] Vercel Cron  [x] Supabase pg_cron`
- 판정 근거: Vercel 문서 *Usage & Pricing for Cron Jobs* 플랜별 표(Hobby = Minimum interval "Once per day", 정밀도 ±59분) · *Configuring Maximum Duration* 지속시간 표(Hobby 기본 300s / 최대 300s)

**배선 완료 (2026-09-10 / D3)**

- `supabase/migrations/0004_worker_cron.sql` 적용됨 — `pg_cron`·`pg_net` 확장, `public.worker_config`(RLS 켜고 정책 0개 = service role 전용), `public.run_jobs_tick()`(SECURITY DEFINER), `cron.schedule('sasu-jobs-tick', '* * * * *', ...)`
- `npx tsx scripts/setup-worker-cron.ts https://sasu-alpha.vercel.app` 실행됨 — `jobs_run_url`·`jobs_trigger_secret` 주입 완료
- `vercel.json`에는 `crons`를 넣지 않는다 (Hobby에서 매분 표현은 배포 실패)

**동작 검증 (2026-09-10 03:1x KST)** — `[통과]`

`jobs` 테이블에 `kind='sweep'`·`status='queued'`·`run_after` 과거인 프로브 row를 service role로 직접 넣고,
`/api/jobs/run`을 **사람이 한 번도 호출하지 않은 상태**로 15초 간격 폴링했다.
45초 만에 `queued → done`(attempts=1, last_error=null)으로 바뀌었다.
즉 `pg_cron(매분) → public.run_jobs_tick() → net.http_post → https://sasu-alpha.vercel.app/api/jobs/run
(x-jobs-secret 인증) → runOnce()` 전 구간이 실제로 동작한다. 프로브 row는 검증 후 삭제했다.

(Vercel 런타임 로그는 이 플랜에서 403이라 로그 기반 확인은 불가. 위 큐 처리 결과가 그 대체 증거다.)

## Slack 앱 설정

앱: `SASU` · App ID `A0C0JSWAJHK` · 워크스페이스 `새 워크스페이스` (`T0870U4PE90`, 1인) · 봇 `sasu` (`U0C1J2C4CTS`)

- [x] Event Subscriptions 활성화 (App Manifest로 일괄 설정, 저장 성공)
- [x] Request URL 등록: `https://sasu-alpha.vercel.app/api/slack/events`
- [x] URL verification challenge가 200으로 응답 — 매니페스트 저장이 성공했다는 것이 곧 서명된 challenge 통과의 증거다. 서명 없는 POST는 `401` 확인
- [x] `message.channels` 구독
- [x] `message.groups` 구독
- [x] `app_mention` 구독
- [x] `message.im` 구독
- [ ] Interactivity Request URL 등록 — **미등록**. `/api/slack/interactions` 라우트가 아직 없다(DM 버튼은 D4 `1-slack-dm-backfill`). 매니페스트에 `interactivity.is_enabled = false`로 두었다
- [ ] 수집 채널에 봇 초대 — **남음**. 봇 스코프에 `channels:read`·`channels:join`이 없어 API로 못 넣는다(setup-guide §4의 8개 스코프에 없음). 채널에서 `/invite @SASU`를 직접 실행해야 한다
- 마지막 Slack 이벤트 수신 시각: `__________________________`

봇 토큰(`SLACK_BOT_TOKEN`)·서명 시크릿(`SLACK_SIGNING_SECRET`)은 `.env`와 Vercel(Production·Preview) 양쪽에 주입 완료. `auth.test` 200 확인.

## 자동 검증

실행 기록:

- 로컬 세로 슬라이스: `[통과]` · `E2E_BASE_URL=http://localhost:3000 npx playwright test tests/e2e/vertical-slice.spec.ts --project=chromium` · 2026-09-10 KST · 38.2초
- 실제 Supabase·Groq·시드 계정으로 Slack 이벤트부터 원장까지 검증
- 배포 URL E2E와 시크릿 창 스톱워치: 아래 사람 판정란에 기록

로컬 정적 검증:

```bash
npm run lint
npm run build
npm test
npx playwright test --list
```

배포 URL에서 실행:

```bash
E2E_BASE_URL=https://<배포도메인> npx playwright test tests/e2e/vertical-slice.spec.ts
```

실행 결과:

- lint: `[통과]` · 2026-09-10 KST
- build: `[통과]` · 2026-09-10 KST
- unit test: `[통과]` · 92 tests · 2026-09-10 KST
- RLS test: `[통과]` · 6 tests · 2026-09-10 KST
- Playwright 목록: `[통과]` · 1 test · 2026-09-10 KST
- 배포 E2E: `[ ] 통과  [ ] 실패` · 기록: `____________________________`

## D3 스톱워치 판정

시크릿 창에서 새 Slack 메시지를 보낸 시점부터 원장에 결정이 표시되는 시점까지 기록한다.

| 흐름 | 시작 | 종료 | 소요 | 결과 |
|---|---:|---:|---:|---|
| Slack 메시지 → 대시보드 `결정 필요` | `____:____` | `____:____` | `____분 ____초` | `[ ]` |
| 대시보드 → 카드 → 인용 원문 링크 | `____:____` | `____:____` | `____분 ____초` | `[ ]` |
| 카드 결정 → 원장·리드타임 표시 | `____:____` | `____:____` | `____분 ____초` | `[ ]` |
| 전체 세로 슬라이스 | `____:____` | `____:____` | `____분 ____초` | `[ ] 5분 이내  [ ] 초과` |

- 판정자: `_______________________________________________`
- 판정 일시(KST): `_______________________________________`
- D3 결과: `[ ] 통과 → D4 진행  [ ] 실패 → 아래 강등 반영`

## PRD §11 시점 검증

- [ ] `DECIDE` — 실제 Slack 항목을 카드에서 결정하고 원장에 표시
- [ ] `보안` — [Step 14 RLS 실행 기록](../../phases/0-vertical-slice/index.json)에 anon/member/lead 및 insert 차단 결과가 있다
- [ ] `엣지·에러` — 동일 카드 재제출이 결정을 1건으로 유지하고 중복 안내를 반환
- [ ] `엣지·에러` — 동일 `event_id` 재전송이 item을 1건으로 유지

## 실패 시 그날 반영할 강등

5분 안에 배포 URL에서 흐름을 완주하지 못하면 사람 판정 후 아래 세 가지를 즉시 PRD §8-0·§4에 반영한다.

1. 회의 봇을 시도하지 않고 `.vtt`/`.txt` 전사 업로드 전용으로 확정한다.
2. Notion API 대신 원칙 문서 텍스트 붙여넣기로 확정한다.
3. 임베딩 검색 대신 키워드 검색으로 확정한다.

강등 판정자: `_______________________________________________`
PRD 수정 커밋: `___________________________________________`
