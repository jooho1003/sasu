# 사수 — 사람이 직접 해야 하는 준비 가이드

> 2026-10-02 사용자 결정: 로그인 메일 발신자는 **사수 / `sasu@getsasu.com`**, provider는 Resend로 정한다. 인증할 도메인은 `getsasu.com`이다. 도메인 소유/DNS 인증·Resend SMTP 연결·실제 수신 확인은 사용자가 나중에 진행하도록 보류했다. 주소를 정한 것만으로 운영 발송이 활성화된 것은 아니다. 기존 6자리 OTP 설정은 유지한다.

- 작성일: 2026-09-08
- 대상: 이 프로젝트를 혼자 진행하는 개발자 본인
- 목적: **코드로 대신할 수 없고 사람이 직접 해야 하는 일**만 모았다. 계정·플랜 확인, 외부 서비스 승인, 키 발급, 동의문, 게이트 판정, 제출 절차.
- 기준 문서: [PRD](PRD.md) §4(기술 스택·환경 변수) · §9(일정) · §10(미확인 가설) · [ADR](ADR.md) · [제출물 체크리스트](submission-checklist.md)

> 마감은 **참가 접수 9/18(금), 과제 제출 9/20(일) 23:59**다. 아래 항목은 전부 "언제까지"가 붙어 있다. 날짜 기반 컷 자동 발동과 기능 프리징은 ADR-049(9/15)로 폐지했다 — 날짜는 진행 기록으로만 본다.

---

## 0. 한눈에 보는 체크리스트

| 마감 | 할 일 | 상태 |
|---|---|---|
| **D0 9/8 (화) 오전** | **참가 접수 제출** (§1) — 양식뿐이라 마감일까지 미룰 이유가 없다 | ⬜ |
| D0 9/8 오전 | Vercel 플랜 확인: Cron 최소 간격 · `after()` 상한 · `maxDuration` → **매분 트리거 결정**(Vercel Cron vs Supabase `pg_cron`) (§2) | ⬜ |
| D0 9/8 오전 | Recall.ai 가입 · 가격 · 승인 소요 · 무료 크레딧 · 웹훅 서명 · 녹음 삭제 설정 (§5) | ⬜ |
| D0 9/8 오전 | 슬랙 앱 생성 + 스코프 10개 + `users:read.email` 승인 가능 여부 (§4) | ⬜ |
| D0 9/8 오전 | Groq 키 발급 + 단가·rate limit 확인 (§7) | ⬜ |
| D0 9/8 오전 | 임베딩 후보 키 발급 — Groq `nomic-embed-text-v1_5` 제공 여부 확인 후 Voyage · OpenAI (§8) | ⬜ |
| D0 9/8 | 두 번째 파일럿 팀 섭외 연락 (§9) | ⬜ |
| D1 9/8 | Supabase 프로젝트 · Vercel 프로젝트 · GitHub 연동 · `.env` 채우고 커밋 안 되는지 확인 (§3·§2·§7) | ⬜ |
| D1 9/8 | 우리 팀 **동의문 v1** 확정 + 전원 서면 동의 — 실사용 데이터가 걸리는 첫날 (§9) | ⬜ |
| D2 9/9 | 임베딩 모델 확정 (Voyage `voyage-4-lite`, 1024차원) → 마이그레이션 | ✅ 코드·DB 적용 |
| **D3 9/10 (목) 자정** | **세로 슬라이스 게이트** — 시크릿 창에서 5분 안에 완주 안 되면 강등 (§10) | ⬜ |
| D4 9/11 | 컷 ① 판정: 7일 백필 | ⬜ |
| D5 9/12 | 두 번째 파일럿 팀 섭외 **확정** 기한 · Recall.ai 웹훅 서명·녹음 보존 확인 | ⬜ |
| **D6 9/13 (일)** | **회의 봇 판정** — 전사가 items로 안 들어오면 업로드로 확정 · 컷 ③ 판정 | ⬜ |
| D7 9/14 | Notion 통합 토큰 + 원칙 문서 페이지 공유 (§6) | ⬜ |
| D8 9/15 오후 | **코드 리뷰 (사람)**: RLS 정책 · 워커 · 슬랙 서명 검증을 직접 읽는다 · 컷 ④ 판정 | ⬜ |
| D9 9/16 | 파일럿 동의문 최종 · 컷 ⑤⑥⑦ 판정 | ⬜ |
| D10 9/17 | 게스트 시드 실행·검증 (기능 프리징은 ADR-049로 폐지) | ⬜ |
| D11 9/18 (금) | (접수는 D0에 끝냄) · 부하 테스트 동시 100명 · 서비스명 "사수" 최종 · 도메인 결정 | ⬜ |
| D12 9/19 (토) | 영상 · 스크린샷 · 제출서 · Groq 데이터 정책 문구 · **제출** (§11) | ⬜ |
| 9/20 (일) | 버그픽스만. 23:59 전 최종 제출 확인 | ⬜ |
| 9/21~10/5 | 매일 1회 헬스체크 (시크릿 창 `/demo` 완주) | ⬜ |

---

## 1. 참가 접수 — 가장 먼저 할 것

- 사이트: event.wanted.co.kr/ai-championship/2026 · 팀 구성 최대 5인
- **접수(9/18)와 과제 제출(9/20)은 별개다.** 접수는 양식 제출뿐이라 D0(9/8)에 끝낸다.
- 과제 제출은 "임시저장"이 아니라 **제출** 버튼까지. 임시저장은 제출로 보지 않는다(`submission/원티드 지원서.md` 유의사항).
- 제출 양식 7항목과 500자 본문은 [submission-checklist.md](submission-checklist.md).

### AI 사용 고지 — 필수 항목
"과제 제작에 사용한 주요 AI 도구의 명칭과 활용 방식을 반드시 기재"가 유의사항에 있다. 제품 안의 AI(Groq gpt-oss-120b·gpt-oss-20b)와 개발 과정의 AI(Claude 기획·리뷰, Codex 구현, Harness 로그)를 모두 적는다. 증거는 `phases/*/index.json`의 summary와 step 출력이다 — **지금부터 쌓인다.**

### 유의사항 중 우리에게 걸리는 것
- 서비스 링크가 심사 기간에 죽으면 심사 제외 → 9/21~10/5 매일 헬스체크
- 타인 개인정보·소속 기관 비밀정보 포함 금지 → 게스트 모드·스크린샷·영상은 **합성 데이터만**
- 소속 회사 업무로 만든 결과물 제출 불가 → 팀원 전원 확인 (직무발명·업무상저작물)
- 오픈소스·외부 API 라이선스 준수 → Recall.ai·Groq·Slack·Notion 약관 확인 (§5·§7)

---

## 2. Vercel — 플랜 확인이 설계를 결정한다

**D0 오전에 확인할 것 세 가지** (PRD §10 #4·#16, ADR-010):

| 확인 | 왜 | 안 되면 |
|---|---|---|
| Cron 최소 간격이 **매분**인가 | 워커 `/api/jobs/run`을 매분 깨워야 `after()`가 죽은 job을 따라잡는다. Hobby는 하루 1회일 수 있다 | Supabase `pg_cron` + `pg_net`으로 `/api/jobs/run`을 HTTP 호출 (§3). 워커 코드는 동일 |
| `after()`가 응답 후 얼마나 오래 도는가 | 슬랙 3초 ack 뒤 분류·카드 생성이 여기서 돈다 | 짧으면 `after()`는 enqueue만 하고 처리는 전부 매분 트리거에 |
| 함수 `maxDuration` 상한 | gpt-oss-120b 호출 1회가 30초를 넘을 수 있다 | 회의 정리·카드를 더 잘게 job으로 쪼갠다. Edge Function은 쓰지 않는다 |

**판정 결과 (2026-09-10 / D3 확정)**: `[x]` 플랜: **Hobby** · Cron 최소 간격: **하루 1회**(더 잦은 표현은 배포 실패) · `after()` 상한: **문서에 별도 표기 없음 — 함수 maxDuration에 묶이는 것으로 가정** · `maxDuration`: **기본 300초 / 최대 300초** → 매분 트리거: **Supabase `pg_cron` + `pg_net`** (ADR-010). 출처: Vercel 문서 *Usage & Pricing for Cron Jobs* · *Configuring Maximum Duration*. 구현: `supabase/migrations/0004_worker_cron.sql` + `npx tsx scripts/setup-worker-cron.ts <배포URL>`.

**설정**
- GitHub 연동, `main` 푸시 = 프로덕션 배포. 하루 마지막 커밋은 항상 배포 가능 상태.
- 환경 변수 (Production + Preview): `GROQ_API_KEY` · `EMBEDDING_PROVIDER=voyage` · `VOYAGE_API_KEY` · `EMBEDDING_MODEL=voyage-4-lite` · `SLACK_BOT_TOKEN` · `SLACK_SIGNING_SECRET` · `NOTION_TOKEN_ENCRYPTION_KEY` · `NEXT_PUBLIC_SUPABASE_URL` · `NEXT_PUBLIC_SUPABASE_ANON_KEY` · `SUPABASE_SERVICE_ROLE_KEY` · `JOBS_TRIGGER_SECRET`
- `NEXT_PUBLIC_` 접두사는 Supabase URL·anon key **둘뿐**. 그 외 키가 클라이언트 번들에 들어가면 안 된다 — 빌드 후 `.next/static`을 grep으로 확인.
- 도메인: Vercel 기본 도메인으로 제출 가능. 커스텀 도메인은 D11까지 여유 있을 때만.
- ~~Vercel Cron을 택했으면 `vercel.json`에 `/api/jobs/run` 매분.~~ → Hobby 플랜이라 `pg_cron`으로 확정(위 판정). `vercel.json`에는 `framework: nextjs`만 두고 `crons`를 넣지 않는다 — Hobby에서 매분 표현은 배포를 실패시킨다. 트리거 호출은 `JOBS_TRIGGER_SECRET`을 `x-jobs-secret` 헤더로 넣어 인증한다.

---

## 3. Supabase

- 프로젝트 생성 (리전은 서울 또는 도쿄). 무료 티어로 시작, Pro 전환 시점 = 파일럿 2팀.
- Extensions: `vector`(pgvector) · 매분 트리거를 pg_cron으로 정했으면 `pg_cron` + `pg_net`.
- Auth: 이메일 매직링크 활성화. 회원가입은 열어두되 멤버십은 시드·lead 지정으로만 생긴다(멤버십 없는 로그인은 "초대가 필요합니다").
- 키: `anon key`(클라이언트) · `service_role key`(서버 전용 — 어댑터·워커·시드에서만, 요청 경로 금지).
- 마이그레이션은 `supabase/migrations/`에서 `npx supabase db push`. 대시보드에서 직접 스키마를 고치지 않는다.
- **pg_cron 트리거 SQL (택했을 경우)** — D1에 사람이 대시보드 SQL 편집기에서 1회 실행:
  ```sql
  select cron.schedule('sasu-jobs-run', '* * * * *',
    $$ select net.http_post(
         url := 'https://<배포도메인>/api/jobs/run',
         headers := '{"x-jobs-secret": "<JOBS_TRIGGER_SECRET>"}'::jsonb,
         body := '{}'::jsonb) $$);
  ```
- 데이터 삭제 정책은 코드가 집행하지만, **파일럿 종료 시 조직 단위 전량 삭제**(`orgs` cascade)는 사람이 요청받아 실행한다.

---

## 4. 슬랙 앱 — D0 생성, 배포 후 URL 등록

1. api.slack.com/apps → Create New App (from scratch) → 우리 워크스페이스.
2. **Bot Token Scopes 10개 (최소)**: `channels:history` · `groups:history` · `app_mentions:read` · `im:history` · `im:write` · `chat:write` · `users:read` · `users:read.email` · `channels:read` · `groups:read`. 뒤의 두 개는 `conversations.list`·`conversations.members`(채널 연결 화면·전원 동의 확인)에 필요하다. 파일·이메일 본문 스코프는 요청하지 않는다.
3. `users:read.email`이 승인되는지 확인 — 워크스페이스 관리자 설치 시 가능한지 (PRD §10 #15). 안 되면 세팅 화면에 수동 매핑 표를 넣는다(ADR-016 대안).
4. Install to Workspace (관리자 권한 필요) → `SLACK_BOT_TOKEN`(xoxb-) · Basic Information의 `Signing Secret` → Vercel env.
5. **배포 후** (D1 저녁): Event Subscriptions 켜고 Request URL `https://<도메인>/api/slack/events` (URL 검증 challenge에 200). Subscribe to bot events: `message.channels` · `message.groups` · `app_mention` · `message.im`.
6. Interactivity & Shortcuts 켜고 Request URL `https://<도메인>/api/slack/interactions`.
   - DM ASK(ADR-051): App Home → Messages Tab에서 메시지 입력을 허용한다. `im:history` 또는 이벤트 구독을 추가했다면 앱을 재설치한다. 부서가 하나면 바로 질문하고, 여러 부서면 `부서 이름: 질문`으로 선택한다. 새 앱 적용 전에 `0029_slack_ask_completion.sql`을 적용해야 한다. 운영 변경과 실제 발송 검증은 사용자 테스트 단계에서 수행한다.
7. 봇을 수집할 채널 3개에 초대. 프라이빗 채널은 봇 초대가 있어야 `conversations.list`에 보인다.
8. 백필 레이트 리밋: `conversations.history`는 Tier 3(분당 50). 채널 3개 7일치면 수 분 — job 1개, 페이지네이션 (PRD §10 #18).

OAuth "Add to Slack"은 만들지 않는다(ADR-017). 파일럿 2팀째는 별도 배포 인스턴스.

---

## 5. Recall.ai — D0 확인, D6 판정

> **2026-09-13 판정 (ADR-036): 회의 봇은 컷.** 회의 입력은 `.vtt`/`.txt` 전사 업로드와 자료 검토함이다. 아래 절은 기록으로만 남긴다.

**D0에 확인할 것** (PRD §10 #1·#13):
- 가입·승인 소요 (즉시인지, 심사가 있는지) · 가격 (회의 시간당) · 무료 크레딧
- 웹훅 서명 지원 여부 → 없으면 URL 시크릿 토큰 + IP 제한
- 녹음·영상 보존 기간과 삭제 API → **전사 수신 즉시 삭제 요청**하도록 설정 (PRD §6-12)
- 봇 이름 "사수 (기록 중)" 설정 가능 여부 · 참석 시 채팅 고지 가능 여부 (법적 전제, PRD §8-3)
- Zoom/Meet 대기실 승인 절차 — 실패하면 `bot_failed` + "대기실 승인 필요"

**판정 결과**: `[ ] 가격: ___/시간 · 승인: ___ · 웹훅 서명: 있음/없음 · 녹음 삭제: 자동/수동`

**D6(9/13) 판정**: 봇 전사가 items로 들어오지 않으면 전사 업로드(.vtt/.txt)로 확정하고 PRD §4·ADR-005에 결과를 적는다. 업로드 파서는 D5에 먼저 만들어 두므로 판정이 늦어져도 데모 장면 3은 성립한다.

---

## 6. Notion — D7

- 서버 환경에 `NOTION_TOKEN_ENCRYPTION_KEY`를 준비한다. 실제 내부 통합 토큰은 조직 관리자가 관리자 화면에서 입력하며 암호문으로만 저장된다.
- 기존 단일 조직의 `NOTION_TOKEN`은 승인된 운영 이전 때 `scripts/register-legacy-notion.ts`가 읽는 값이며 앱 런타임 fallback으로 사용하지 않는다.
- 부서 원칙 문서 페이지(우리 팀 1개, 게스트용은 합성 텍스트로 시드)를 통합에 **연결 추가**(페이지 ··· → Connections). 공유하지 않으면 API가 404를 낸다.
- 100블록 넘는 페이지는 헤딩 단위로 청크된다 — 원칙 문서는 헤딩 구조를 갖추면 인용이 정확해진다.
- 폴링·웹훅은 만들지 않는다(ADR-004). 바뀌면 S5의 [다시 가져오기].

---

## 7. Groq API

- console.groq.com → API Keys → `GROQ_API_KEY`. **공동 키 1개**(ADR-020).
- 모델 ID: 생성 `openai/gpt-oss-120b` · 분류 `openai/gpt-oss-20b`. 둘 다 production이고 strict `json_schema`를 지원한다 — 이게 선택 기준이다 (ADR-028). `llama-3.3-70b-versatile`은 strict 미지원이라 인용 강제가 무너지고, qwen·minimax 계열은 preview(평가 전용)라 심사 기간 9/21~10/5 가동 보장이 없다.
- **D2까지 단가·rate limit 확인** (PRD §10 #19): 토큰 단가와 티어별 분당 요청·토큰 상한을 콘솔에서 확인해 §12 예산과 PRD §8-5의 $100 상한을 재계산한다. rate limit이 낮으면 워커 동시성을 올리지 말고 `jobs`의 지수 백오프로 흡수한다.
- 지출 상한: Groq 콘솔에 Anthropic식 spend limit이 없으면 선불 크레딧 충전액을 상한으로 쓴다 `(확인 필요)`. 어느 쪽이든 실제 측정은 `llm_calls`이고 S5 "이번 달 사용액"에 보인다.
- **D12까지 약관 확인** (PRD §10 #6·#14·#20): 입력의 학습 미사용 여부, 데이터 보존 기간. 확인 결과를 제출서 "AI 활용" 문구와 파일럿 동의문에 반영한다. 확인 전에는 "학습에 쓰지 않는다"를 단정하지 않는다.

---

## 8. 임베딩 — Voyage 키 발급, D2 확정

- 확정 모델: Voyage AI `voyage-4-lite`, 1024차원. 앱은 `VOYAGE_API_KEY`를 서버에서만 사용하고 문서에는 `input_type=document`, 질문에는 `input_type=query`를 보낸다. `EMBEDDING_MODEL`이 다른 행은 `search_as()`에서 제외한다.
- `supabase/migrations/0006_embeddings_search.sql`에서 시작한 검색 함수는 `0009_voyage_embeddings_search.sql`로 `vector(1024)`와 Voyage 모델 필터로 전환된다. `0010_requeue_embedding_jobs.sql`은 전환 중 구버전 워커가 남긴 실패 job을 다시 큐에 넣는다. 마이그레이션은 기존 벡터를 비우고 활성 실데이터를 재임베딩한다.
- **판정 결과 (2026-09-10)**: `[x] 모델: Voyage voyage-4-lite · 차원: 1024 · 병합 임계 0.85 유지 여부: 첫 파일럿에서 관찰`

---

## 9. 파일럿·동의 — 사람만 할 수 있는 일

### 우리 팀 동의문 (D1 v1 → D9 최종)
실사용 데이터가 걸리는 시점은 D1이다. D1에 v1을 전원 서면 동의로 받고 D9에 최종본으로 `consent_version`을 올린다. 동의문에 반드시 들어가는 문장:
- 수집 범위: 지정 슬랙 채널(최근 7일 포함), 참석 고지된 온라인 회의 전사, 지정 노션 페이지
- 봇 참석 고지 + 이의 시 채널 제외 (통신비밀보호법 자문 전 기본값, PRD §10 #5)
- **원장에 인용된 발언은 원장의 일부로 남는다** (채널 제거·동의 철회 후에도, ADR-022)
- 퇴사·탈퇴 후에도 원장의 이름 스냅샷은 업무 기록으로 보존 (PRD §10 #17)
- lead가 질문 이력(`answers`)을 볼 수 있다 (감사 기록)
- 동의 철회는 이후 발언부터 적용
- 미동의 시 그 사람의 발언은 저장되지 않는다 — 단, 채널 멤버 전원 동의 전에는 채널을 연결할 수 없다

### 두 번째 파일럿 팀 (D0 연락 → 9/12 확정)
- 조건: 주 3회 이상 회의하는 5~20인 팀, 슬랙 사용, 녹음·수집 동의 가능
- 실패 시: 데모데이 서사를 "1팀 4주 실데이터 + 게스트 2부서"로 조정하고 약해진 조건을 발표에서 숨기지 않는다 (ADR-006)
- 파일럿 계약 조건에 "종료 시 조직 단위 전량 삭제 요청 즉시 이행"을 넣는다

### 파일럿 운영 (9/21~10/16, 데모데이 탄약)
- 매주 금요일 파일럿 팀 인터뷰 15분 — 정성 코멘트 1~2개
- 지표: 분류 건수 / 카드 발송 수 / 카드에서 실제 결정된 비율 / 결정 리드타임 **1주차 vs 4주차** / Q&A 질문 수·인용 답변률(refused 비율 포함)
- 제출서(9/20)에서는 지표를 약속하지 않는다. 지표는 데모데이(10/17)용.

---

## 10. 사람만 할 수 있는 결정 — 게이트

### D3 9/10 (목) 자정 — 세로 슬라이스 게이트 (ADR-025)
시크릿 창, 배포 URL에서 "실제 슬랙 메시지 → 대시보드 분류 → 카드 → 웹에서 결정 → 원장"을 **5분 안에** 완주하는가. 감이 아니라 그날 밤 스톱워치로 판정한다.
- 통과 → D4 진행
- 실패 → 즉시 강등: 회의는 업로드 전용(봇 시도 안 함) · 노션은 원칙 문서 텍스트 붙여넣기(API 안 씀) · 임베딩 검색은 키워드 검색. PRD §8-0·§4를 그날 고친다.

### D6 9/13 (일) — 회의 봇 판정 (ADR-005) · 컷 ③ 72h 병합
봇 전사가 items로 들어왔는가 → 아니면 업로드로 확정. 병합이 안 됐으면 데모 장면 3은 "같은 형식의 카드 2장"으로 서사 조정.

### D8 9/15 (화) 오후 — 코드 리뷰 (ADR-026)
Codex가 만든 것 중 세 곳은 사람이 직접 읽는다:
1. **RLS 정책** — 모든 정책에 USING **과** WITH CHECK가 둘 다 있는가. `can_see()` 외의 판정 로직이 없는가. `jobs`·`ingest_events`·`llm_calls`·`orgs`가 사용자에게 막혀 있는가
2. **워커** — `FOR UPDATE SKIP LOCKED` · 지수 백오프 · 3회 실패 시 소유 row status 갱신 · 2분 스윕
3. **슬랙 서명 검증** — 타임스탬프 5분 창 · HMAC 비교가 상수 시간 · 검증 전에 본문을 파싱하지 않음 · 버튼 클릭자 = 담당자 or lead 검증
`/review` 슬래시 커맨드가 체크리스트를 돌리지만, 이 셋은 결과를 눈으로 본다.

### D9 9/16 (수) — 컷 ⑤⑥⑦ 판정
DM 버튼·모달 / S0 동의 화면 / visibility 지정 UI. 컷 ⑤는 이탈 방지 원칙을 되돌리는 것임을 알고 발동한다.

### D10 9/17 (목) — 게스트 시드 (기능 프리징은 ADR-049로 폐지)
게스트 시드 실행·검증(부서 2개, 같은 질문 다른 답). "이후 신기능 금지" 규칙은 ADR-049로 없앴다.

---

## 11. 제출 — [submission-checklist.md](submission-checklist.md)

D12(9/19)에 영상·스크린샷·제출서를 만들고 **제출** 버튼까지. 9/20은 버퍼. 상세 항목·문안·촬영 원칙은 체크리스트 문서.

---

## 12. 예산

| 항목 | 지금 (파일럿 + 심사 기간) | 확인 |
|---|---|---|
| Groq API | 하루 ~200건 분류(gpt-oss-20b) + 카드·답변·회의 정리 수십 건(gpt-oss-120b) → **$100 상한** | 단가·상한 확인 (D2) ⬜ |
| Recall.ai | `(확인 필요)` 회의 시간당 과금 — D0 | ⬜ |
| Vercel | Hobby 무료, 매분 Cron이 필요하면 Pro `(확인 필요)` — D0 | ⬜ |
| Supabase | 무료 티어 | — |
| 임베딩 | 미미 (items 수 비례) | — |
| 도메인 | Vercel 기본 도메인 | — |

---

## 13. 하지 말아야 할 것

- 마감일에 참가 접수를 하지 마라. D0에 한다.
- 매분 Cron이 되는지 확인하기 전에 워커를 짜지 마라 — 트리거는 바뀌어도 되지만 "된다"는 전제를 미검증으로 두지 마라.
- 임베딩 차원을 스키마에 미리 박지 마라.
- 우리 팀 실데이터를 게스트 모드·스크린샷·영상에 쓰지 마라.
- 동의 전에 채널을 연결하지 마라. 동의문 v1이 D1보다 늦으면 D1에 실데이터를 넣지 마라.
- Supabase 대시보드에서 스키마를 직접 고치지 마라. 마이그레이션으로만.
- D8 코드 리뷰를 건너뛰지 마라. RLS는 통과하는 것처럼 보이면서 WITH CHECK가 빠져 있기 쉽다.
- 제출서에 컷된 기능을 만든 것처럼 쓰지 마라. "로드맵"으로 구분한다.
- 날짜로 신기능을 제한하지 않는다. 운영 반영은 검증과 사용자 승인을 거친다(ADR-049).

## 14. 후속 기능과 고객사 Slack 설치 (ADR-052)

개발 검증은 [product-continuity 실행 기록](verification/product-continuity-2026-09-16.md)을 따른다. 아래는 운영 반영 때 실행할 절차이며 이번 개발에서 실행하지 않았다.

1. Slack 앱에 bot scopes `app_mentions:read, channels:history, channels:read, chat:write, groups:history, groups:read, im:history, im:write, users:read`를 설정한다. 공개/비공개 채널 수집과 DM이 기존 범위다. OAuth redirect URL은 정확한 운영 주소의 `/api/slack/oauth/callback`이다. `app_uninstalled`를 구독한다. 기존 message.channels/message.groups/app_mention/message.im 구독과 signing secret 검증을 유지한다.
2. 서버 환경에 `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_TOKEN_ENCRYPTION_KEY`를 준비한다. 암호화 키는 암호학적 난수 32바이트의 표준 base64이며 비밀 저장소에서 생성·보관한다. 토큰 rotation 및 조직 전체 Enterprise Grid 설치는 이번 구현 범위가 아니므로 활성화하지 않는다. 다른 고객사가 설치하려면 Slack 앱 배포 설정에서 다른 워크스페이스 설치를 허용해야 한다.
3. 변경 전 DB 백업과 기존 배포 ID를 기록한다. 승인된 점검 창에서 워커 트리거·수집을 잠시 정지하고 `0030`~`0033`을 순서대로 적용한다. 기존 Supersedes 분기가 있다면 `decisions_one_correction` unique 인덱스 전에 데이터 검토가 필요하다. 점검 중 발생한 수신 이벤트를 성공 처리한 것으로 기록하지 않는다.
4. 기존 파일럿 수동 설치는 서버 키가 준비된 환경에서 `npx tsx scripts/register-legacy-slack.ts <org UUID> <org admin UUID> <expected Slack team ID>`로 옮긴다. 스크립트는 auth.test의 실제 team과 scopes를 확인하고 암호문만 저장한다. 출력은 조직/team ID와 성공 여부뿐이다. 전역 `SLACK_BOT_TOKEN`만 남기고 새 앱을 가동하면 미연결로 차단된다.
5. 검증한 커밋의 앱을 반영하고 워커·수집을 재개한다. 신규 고객사는 `SASU_ORG_ADMIN_MODE=on`에서 조직 관리 → 수집 채널 → Slack에 사수 설치로 진행한다. 조직 관리자 권한과 기존 조직이 먼저 있어야 하며 이번 범위는 조직 생성/가입 자동화가 아니다.
6. 실제 워크스페이스에서 설치·재설치·다른 조직 연결 거절·해지, 같은 Slack ID/채널 ID를 가진 다른 워크스페이스 격리, 원문 편집/삭제, Notion 자동 갱신, 정정, 예약·마감 알림, 후속 질문을 확인한다. 실발송 확인은 별도 사용자 승인 후 수행한다.
7. 해지되면 암호화 토큰도 지우며 수집과 답변 전달을 중단한다. 같은 workspace 재설치는 가능하나 채널을 다시 활성화해야 한다. 알림은 DB+Slack 간 exactly-once를 보장하지 않는다. 기능 장애 시 먼저 수집/워커 및 설치 기능을 정지하고 원인 수정 후 재개한다. 신규 schema/job이 있는 상태에서 구형 워커를 무조건 재가동하지 않는다.

토큰 키를 바꾸기 전에는 기존 키로 복호화 후 새 키로 재암호화하거나, 고객사가 재설치해야 한다. 기존 키를 먼저 폐기하면 설치 토큰을 복구할 수 없다.

공식 계약: [Slack OAuth v2 설치](https://docs.slack.dev/authentication/installing-with-oauth/), [oauth.v2.access](https://docs.slack.dev/reference/methods/oauth.v2.access/), [app_uninstalled](https://docs.slack.dev/reference/events/app_uninstalled/).

## 15. 개발 회고 수집과 검토 (ADR-063)

2026-09-19 확정한 1단계는 파일 업로드 방식이다. `SASU_RETRO_ENABLED`의 기본값은 `false`다. 운영에는 2026-09-20에 0046·0047·0048을 적용하고 `SASU_RETRO_ENABLED=true`로 켰다([운영 반영 기록](verification/production-rollout-2026-09-20.md)). 다른 환경에 켤 때도 적용 전 백업과 배포 ID를 기록한다. 공개 링크·노션 쓰기·개인 토큰 전송은 이 단계에 없다.

1. 로컬 리포에서 `npm ci` 후 `npm run retro:collect -- --dry-run`을 실행한다. 설정이 없으면 `config_required` 안내만 나오며 파일은 만들지 않는다. `npm run retro:collect`를 한 번 실행하면 사용자 홈의 `.sasu/retro.json` 설정 틀을 만든다.
2. 설정의 `repos`에 본인 리포 절대 경로, `author_emails`에 본인 Git 작성자 이메일을 넣는다. 이메일 목록이 비어 있으면 Git 수집은 0건이다. `claude.enabled`, `codex.enabled`, `memory.enabled`는 각각 끌 수 있다. `tz` 기본은 `Asia/Seoul`이다.
3. `npm run retro:collect -- --date 2026-09-19 --dry-run`으로 마스킹된 종류별 건수와 첫 5개 제목을 본다. `--out`을 주어도 dry-run은 번들 파일을 쓰지 않는다. 일반 실행은 활동 건수·마스킹 건수·출력 경로만 출력한다.
4. `npm run retro:collect -- --date 2026-09-19 --out retro-2026-09-19.json`으로 만든 파일을 사수 → 해당 부서 → 회고에 드롭한다. 같은 파일명은 덮어쓰지 않는다. 하루 500개·파일 1MiB·최근 7일 이내의 활동만 받는다. 서버에는 마스킹한 활동만 저장하며 업로드한 번들 자체는 보관하지 않는다.
5. Chrome은 기본 꺼짐이다. 본인이 원할 때만 `--chrome` 또는 `chrome.enabled=true`로 켠다. `chrome.profile` 기본은 `Default`; `chrome.mode`는 `denylist` 또는 `allowlist`, `chrome.domains`는 추가 도메인 목록이다. 은행·메일·로컬 주소는 제외하고 쿼리·fragment를 지운다. 검색 결과 페이지는 방문 제목에서도 제외하며 검색어는 `--search-terms` 또는 `search_terms=true`의 별도 동의가 있어야 수집한다. 원본 History는 복사해 읽고 임시 복사본은 정리한다. Node의 SQLite를 우선 사용하고 없으면 Windows `py -3` 또는 macOS/Linux `python3`의 표준 SQLite를 사용한다.
6. 초안의 근거를 확인하고 다음 생성에서 뺄 활동을 선택한다. 편집·확정 후 Markdown을 복사하거나 내려받는다. 기본은 본인만 공개하며 부서 공유는 원본 권한 범위에서만 허용된다. 원본이 삭제되거나 접근권한이 없어지면 해당 내용을 계속 노출하지 않는다. 본인은 하루치 전체를 삭제할 수 있다.

자동 실행을 원하면 먼저 직접 실행을 검증한 뒤 Windows 작업 스케줄러에서 `node.exe`를 프로그램으로, `node_modules/tsx/dist/cli.mjs scripts/retro-collect.ts --out <날짜별 출력 파일>`을 인수로, 리포 경로를 시작 위치로 지정한다. macOS는 같은 명령을 launchd의 `ProgramArguments`와 `WorkingDirectory`로 설정한다. 날짜별 출력 경로는 사용자의 래퍼에서 생성해야 하며 수집기는 기존 파일을 덮어쓰지 않는다. 이 개발에서 사용자 PC에 예약 작업을 등록하지 않았다. 생성한 파일은 사용자가 웹에 올린다.

로컬 QA: `node scripts/verify-retro-collector.mjs`는 실제 개인 기록을 열지 않는 합성 SQLite 검증이다. `node scripts/verify-retro-sql.mjs "D:/바이브코딩/.sasu-qa-db"`는 격리 DB 권한·동시성·롤백을 검증한다. 로컬 Supabase 검증 서버는 `SASU_RETRO_ENABLED=true`, `E2E_RETROS=1`로 `node scripts/review-qa.mjs build`, `start`, `retro-test`를 차례로 실행한다. 운영에서는 매분 `/api/jobs/run` 트리거가 필요하다. 로컬 E2E는 같은 워커 엔드포인트를 직접 호출해 cron을 재현한다.

Vercel CLI가 설치되지 않은 환경에서는 운영 설정·배포 로그 확인 전에 `npm i -g vercel` 설치를 권장한다. 이번 작업은 로컬 커밋·머지까지이며 배포 명령은 실행하지 않는다.
