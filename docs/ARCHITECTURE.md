# 아키텍처 — 사수 (SASU)

- 문서 버전: 1.1
- 작성일: 2026-09-08 (1.1: LLM 공급자 Groq 교체 — ADR-028)
- 지위: **파생 문서**. 구조 결정의 근거는 [PRD §6-11(아키텍처)·§6-12(데이터·상태)·§6-1(스키마)](PRD.md)에 있고, 결정의 이유·트레이드오프는 [ADR.md](ADR.md)에 있다.
- 문서 충돌 시 우선순위: [PRD](PRD.md) → 이 문서 → [ADR](ADR.md). 이 문서와 PRD가 어긋나면 PRD가 옳다.
- 현재 상태: **코드 착수 전(D1 9/8).** 아래 구조는 구현이 따라야 할 계약이며, 실제 디렉터리가 생긴 뒤에는 이 문서를 함께 갱신한다.

---

## 1. 한 장으로 보는 구조

```text
 외부 이벤트                      Next.js Route Handlers (3초 안에 끝내는 것만)
 ┌─────────────────┐            ┌───────────────────────────────────────────┐
 │ Slack Events /  │──────────▶ │ 어댑터: 서명 검증 → 동의 확인 → 마스킹    │
 │ Interactions    │            │         → items upsert → jobs enqueue     │
 │ Recall.ai 웹훅 · │──────────▶ │         → after(runOnce) → 200            │
 │ 전사 업로드      │            ├───────────────────────────────────────────┤
 │ 음성·문서 업로드 │──────────▶ │         (음성 원본 저장 없음)             │
 │ Notion 가져오기  │──────────▶ │ UI API: 대시보드·카드·원장·묻기            │
 └─────────────────┘            │         (세션 클라이언트 = RLS)            │
                                └───────────────┬───────────────────────────┘
                                                │ enqueue / select
                                                ▼
 ┌───────────────────────────── Supabase Postgres ─────────────────────────────┐
 │ items · classifications · meetings · document_summaries · sources · members │
 │ decision_requests · decisions · citations · conflicts · answers             │
 │ jobs · llm_calls · ingest_events · orgs         RLS: can_see() 하나로 판정  │
 └───────────────────────────────────┬─────────────────────────────────────────┘
                                     │ FOR UPDATE SKIP LOCKED
                                     ▼
 ┌──────────── 워커 /api/jobs/run (after() 즉시 1회 + 매분 트리거) ────────────┐
 │ classify → embed                                                             │
 │ classify → make_card → send_slack        summarize_meeting → make_card      │
 │ summarize_document · answer · notion_import · slack_backfill · sweep       │
 └───────────────────────────────────┬─────────────────────────────────────────┘
                                     │ llm.structured(purpose, schema, prompt)
                                     ▼
                       lib/llm.ts — 유일한 Groq 호출 지점
                       (gpt-oss-120b / gpt-oss-20b / Whisper, 재시도·llm_calls 기록)
```

**세 가지가 전부다.** ① 어댑터는 items를 먼저 저장하고 나머지는 job에 맡긴다. ② 무거운 일은 전부 워커가 한다. ③ 권한은 SQL이 판정하고 애플리케이션은 그 결과를 보여줄 뿐이다.

---

## 2. 디렉토리 구조

```text
sasu/
├── app/
│   ├── (auth)/d/[dept]/            # S1 page.tsx · cards/[id] · ledger · ask · documents · settings
│   ├── consent/                    # S0 동의 화면
│   ├── demo/                       # S6 게스트 (읽기 전용, revalidate 캐시, LLM 호출 0)
│   └── api/
│       ├── slack/{events,interactions}/route.ts
│       ├── meetings/transcript/route.ts
│       ├── notion/import/route.ts
│       ├── consent/route.ts
│       ├── jobs/run/route.ts       # 워커. 시크릿 헤더 인증
│       ├── d/[dept]/{items,cards,ledger,decisions,ask,voice,documents}/route.ts
│       ├── cards/[id]/decide/route.ts
│       └── demo/[...]/route.ts
├── components/                     # 표현 계층. 인용 칩·카드·원장 행 등 (TDD 비대상)
├── lib/
│   ├── contracts.ts                # Zod 스키마·타입 단일 소스: IngestItem · Classification · CardDraft · AnswerDraft
│   ├── llm.ts                      # Groq 게이트웨이 (§3.3)
│   ├── jobs.ts                     # enqueue(kind, payload, {dedupeKey?}) · runOnce()
│   ├── search.ts                   # search_as() 호출만. 권한 판정은 SQL 안
│   ├── mask.ts · rules.ts          # 정규식 마스킹 · 규칙 분류 (순수 함수)
│   ├── adapters/{slack,transcript,document,voice}.ts # 입력 검증·파싱
│   ├── notion.ts                               # Notion API 페이지·블록 어댑터
│   ├── pipeline/{classify,card,answer,meeting-summary,document-summary}.ts # job 본체
│   ├── slack/{verify,blocks,post}.ts           # 서명 검증 · Block Kit · postMessage
│   └── supabase/{server,rls-client,service}.ts # 클라이언트 팩토리 3종 (§6 불변식 2)
├── supabase/migrations/            # 6-1 스키마 · can_see()/search_as() · RLS 정책 · (D2) embedding 컬럼
├── scripts/
│   ├── seed-demo.ts                # 게스트 합성 데이터 → 실제 파이프라인 → 스냅샷 (멱등)
│   ├── execute.py                  # Harness step 실행기
│   └── hooks/                      # tdd-guard.sh · dangerous-command-guard.sh
├── tests/                          # lib/ 미러 (lib/pipeline/card.ts ↔ tests/pipeline/card.test.ts) · rls/ · e2e/
├── phases/                         # Harness step 파일 (index.json + stepN.md)
└── vercel.json                     # cron: /api/jobs/run 매분 (Vercel Cron을 택한 경우)
```

`src/`를 두지 않는다. Next.js App Router의 `app/`이 루트에 있고 비즈니스 로직은 전부 `lib/`이다.

---

## 3. 패턴

### 3.1 어댑터는 items를 먼저 저장한다

어댑터(`lib/adapters/*`)의 일은 넷뿐이다: 서명 검증 → 동의 확인(`author_ext_id`가 미동의면 skip) → 정규식 마스킹 → `items` upsert + `jobs` enqueue. 분류·임베딩·카드·슬랙 발송은 전부 job이라 외부 장애와 무관하게 나중에 따라잡는다. **죽어서 데이터를 잃는 지점은 upsert 이전뿐이다.** 어댑터의 출력은 `IngestItem` 하나이고, 어댑터는 분류나 LLM의 존재를 모른다.

### 3.2 무거운 일은 전부 job이다

요청 핸들러는 (1) 검증 (2) DB 쓰기 (3) `enqueue` (4) `after(() => runOnce())` (5) 응답 — 슬랙 3초 규칙과 Vercel 함수 수명 안에서 끝난다. `runOnce()`는 `FOR UPDATE SKIP LOCKED`로 job을 집고, 실패는 `attempts`·지수 백오프로 `run_after`를 갱신하며, 3회 실패 시 `failed` + 소유 row의 status를 `unclassified` / `needs_review` / `failed(error_code)`로 바꾼다. 매분 트리거가 `after()`가 죽었거나 재시도 대기 중인 job을 집는다. `sweep` job이 2분 넘게 pending인 answers·cards를 `failed(llm_timeout)`으로 정리한다 — 영원한 스피너는 없다.

job 종류 10개: `classify` · `embed` · `summarize_meeting` · `summarize_document` · `make_card` · `answer` · `send_slack` · `notion_import` · `slack_backfill` · `sweep`. 새 종류를 추가하면 이 목록과 PRD §6-1의 주석을 함께 고친다.

### 3.3 LLM 호출 지점은 하나

텍스트 생성·분류는 `lib/llm.ts`의 `llm.structured(purpose, schema, prompt)`로만 Groq을 부른다. 음성 입력은 같은 파일의 `llm.transcribeAudio()`만 사용하며 원본을 저장하지 않는다. 재시도(429·5xx·타임아웃 백오프 3회) · 거절/스키마 처리 · `llm_calls` 기록(purpose·model·tokens·cost_usd·duration_ms)은 여기서만 한다.

텍스트 모델은 `openai/gpt-oss-120b`(생성)와 `openai/gpt-oss-20b`(분류), 음성 전사는 `whisper-large-v3-turbo`다. **모듈이 아니라 `purpose`가 모델을 고른다** — 호출부는 모델 ID를 모른다. 형식 제어는 `response_format: {type: "json_schema", json_schema: {strict: true, ...}}` 하나뿐이며 세 가지 제약이 따라온다: ① strict는 모든 필드가 `required` + `additionalProperties: false`라 optional을 쓸 수 없다 — null이 정상인 필드는 nullable union으로 정의한다 ② properties 순서가 생성 순서를 보장하지 않으므로 **필드 순서 citations → (background|reasoning) → 결론**은 스키마와 시스템 프롬프트 양쪽에 적고, 실제 방어는 인용 문자열 검증(§3.5)이 한다 ③ `stop_reason: refusal`이 없으므로 거절은 `refused` 필드와 인용 0개로 판정한다.

### 3.4 권한은 SQL에서 판정한다

가시성 판정은 `can_see(p_user, p_dept, p_visibility)` 하나. RLS 정책(USING + WITH CHECK 둘 다)과 `search_as(p_user, p_dept, p_query_embedding, k)` SECURITY DEFINER 함수가 같은 함수를 호출한다. 웹은 세션 클라이언트(`lib/supabase/rls-client.ts`)로 조회하고, 슬랙 경유 Q&A는 `search_as(user_id, …)`로 조회한다. **service role(`lib/supabase/service.ts`)은 어댑터 insert·워커·게스트 시드에서만** 쓴다. service role로 검색한 뒤 애플리케이션에서 필터링하는 코드는 리뷰에서 반려한다 — 누락 한 줄이 유출이다.

### 3.5 인용이 없으면 출력이 없다

카드(`CardDraft`)와 답변(`AnswerDraft`)의 `citations[]`는 최소 1개 required이고, 파이프라인이 `item_id|decision_id` 실존 + `quote`가 원문에 문자열로 포함되는지 검증한다. 실패한 인용은 제거하고, 0개가 되면 답변은 `refused`, 카드는 1회 재생성 후 `needs_review`(대시보드에만, DM 없음). UI는 인용 칩이 없는 문장을 렌더하지 않는다. LLM 심판(2차)은 없다 — 문자열 검증이 전부다.

### 3.6 계약은 `contracts.ts` Zod 단일 소스

`IngestItem` · `Classification` · `CardDraft` · `AnswerDraft` · `MeetingSummary` · `DocumentSummary`를 Zod로 정의하고, `llm.ts`의 parse와 DB insert가 같은 타입을 쓴다. 어댑터 출력과 LLM 출력의 타입이 코드 두 곳에 있으면 반드시 어긋난다.

### 3.7 파생물은 원본 중 가장 좁은 것을 상속한다

카드 visibility = 인용 소스들의 최솟값, 회의 정리 = 회의 소스, 충돌 설명 = 양쪽 결정. 카드 생성 시 한 번 계산하고 이후 **좁아지는 변경은 금지** — 병합 시 새 후보의 소스가 더 좁으면 병합하지 않고 별도 카드를 만든다. `leads_only` 카드는 담당자를 lead로 강제한다.

---

## 4. 데이터 흐름

### 4.1 슬랙 메시지 한 건의 여정

```text
Slack → POST /api/slack/events
  서명 검증 → ingest_events(event_id) 멱등 → 봇/본문 없음/미동의 skip
  → mask() → items upsert(unique source_id+external_ref) → enqueue(classify) → after(runOnce) → 200 (3초 내)

classify job: rules.ts(정량) → 결정 후보면 gpt-oss-20b 정성 분류 → classifications 저장
  → label=decision & confidence≥0.6 → enqueue(make_card) · 항상 enqueue(embed)

make_card job: 유사 items 5 + 원칙 문서 + 원장 유사 결정 3 → gpt-oss-120b CardDraft
  → 인용 검증 → 72h·0.85 병합 판정 → decision_requests + citations + conflicts
  → visibility 계산 → 담당자 결정(leads_only면 lead) → enqueue(send_slack)

send_slack job: Block Kit DM (헤더·마감·배경·인용 링크·충돌·[결정][보류][반려])
  → 실패(429·DM 불가) 3회 → 웹 카드만 + lead 알림 배지
```

### 4.2 결정 한 건의 여정

```text
슬랙 버튼 → POST /api/slack/interactions (서명 검증 · 클릭자 = 담당자 or lead 검증) → 모달(사유)
  또는 웹 POST /api/cards/[id]/decide (세션 · 역할표 재검증 · RLS WITH CHECK)
  → decisions insert (request_id unique → 두 번째 시도는 "이미 {이름}이 {시각}에 결정 → 원장 #N")
  → decision_requests.status=decided · lead_time_min 계산
  → 원 스레드에 결과 한 줄 + 원장 링크만 · 질문자 멘션 (사유·인용은 스레드에 쓰지 않는다)
```

### 4.3 질문 한 건의 여정

```text
웹 S4 / @사수 멘션 / DM → 입력 검증(5자 미만·1,000자 초과) → 매핑 없는 슬랙 사용자 거절
  → items 0건이면 LLM 없이 "아직 참고할 기록이 없습니다"
  → answers row(pending) → enqueue(answer) → after(runOnce) → 즉시 응답 (슬랙: "찾아보는 중…")

answer job: 검색 권한 결정 — 채널이면 member, DM·웹이면 질문자
  → search_as(user, dept, embedding, k): items 8 + decisions 3 + 원칙 청크 3
  → gpt-oss-120b AnswerDraft(citations → answer) → 인용 문자열 검증 → 0개면 refused
  → answers 갱신 → UI 2초 폴링 / 슬랙 메시지 갱신 · 고정 문구 "내 권한 범위 안의 부서 기록만 참고했습니다"
  → refused면 "카드로 보낼까요?" → 승락 시 make_card
```

### 4.4 회의 한 건의 여정

```text
S5 회의 URL 입력 → Recall.ai 봇 참석(참석 고지) → 웹훅 또는 lead 전사 업로드
  또는 lead가 .vtt/.txt 업로드(10MB 상한, 파싱 실패 시 줄 번호)
  → 발언 1건 = item 1건(동의한 멤버로 매칭된 화자만 저장) → enqueue(summarize_meeting)
summarize_meeting job: gpt-oss-120b → meetings.summary {decisions[], deferred[], actions[]} (item_id 인용)
  → deferred 항목 → enqueue(make_card)  (슬랙 질문과 72h 병합 → 데모 장면 3)
```

### 4.5 게스트 모드

`scripts/seed-demo.ts`가 온새미로 주식회사 영업팀·개발팀의 합성 슬랙·회의·원칙 문서를 **실제 파이프라인**에 넣어 카드·원장·충돌·Q&A 6건(+ `generic_answer`)을 만든 뒤 스냅샷으로 시드한다. `/demo`는 `orgs.is_demo=true` 부서를 anon read-only RLS로 읽고 `revalidate` 캐시로 낸다. LLM 호출·쓰기·우리 팀 실데이터가 0인 것을 §8 E2E가 검증한다.

---

## 5. 상태

객체별 전이표·삭제/보존 정책·중복 저장의 진실 규칙은 PRD §6-12가 원천이다. 구조 관점의 요약:

| 객체 | 상태 | 원칙 |
|---|---|---|
| `decision_requests` | `open → decided/deferred/rejected` · `deferred/rejected → open`(lead 재개) · `needs_review → open/rejected` | 표 밖의 전이는 서버가 거부 |
| `decisions` | 생성만 | 정정은 `supersedes_id` 새 행. 삭제·수정 없음 |
| `meetings` | `scheduled → bot_joined → transcribed → summarized` / `bot_failed`(→ 업로드) / `summary_failed`(재시도) | |
| `jobs` | `queued → running → done` / `running → queued`(재시도) / `→ failed`(3회) | 워커만 바꾼다 |
 | `answers` | `pending → done/refused/failed(error_code)` | 2분 스윕 |
| `document_summaries` | `processing → summarized/summary_failed` | 2분 스윕 |
| 동의 | `null → consented_at` · `consent_version` 불일치면 재동의 · 철회는 `null` + 이후 발언 미저장 | 과거 저장분 유지(동의문 명시) |

---

## 6. 불변식 — 어기면 구조가 무너지는 것

1. 가시성 판정은 `can_see()` 하나. RLS 정책과 `search_as()` 모두 이것을 호출한다. USING + WITH CHECK.
2. 사용자 요청 경로에서 service role 금지. 웹은 세션 클라이언트, 슬랙 경유는 `search_as(user_id)`.
3. `dept_id`·`decided_by`·`asked_by`는 본문이 아니라 세션·멤버십에서.
4. 카드 visibility = 인용 소스 중 가장 좁은 것. `leads_only` 카드는 lead에게만 DM. 병합은 visibility를 좁히지 않는다.
5. 채널 답변은 member 권한, DM·웹은 질문자 권한. "N건 제외"는 어디에도 표시하지 않는다.
6. 결정 공지 스레드는 결과 한 줄 + 원장 링크만.
7. 슬랙 서명 검증, 봇 웹훅 시크릿, 최소 스코프 10개, 전사 업로드는 lead만(10MB).
8. 동의가 수집보다 먼저다. 채널 멤버 전원 동의 후에만 채널 연결. 미동의 멤버의 발언은 저장하지 않는다. 미매핑 슬랙 사용자·미동의 멤버는 질문·DM 대상에서 제외. RLS는 접근 통제이지 수집의 법적 근거가 아니다.
9. 로그에 이벤트 본문·전사·질문 원문 금지. `items.content`는 마스킹 후만 저장(금액·날짜·수량은 마스킹하지 않는다).
10. 게스트 판별은 `orgs.is_demo`. 게스트 라우트는 LLM 호출 0회. `/api/d/[dept]/ask`는 사용자당 하루 50회.
11. 봇 참석 고지·채널 수집 공지·수집 채널 목록 공개. 채널 제거 = `items.content`·`embedding` 삭제 + `deleted_at`(행과 `citations.quote`는 원장 근거로 보존 — 동의문 명시).
12. `jobs`·`ingest_events`·`llm_calls`·`orgs`는 사용자 접근 없음(service role 전용). `citations`·`conflicts`는 소유 객체 join으로 판정.
13. 멱등 장치 4개 — `ingest_events.event_id` · `unique(source_id, external_ref)` · `decisions.request_id unique` · `one_open_request_per_item` — 를 우회하는 insert 경로를 만들지 않는다.
14. 결정은 append-only. `supersedes_id`로만 정정한다.
15. 임베딩 컬럼은 D2 모델 확정 후 마이그레이션으로만 추가한다. 현재 기본 provider는 Voyage `voyage-4-lite` 1024차원이며 `embed_model`이 다른 행은 검색에서 제외한다. OpenAI 경로는 명시적 호환 설정에서만 사용한다.

---

## 7. 만들지 않는 것 (되살리지 말 것)

| 항목 | 대신 | 근거 |
|---|---|---|
| Supabase Edge Function | Next.js 워커 하나 | ADR-009 — 런타임 2개를 1인이 관리하지 않는다 |
| 별도 벡터 DB | pgvector + RLS | ADR-008 — 권한 필터를 두 곳에서 관리하게 된다 |
| 별도 백엔드 서버·외부 큐 서비스 | Route Handler + `jobs` 테이블 | ADR-007·009 |
| 슬랙 OAuth "Add to Slack" 멀티 워크스페이스 | 단일 워크스페이스 수동 설치, 토큰 env | ADR-017 — 파일럿 2팀째는 별도 배포 인스턴스 |
| 슬랙·노션 원본 권한 자동 상속, ACL 테이블 | lead가 소스별 `dept`/`leads_only` 수동 지정 | ADR-014 |
| 인용 정합성 LLM 심판(2차) | 문자열 포함 검증 | ADR-013 |
| `excluded_count` service role 2차 검색 · 감사 로그 화면 | `answers` 기록만 | PRD §8-0 |
| 노션 폴링·웹훅·변경 감지 | 1회 가져오기 + [다시 가져오기] | ADR-004 |
| 보류 재알림·마감 리마인드 cron | "마감 지남" 배지 | PRD §8-0 |
| Presidio 2차 마스킹 · 음성 화자 지문 · 폰 원탭 녹음 | 정규식 마스킹 · 봇 전사 화자 라벨 · Whisper 음성 업무 입력 | PRD §8-1 · ADR-032 |
| 실시간 스트리밍(SSE) | 폴링(대시보드 10초·답변 2초) | PRD §8-1 |
| 사용자별 API 키·과금 | 공동 키 1개 | ADR-020 |
| 부서 간 교차 결정 · 부서 템플릿 2종 이상 · 부서 전환 UI | 부서 1개 슬라이스, `general` 1종 | PRD §8-0·8-1 |

검토하지 않아서 없는 것과 검토한 끝에 뺀 것은 코드에선 똑같이 생겼다. 그래서 여기 적는다. 되살리려면 PRD §8을 먼저 고친다.

---

## 8. 테스트 경계

| 계층 | 무엇을 | 어떻게 | TDD 훅 |
|---|---|---|---|
| `lib/rules.ts` · `lib/mask.ts` · `lib/pipeline/*` · `lib/jobs.ts` · `lib/adapters/*`(파서) · `lib/slack/verify.ts` | 순수 로직. 분류 규칙, 마스킹이 금액을 지우지 않는지, 인용 문자열 검증, 병합 임계, visibility 최솟값, 백오프, .vtt 파서 줄 번호 에러, 서명 검증 | Vitest. `llm.ts`·Supabase는 mock. 파일별 미러 `tests/<path>/<name>.test.ts` | **대상** — 테스트 없이 구현 파일 편집 차단 |
| `supabase/migrations` RLS · `can_see()` · `search_as()` | member 세션으로 `leads_only` select 0건·insert 거부, lead는 보임, anon은 `is_demo`만, 퍼블릭 채널 질문은 member 권한 | `tests/rls/*.test.ts` — 서로 다른 JWT 3개(anon·member·lead)로 같은 쿼리 실행 | 대상 아님 (SQL) — 단 D8 사람이 직접 읽는다 |
| `app/api/**/route.ts` · `lib/supabase/*` · `lib/slack/{blocks,post}.ts` · `lib/llm.ts` | SDK 어댑터·배선·프레젠테이션. 우리 로직이 아니라 SDK를 테스트하는 꼴이 된다 | E2E로 간접 검증 | **비대상** |
| `components/` · `app/**/page.tsx` | 표현 | Playwright | 비대상 |
| E2E `tests/e2e/` | ① 게스트 `/demo` 시크릿 창 완주 + 우리 팀 실데이터 문자열 grep 0건 + LLM 호출 0 ② D3 세로 슬라이스: 슬랙 메시지 → 분류 → 카드 → 웹 결정 → 원장 5분 ③ 같은 질문 lead/member 답 차이 ④ 결정 버튼 연타 → decisions 1건 | Playwright, 배포 URL 대상 | 비대상 |

`tdd-guard.sh`의 허용 목록은 이 표를 그대로 옮긴 것이다. 표를 바꾸면 훅도 바꾼다. **완료는 이 테스트가 실제로 실행된 기록으로 판정한다** (PRD §11). Codex의 "완료했습니다"는 신호가 아니다.

---

## 9. 10배 규모에서 깨지는 곳 (대비하지 않는다)

| 결정 | 지금 (부서 1, 채널 3, 하루 ~200건) | 10배에서 깨지는 곳 |
|---|---|---|
| 슬랙 봇 토큰 1개 env | 충분 | 워크스페이스 2개째부터 OAuth + 토큰 테이블 |
| 워커 단일 레인 매분 | 하루 200 job, 여유 | 부서 10개면 분당 처리량 한계 → 병렬화 또는 큐 서비스 |
| pgvector 순차 스캔(인덱스 없음) | 5만 건 이하 ms 단위 | 50만 건부터 HNSW 인덱스 (인덱스 추가만으로 해결) |
| 노션 원칙 문서 수동 가져오기 | 페이지 몇 개 | 문서 수십 개·잦은 변경이면 폴링 또는 웹훅 |
| RLS 함수 `can_see` 행별 호출 | 무시 가능 | 대량 조회에서 느려지면 visibility를 items에 비정규화 |
| `citations.owner_kind/owner_id` 다형 참조 | FK 무결성 없음을 알고 감수 | 소유 종류가 늘면 테이블 분리 |

---

## 10. 외부 의존성이 죽었을 때

의존성 9개별 거동·사용자 문구·다음 행동은 PRD §6-10 표가 원천이다. 구조 관점의 원칙 하나: **어댑터는 외부 장애와 무관하게 items를 먼저 저장한다.** LLM·임베딩·슬랙 발송·회의 정리는 전부 job이라 나중에 따라잡는다. 사용자에게는 "무엇이 실패했는지 + 다음에 할 수 있는 것"을 보여주고, 내부에는 `error_code`(`llm_timeout|llm_refusal|schema_invalid|citation_invalid|rate_limited`)를 남긴다. "오류가 발생했습니다"만 있는 화면은 만들지 않는다.
