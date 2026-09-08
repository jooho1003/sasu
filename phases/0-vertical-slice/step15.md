# Step 15: deploy-slice-gate

## 읽어야 할 파일

- `/docs/PRD.md` **§8-2 ⓪ D3 세로 슬라이스 게이트** — 이 step이 만드는 판정 재료의 목적지다
- `/docs/PRD.md` **§9 일정 D1·D3 행** · **§11 완료 판정 표 전체**
- `/docs/setup-guide.md` **§2 Vercel**(트리거 판정 표와 판정 결과 기록란) · **§4 슬랙 앱 5·6·7번**(배포 후 Request URL 등록) · **§10 D3 게이트**
- `/docs/ADR.md` **ADR-010**(매분 트리거 두 안) · **ADR-025**(게이트와 컷 라인 순서) · **ADR-026**(완료는 실행 기록으로 판정)
- `/docs/ARCHITECTURE.md` **§8 테스트 경계 E2E 행 ②** — "슬랙 메시지 → 분류 → 카드 → 웹 결정 → 원장 5분"
- 이전 step 산출물: step 14의 적용된 스키마·시드·RLS 테스트 결과 · step 8의 `/api/slack/events` · step 13의 결정·원장 라우트

## 작업

**이 step은 코드를 완성하고 사람 판정 앞에서 멈추는 step이다.** 게이트 통과 여부를 스스로 결정하지 마라 — D3 판정은 사람이 스톱워치로 한다 (setup-guide §10).

### 1. `tests/e2e/vertical-slice.spec.ts`

ARCHITECTURE §8 E2E ②를 Playwright 스펙으로 쓴다. 대상 URL은 `process.env.E2E_BASE_URL`(없으면 `http://localhost:3000`).

시나리오:
1. 슬랙 이벤트를 흉내 낸 요청을 `/api/slack/events`에 **올바른 서명과 함께** POST (`SLACK_SIGNING_SECRET`로 계산). 결정 후보로 잡히는 한국어 문장을 쓴다 — 예: "외주사 B 견적 12% 인상 건, 오늘까지 결정해야 할까요?"
2. 워커가 돌 시간을 준다(`/api/jobs/run`을 시크릿 헤더로 직접 호출해도 된다 — 매분 트리거를 기다리지 마라)
3. lead 계정으로 로그인 → S1 대시보드에 그 항목이 "결정 필요" 탭에 보인다
4. 카드 상세(S2)로 이동 → **인용 칩이 있고**, 클릭하면 원문 링크가 존재한다
5. [결정] + 사유 입력 → 제출
6. 원장(S3)에 그 결정이 리드타임과 함께 보인다
7. **같은 결정을 한 번 더 제출 → `decisions`가 늘지 않고 "이미 …결정했습니다" 응답** (PRD §11 엣지·에러 행)
8. **같은 슬랙 이벤트를 같은 `event_id`로 재전송 → items가 1건** (같은 행)

배포 URL이 없으면 이 스펙은 실행되지 않는다. **그건 정상이다** — 이 step의 AC는 스펙이 파싱되는 것까지고, 실제 실행은 사람 판정과 함께 한다.

### 2. `docs/verification/D3-vertical-slice.md`

D3 게이트의 **판정 재료 기록표**를 만든다. ADR-026이 "완료는 실행 기록으로 판정한다"이므로, 이 파일이 그 기록이 들어갈 자리다. 담을 것:

- 배포 URL과 배포 커밋 해시
- setup-guide §2의 **판정 결과 기록란**을 그대로 옮긴 빈칸: `플랜: ___ · Cron 간격: ___ · after() 상한: ___ · maxDuration: ___ → 매분 트리거: Vercel Cron / pg_cron`
- 슬랙 앱 설정 체크: Event Subscriptions Request URL 등록 여부, 구독 이벤트 4종(`message.channels`·`message.groups`·`app_mention`·`message.im`), 봇을 채널에 초대했는지
- **스톱워치 기록란**: 시크릿 창에서 "슬랙 메시지 → 대시보드 분류 → 카드 → 웹 결정 → 원장"을 몇 분 몇 초에 완주했는지
- PRD §11 검증표 중 이 시점에 판정 가능한 행: `DECIDE` 일부 · `보안`(step 14 결과 링크) · `엣지·에러`의 두 항목
- 실패 시 강등 항목 3개(회의 업로드 전용 · 노션 텍스트 붙여넣기 · 임베딩 대신 키워드 검색)와 그때 고쳐야 할 문서(PRD §8-0·§4)

### 3. 매분 트리거 배선 — 판정 결과가 나온 뒤에

setup-guide §2의 D0 판정이 아직 기록되지 않았다. **둘 중 하나를 임의로 고르지 마라.**

- `Vercel Cron`으로 정해졌다면: `vercel.json`에 `/api/jobs/run` 매분 크론을 추가한다
- `Supabase pg_cron`으로 정해졌다면: `supabase/migrations/0004_pg_cron_trigger.sql`을 만들되, **`<배포도메인>`과 `<JOBS_TRIGGER_SECRET>`이 필요하므로 사람이 대시보드 SQL 편집기에서 1회 실행하는 절차**로 `docs/verification/D3-vertical-slice.md`에 적는다 (setup-guide §3의 SQL 그대로)

판정이 기록돼 있지 않으면 **배선하지 말고 그 사실을 `blocked_reason`에 적어라.** 세로 슬라이스는 `after()`만으로 돈다 — 매분 트리거는 게이트 통과의 전제가 아니다.

### 4. 배포

`main`에 푸시하면 Vercel이 배포한다(setup-guide §2). Vercel 환경 변수가 채워져 있지 않으면 런타임에서 죽으므로, 배포 전 필요한 변수 목록을 `blocked_reason`에 정리하라. **`vercel --prod`를 대화형으로 실행하지 마라.**

### 5. 마지막에 반드시 `blocked`

코드·문서·스펙을 다 만들고 커밋한 뒤, step 15를 **`"blocked"`**로 표시한다. `blocked_reason`에는 사람이 할 일을 순서대로 적는다:

1. setup-guide §2 Vercel 플랜 확인 → 매분 트리거 확정 → §2 기록란 채우기
2. Vercel 환경 변수 등록(목록 명시)
3. 슬랙 앱 Event Subscriptions / Interactivity Request URL 등록 + 채널 초대 (setup-guide §4 5·6·7)
4. 시크릿 창에서 세로 슬라이스 스톱워치 → `docs/verification/D3-vertical-slice.md`에 기록
5. 통과면 다음 task, 실패면 PRD §8-2 ⓪의 강등 3개를 그날 PRD에 반영

**게이트 통과를 스스로 선언하지 마라.** "완료했습니다"는 완료 신호가 아니다 (ADR-026).

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
npx playwright test --list          # 스펙이 파싱되고 케이스 목록이 나온다 (실행은 아니다)
test -f docs/verification/D3-vertical-slice.md || { echo "FAIL: 판정 기록표 없음"; exit 1; }
test -f tests/e2e/vertical-slice.spec.ts       || { echo "FAIL: 세로 슬라이스 스펙 없음"; exit 1; }
```

배포 URL이 생긴 뒤(사람 작업) 실행할 명령은 기록표에 적어 둔다:

```bash
E2E_BASE_URL=https://<배포도메인> npx playwright test tests/e2e/vertical-slice.spec.ts
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - E2E 스펙이 ARCHITECTURE §8의 ② ④ 항목(세로 슬라이스, 결정 버튼 연타 → 1건)을 담는가?
   - 매분 트리거를 판정 없이 임의로 배선하지 않았는가? (ADR-010)
   - 기록표가 setup-guide §2·§4·§10의 사람 작업을 빠짐없이 옮겼는가?
   - 게이트 통과 여부를 코드가 판단하지 않는가? (ADR-026)
3. `phases/0-vertical-slice/index.json`의 step 15를 업데이트한다:
   - **정상 종료 상태는 `"blocked"`다.** `blocked_reason`에 위 5단계를 적는다
   - 코드가 깨져서 AC를 못 채우면 `"error"` + `"error_message"`
   - **`blocked`로 표시하기 전에 모든 변경을 커밋하라** — 실행기는 blocked 경로에서 자동 커밋하지 않는다

## 금지사항

- D3 게이트 통과를 스스로 판정하지 마라. 이유: setup-guide §10 — 사람이 스톱워치로 판정한다. ADR-026.
- 매분 트리거를 임의로 고르지 마라. 이유: ADR-010의 판정이 아직 기록되지 않았다. 잘못 고르면 플랜 비용이나 무의미한 크론이 생긴다.
- `vercel --prod`·`supabase login` 같은 대화형 명령을 실행하지 마라. 이유: 무인 실행이 멈춘다.
- 환경 변수를 추측해 배포하지 마라. 이유: 잘못된 키로 배포된 URL이 심사 기간 내내 살아 있어야 하는 링크가 된다.
- 게이트가 실패했을 때의 강등(회의 업로드 전용·노션 붙여넣기·키워드 검색)을 미리 구현하지 마라. 이유: 판정 전이다. 검토 끝에 뺀 것과 검토 없이 없는 것은 다르다 (PRD §12-1).
- 이 step에서 새 기능을 추가하지 마라. 이유: task 0의 범위는 세로 슬라이스까지다.
- 기존 테스트를 깨뜨리지 마라.
