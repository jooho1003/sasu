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

> **후속 확인 (2026-10-05, 위 체크리스트는 작성 시점 기록)**: Interactivity '미등록'과 봇 '채널 미초대'는 이후 해소됐다. [continuity-production-2026-09-16.md](continuity-production-2026-09-16.md)(21~28행, 78행)에 실제 Slack 채널 글 → 카드 DM, 채널 @SASU 질문 → 인용 답변 전달, DM 질문·후속 질문 답변, Slack 카드 결정 버튼 → 모달 → 원장 1행이 기록돼 있다. 2026-10-05 phase 49 T6에서 Slack 앱의 Events/Interactivity Request URL을 `https://getsasu.com/api/slack/events`·`/api/slack/interactions`로 바꿨다([49-app-domain-migration/production-cutover.md](49-app-domain-migration/production-cutover.md)). step 15 스톱워치·판정란은 이 노트로 채우지 않는다.

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
- 배포 E2E: `[x] 통과` (세로 슬라이스) · 기록: 2026-10-05 `E2E_BASE_URL=https://getsasu.com E2E_ALLOW_SHOWCASE_WRITES=1 E2E_ALLOW_EXTERNAL_WRITES=1 npx playwright test tests/e2e/vertical-slice.spec.ts` — "실제 Slack 이벤트가 분류·카드·결정·원장까지 한 번만 흐른다" **passed**(3.8m 실행 중). 스펙 보정 2건: ADR-052 이후 필수인 `team_id`(파일럿 워크스페이스)를 합성 이벤트에 추가, phase 31에서 바뀐 버튼 이름 `결정`→`결정하기`. 같은 파일의 "슬랙 질문과 회의 보류가 카드 1장으로 병합된다"는 **미통과**: 앞선 실패 실행들이 공유 파일럿 부서에 남긴 비슷한 주제의 열린 카드 때문에 회의 항목이 `merge_confirm` 3회 뒤 새 카드로 생성됐다(운영 공유 데이터 오염, 격리 DB 검증 대상). 남은 테스트 카드는 모두 `돌려보냄`으로 정리했다.

## D3 스톱워치 판정

시크릿 창에서 새 Slack 메시지를 보낸 시점부터 원장에 결정이 표시되는 시점까지 기록한다.

| 흐름 | 시작 | 종료 | 소요 | 결과 |
|---|---:|---:|---:|---|
| Slack 메시지 → 대시보드 `결정 필요` | `21:55:49.9` | `21:56:46.0` | `0분 56.1초` | `[x]` |
| 대시보드 → 카드 → 인용 원문 링크 | `21:56:46.0` | `21:56:53.5` | `0분 7.5초` | `[x]` |
| 카드 결정 → 원장·리드타임 표시 | `21:56:53.5` | `21:57:10.2` | `0분 16.7초` | `[x]` |
| 전체 세로 슬라이스 | `21:55:49.9` | `21:57:10.2` | `1분 20.4초` | `[x] 5분 이내` |

- 판정자: `Claude Code 에이전트 실측(사용자가 2026-10-05에 에이전트 실측을 판정 근거로 인정)` — 사람 스톱워치가 아니다. Aside 브라우저(로그인 세션)로 Slack 웹 게시·대시보드 새로고침·카드·결정을 조작하고 시각은 스크립트가 기록했다.
- 판정 일시(KST): `2026-10-05 21:57` · 운영 `https://getsasu.com`, Slack #소셜(C087PNU14UQ), 파일럿 부서, lead 이주호 웹 세션. 증거: [원장 화면](D3-stopwatch-2026-10-05/ledger.png), 결정 기록 `#478ac971`
- D3 결과: `[x] 통과` (게이트 자체는 이미 지난 일정이며, 이 기록은 판정 재료를 채운 것이다)
- 앞선 시도(숨기지 않음): run A(21:24)는 classify job이 모델의 자연어 마감 힌트("오늘 23시")를 `timestamptz`로 캐스팅하다 3회 실패 → 버그 수정 PR #41 운영 반영 후 재분류 성공. run B(21:40)는 6분 51초 — 서버는 21초 만에 분류·38초 만에 카드였으나 카드 Slack DM 실패(`slack_dm_unavailable`, 담당자 선택 버그 → PR #43) 조사와 Aside 재연결로 운영자 지연이 섞였다. run C(21:50)는 Aside 연결 끊김으로 중단. run D가 끊김 없는 측정이다.
- 이 실측 중 발견·수정·운영 반영: PR #41(분류 마감 힌트), PR #43(카드 담당자 DM 가능 lead 우선·대시보드 결정 기록 연결). 반영 후 새 카드 DM `sent`와 대시보드 `→ 결정 기록` 링크를 운영에서 확인했다.

## PRD §11 시점 검증

- [x] `DECIDE` — 실제 Slack 항목을 카드에서 결정하고 원장에 표시 (2026-10-05 run D, 결정 `#478ac971`)
- [x] `보안` — [Step 14 RLS 실행 기록](../../phases/0-vertical-slice/index.json)에 anon/member/lead 및 insert 차단 결과가 있다
- [x] `엣지·에러` — 동일 카드 재제출이 결정을 1건으로 유지하고 중복 안내를 반환 (2026-10-05 운영 vertical-slice E2E 통과, D10 기록 [D10-completion.md](D10-completion.md))
- [x] `엣지·에러` — 동일 `event_id` 재전송이 item을 1건으로 유지 (같은 E2E)

## 실패 시 그날 반영할 강등

5분 안에 배포 URL에서 흐름을 완주하지 못하면 사람 판정 후 아래 세 가지를 즉시 PRD §8-0·§4에 반영한다.

1. 회의 봇을 시도하지 않고 `.vtt`/`.txt` 전사 업로드 전용으로 확정한다.
2. Notion API 대신 원칙 문서 텍스트 붙여넣기로 확정한다.
3. 임베딩 검색 대신 키워드 검색으로 확정한다.

강등 판정자: `_______________________________________________`
PRD 수정 커밋: `___________________________________________`
