# 아키텍처 — 사수 (SASU)

- 문서 버전: 1.5 (§6-4 불변식 27~29 부서별 회고 커넥터 — ADR-064, 설계 · 1.4: §6-4 개발 회고 설계 불변식 추가 — ADR-063, 미구현 · 1.3: ADR-056 웹 녹음 설계 추가, 운영 상태는 별도)
- 작성일: 2026-09-08 (1.2: ADR-052·054 구현 구조와 운영 검증 상태 반영)
- 지위: **파생 문서**. 구조 결정의 근거는 [PRD §6-11(아키텍처)·§6-12(데이터·상태)·§6-1(스키마)](PRD.md)에 있고, 결정의 이유·트레이드오프는 [ADR.md](ADR.md)에 있다.
- 문서 충돌 시 우선순위: [PRD](PRD.md) → 이 문서 → [ADR](ADR.md). 이 문서와 PRD가 어긋나면 PRD가 옳다.
- 현재 상태: **2026-09-17.** phase 16~19는 운영 반영과 실제 연동 검증 완료, phase 20~22도 운영 DB·앱 반영과 로그인 읽기 회귀를 완료했다. 근거는 `docs/verification/continuity-production-2026-09-16.md`, `docs/verification/reviewed-materials-production-2026-09-17.md`, `docs/verification/review-state-recovery-2026-09-17/`에 있다.

### 2026-09-12 구현 보완

- Slack 수신: 서명·동의·마스킹 후 `ingest_slack_atomic`으로 event/item 또는 answer/job을 원자 저장한다. SQL에서 활성 소스·동의를 잠금 후 재확인한다. 아래 일반 입력 흐름 중 Slack 경로는 이 원자 저장을 사용한다.
- 워커: `lib/worker.ts`가 전체 핸들러 등록 → pending sweep → `runOnce`를 수행한다. HTTP 트리거와 `kickWorker`의 after 콜백 모두 이 진입점을 쓴다. 완료 기록 실패를 handler 실패로 오인하여 재큐잉하지 않는다. 프로세스 중단 시 lease 복구는 아직 별도 작업이다.
- Q&A: 인용 일부 실패도 전체 초안을 1회 재생성하고, 재실패/게이트웨이 거절은 canonical refused로 종료한다. 실제 답변과 인용은 complete_answer에서 원자 저장한다. 단순 문자열 검증은 의미적 뒷받침 평가를 대체하지 않는다.

---

## 1. 한 장으로 보는 구조

### AI 개발 구조

[AI-DEVELOPMENT.md](AI-DEVELOPMENT.md)에 SDD·스킬·하네스·훅·테스트와 Graft·Archify의 역할을 정리했다. Graft의 코드 관계 탐색과 Archify의 구조·실행 흐름 시각화를 개발 절차에 추가했으며, 제품의 안건 분류·검색·답변 런타임은 아래 구조를 따른다.

### 자료 검토·원본 보관·기록 보존 — ADR-054

ADR-058의 원본 접근 강화는 `authorize_review_access` → `private.review_access_tickets` → 사용자 세션 Storage GET의 `consume_review_access`로 연결한다. 권한·사용자별 60건/분 제한·append-only 접근 허가 이벤트·60초 접근권은 한 SQL 트랜잭션이고 파일 전달은 별도 요청이다. Storage는 현재 사용자·경로·행위·기한을 다시 확인해 접근권을 한 트랜잭션에만 소비한다. 서명 URL·목록·복사는 차단하고 기존 INSERT-only 업로드와 내부 워커는 유지한다. 조직 관리자는 본문 없이 접근 메타데이터만 확인한다. `sweep_review_originals`는 보존 기한 경과 원본만 접근 차단·파기 예약하고 교정문·리비전·확정 source/items를 유지한다. 상세는 [접근 구조](verification/browser-meeting-recording/access-design.md). 실제 Storage 호환성과 운영 반영은 별도 검증 게이트다.

`reviewed_materials`·`review_parts`·`review_revisions`는 검색 소스와 분리된 검토 저장소다. 세션 RPC가 부서장·동의·버전을 검증하며 `can_see()`와 RLS가 읽기/원본 접근을 집행한다. 비공개 `review-materials` 버킷에 원본과 60초+1초 겹침 WAV를 저장하고 `process_review` 작업이 기존 `llm.transcribeAudio()` 또는 문서 추출기로 전문을 처리한다. lease/attempt가 취소·늦은 완료를 차단하고 2분 sweep이 실패를 드러낸다.

`publish_review`에서만 source/items와 분류·요약 작업을 원자 생성한다. 초안 편집은 저장 버전 충돌을 감지하고 재추출은 별도 후보로 둔다. 재확정/사용 중지는 이전 source와 파생물을 무효화하며 결정 인용은 유지한다. 삭제·참여자 동의 철회/탈퇴는 초안/이력을 지우고 파일 접근을 차단한 뒤 `purge_review_files`를 예약한다.

`retention_settings`·`retention_exports`는 확인 설정과 내보내기 생성 메타데이터만 보관한다. 내보내기는 현재 권한·동의·삭제 상태를 SQL에서 거른 수집본이다. 별도 원문 영구 아카이브는 없다. 운영자 도구는 암호화 덤프와 파일을 격리 DB에 복원해 검증하며 최신 삭제·부서 멤버십/동의를 재적용하고 모든 작업을 정지한다. 실제 운영 서비스 복구/스토리지 재연결·정기 보관은 [운영 절차](setup-reviewed-materials.md)의 별도 단계다. 범용 부서 에이전트 실행은 [공동 설계](planning/부서_에이전트_공동설계.md)를 유지한다.

### 웹 회의 녹음 — ADR-056 설계 (미구현)

상위 범위는 PRD §3-4·§8, 상세 계약은 [웹 회의 녹음 설계](planning/웹회의_녹음_설계.md)다. `getUserMedia` 마이크와 `getDisplayMedia`의 사용자가 허용한 음성을 Web Audio에서 혼합한다. display video 트랙은 권한/종료 감시에만 쓰고 인코딩·저장·전송 경로에 넣지 않는다. AudioWorklet에서 얻은 PCM을 1초 단위로 로컬 복구 저장하고, 서버에는 녹음 종료 후 최대 60초 독립 WAV 원본을 세션·RLS로 업로드한다. `MediaRecorder` 압축 조각을 각각 재생 가능한 구간으로 가정하지 않는다.

`reviewed_materials`에 원본 형식(`single_file` / `audio_segments`)과 입력 경로를 추가하고 `review_original_segments`로 서버가 발급한 경로·순번·길이·해시·검증 상태를 관리한다. 기존 50MiB 단일 파일과 새 64MiB 원본 묶음을 구분한다. finalize는 파일 검증 작업을 예약하며, 워커 검증 완료 전에 전사/확정을 허용하지 않는다. 검증된 원본에서 워커가 기존 60초+1초 `review_parts`를 생성하여 `process_review`와 `publish_review`를 재사용한다. 현재 파일 업로드는 클라이언트가 구간을 잘라 올리지만, 이 형식에서는 `review_storage_allowed`가 클라이언트의 `parts/` 쓰기를 거부한다. 생성은 `create_review`가 아니라 64MiB·30구간 한도를 가진 별도 RPC가 담당한다. 브라우저 전용 AudioWorklet·IndexedDB 어댑터는 `lib/recording/browser/*`로 분리해 §8의 SDK 어댑터 행에 넣고, 순수 리샘플·체크포인트·manifest 로직은 `lib/recording/*`에서 TDD로 만든다. 기존 단일 원본 재생·재추출·삭제 경로도 분기 처리해야 한다.

ADR-057 강화(설계 §11~§13): 전사는 `verbose_json` segment의 시각·신뢰도를 `sections[]`에 저장하고 `dept_glossaries`를 Whisper `prompt`와 요약 표기 기준에 쓴다. 요약은 chunk 추출 뒤 인용 보존 병합 1회를 더한다(문서 공용 경로). 보안은 `next.config.ts`·`proxy.ts`의 응답 헤더·CSP nonce, 서버가 HKDF로 파생해 세션에만 주는 로컬 체크포인트 AES-GCM 키(서버 무저장), `review_access_events` append-only 접근 기록과 발급 제한을 같은 세션 RPC 트랜잭션에 두는 구조, `org_settings`의 조직별 스위치, `retention_settings.review_original_days` 보존 sweep이다. 권한·기록·제한을 앱이 아니라 SQL에서 집행하는 원칙은 그대로다. 제3자 처리(Voyage 옵트아웃·Groq DPA) 확인은 코드가 아니라 운영 기록이며 녹음 구현보다 먼저다.

Meet·Zoom 계정/OAuth·공식 artifact 수집은 2단계이며 별도 어댑터로 같은 검토 저장소에 연결한다. 현재 운영 코드에 이 구조가 이미 존재하는 것으로 해석하지 않는다. Graft·Archify 결과는 아직 없으며 설계 문서의 Mermaid와 코드 관계 표가 수동 검토 자료다.

### 후속 개발 구현 — ADR-052

- 수집된 원문은 버전을 가진다. 변경·삭제와 파생 분류 무효화·재처리 예약은 SQL 트랜잭션이다. 분류/임베딩 완료는 읽은 버전과 현재 버전이 같을 때만 저장한다. Slack 삭제는 내용 없는 tombstone으로 역순 이벤트·백필의 복원을 막는다.
- Notion 전체 페이지 읽기 성공 후에만 블록 스냅샷을 원자 반영한다. 자동 갱신은 기존 워커의 주기 호출에서 예약하며 실패 시 기존 내용을 보존한다.
- 결정 정정은 원래 결정을 수정하지 않고 최신 결정에 `supersedes_id`를 연결한다. 리마인드는 DB 예약·멱등 키·현재 담당자/동의 재검증을 거친다.
- 질문 이력/대화 부모는 서버 세션과 SQL이 본인·같은 부서를 검증한다. 검색 권한은 현재 `can_see()`로 다시 판정한다.
- Slack 설치는 조직별 서버 암호문으로 보관한다. 이벤트의 workspace와 설치를 함께 확인하고 토큰을 요청 전역 변수로 바꾸지 않는다. OAuth state는 세션/조직에 묶인 단회용 값이다.

```text
 외부 이벤트                      Next.js Route Handlers (3초 안에 끝내는 것만)
 ┌─────────────────┐            ┌───────────────────────────────────────────┐
 │ Slack Events /  │──────────▶ │ 어댑터: 서명 검증 → 동의 확인 → 마스킹    │
 │ Interactions    │            │         → items upsert → jobs enqueue     │
 │ 전사 업로드      │──────────▶ │         → after(runOnce) → 200            │
 │ 자료 검토 업로드 │──────────▶ ├───────────────────────────────────────────┤
 │ Notion 가져오기/ │──────────▶ │ UI API: 대시보드·카드·원장·묻기·검토함     │
 │ 자동 갱신        │            │         (세션 클라이언트 = RLS)            │
 └─────────────────┘            │         비공개 원본은 Storage 경유          │
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
 │ summarize_document · answer · notion_import/sync · slack_backfill · reminder │
 │ process_review · purge_review_files · create_retention_export · sweep       │
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

job 종류 11개: `classify` · `embed` · `embed_decision` · `summarize_meeting` · `summarize_document` · `make_card` · `answer` · `send_slack` · `notion_import` · `slack_backfill` · `sweep`. 새 종류를 추가하면 이 목록과 PRD §6-1의 주석을 함께 고친다.

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
현재: lead가 .vtt/.txt 업로드(10MB 상한, 파싱 실패 시 줄 번호)
  → 발언 1건 = item 1건(동의한 멤버로 매칭된 화자만 저장) → enqueue(summarize_meeting)
summarize_meeting job: gpt-oss-120b → meetings.summary {decisions[], deferred[], actions[]} (item_id 인용)
  → deferred 항목 → enqueue(make_card)  (슬랙 질문과 72h 병합 → 데모 장면 3)
```

ADR-036 이후 회의 봇은 현재 입력 경로가 아니다. ADR-054의 음성 파일은 별도 자료 검토·확정 경로이며, ADR-056은 그 앞에 웹 직접 녹음을 추가하는 설계다. 확정 음성은 우선 기존 문서 요약/분류 파이프라인을 재사용하며 회의 전사 업로드의 `summarize_meeting`과 자동으로 같은 경로라고 간주하지 않는다.

### 4.5 게스트 모드

**ADR-061 공개 기능 체험:** `/demo/d/[dept]` layout은 공개 `demo_departments` RPC로 `is_demo` 부서를 확인하며 심사 계정 세션을 요구하지 않는다. 모든 메뉴가 공개 페이지로 연결된다. 문서/원장은 `lib/supabase/demo-workspace.ts`의 anon RLS 조회와 명시적 영업 합성 fixture를 합친다. `DemoWorkspaceState`는 부서별 React 메모리에 결정 체험을 보관한다. `DemoDocumentWorkspace`는 source_id별로 원문·결정을 묶고 보류 후속 결정을 supersedes_id로 추가한다. 새로고침·부서 변경으로 초기화하며 DB 쓰기·LLM 호출·브라우저 영속 저장은 없다. 묻기는 준비 답변 근사 매칭과 샘플 음성 전사를 제공하고, 기능 지도는 `/demo/features?dept=...`에서 현재 부서를 유지한다.

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
| `agent_role_results` (ADR-038) | `processing → completed/failed(status_reason)` · lead 재실행은 같은 (role, source) 행을 `processing`으로 되돌림 | 2분 스윕. 역할 `archived_at` 이후 새 실행 거부 |
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

### 6-1. 채용 예고편 첫 슬라이스 (ADR-040)

- `app/trailers/page.tsx`는 서버 환경 변수로 활성 여부를 판정하는 동적 페이지다. 기본 404, noindex. 게스트 부서 판별과 다른 기능 활성화 경계이며 Supabase에 접근하지 않는다.
- 서버에서 검증한 합성 콘텐츠만 `components/recruitment-trailer.tsx`에 직렬화한다. 계약은 `lib/contracts.ts`, 사실집 인용·선택 근거 검증은 `lib/trailer.ts`, 입력은 `fixtures/trailer/scenarios.ts`다.
- NPC·기록실의 모든 근거는 사실집 ID 존재와 quote 문자열 포함을 검증한다. 잘못된 콘텐츠는 fail-closed로 거부하고 문장을 렌더하지 않는다. 원시 발언·원장 데이터·실제 부서 ID를 합성 fixture에 넣지 않는다.
- 진행·결정·이유·단서는 React 상태로만 유지한다. API·Server Action·스토리지·쿠키·LLM·행동 로그를 추가하지 않는다. 새로고침과 재시작은 기록을 지운다.
- 맵과 목록은 동일한 상태·콘텐츠·제출 검증을 공유한다. 이동 시간과 경로는 수집/채점하지 않는다. 기록실의 사례 선택과 다르더라도 실패로 처리하지 않는다.
- ADR-041: `lib/trailer-world.ts`는 좌표·충돌·경로·근접 규칙을 담당한다. `components/trailer-office.tsx`의 Canvas RAF 루프는 React 폼 상태와 분리하고 cleanup에서 프레임·이벤트를 해제한다. 창 포커스 상실·모달/목록 전환 시 키 상태와 이동을 정지한다. 배경 이미지와 충돌 좌표를 같은 1536×1024 월드 기준으로 관리한다.
- 후속 실데이터 발행에는 기존 `can_see()`·RLS, 최신 `dept` 원장만의 입력, 원문 겹침/고유명사/마스킹 검사, lead 승인 및 공개 payload 분리가 필수다. 이 첫 슬라이스는 그 게이트를 대신하지 않는다.

### 6-2. 제출 범위 확대의 불변식 (ADR-042~046, PRD §3-2)

위 1~15에 더한다. 상세 계약은 [planning/메인웹사이트_관리자콘솔_설계.md](planning/메인웹사이트_관리자콘솔_설계.md) §B·§C.

16. **authenticated·anon의 직접 쓰기는 의도한 테이블에만 열린다.** `departments`는 SELECT 전용이다. `items`에 authenticated INSERT는 없고, 수집 어댑터(문서·전사 업로드 포함)가 세션으로 권한을 검증하고 TS에서 마스킹한 뒤 service role로 insert한다. 보안 하니스는 Supabase 기본 GRANT를 재현한 상태에서 전 테이블의 쓰기 경계를 검사한다.
17. **조직 관리 판정은 `is_org_admin()` 하나.** 관리 RPC는 조직 id를 요청 본문·URL이 아니라 `auth.uid()`에서 SQL로 정하고, 대상 행의 조직 일치를 SQL에서 확인한다. 관리 RPC는 메타데이터만 반환한다(질문 원문·질문자·본문·카드·원장 내용 없음, 답변은 일별·부서별 집계만). **조직 관리자 권한은 `can_see()`에 아무것도 더하지 않는다.**
18. **권한을 올리는 작업은 이미 그 부서 내용을 볼 수 있는 부서장만 한다.** 조직 관리자는 멤버 0명인 부서의 첫 부서장 초대(자기 이메일 금지)와 권한 축소만 한다. 초대는 토큰 해시·7일·1회용·`auth.jwt()` 이메일 일치.
19. **신규 SQL 함수는 전부 `revoke all … from public, anon, authenticated, service_role` 후 최소 grant.** 여러 게이트가 공유하는 내부 함수는 `private` 스키마에 둔다. SECURITY DEFINER 함수는 `set search_path = public, pg_temp`.
20. **예고편은 세 조건이 SQL에서 모두 참일 때만 발행된다**: 현재 시나리오 해시 = `gate_passed_hash`(service_role 워커가 검사 통과 시에만 기록) = `approval_hash`(항목별 공개 승인) · `orgs.trailer_publish_enabled`. 공개 조회는 `{scenarios, apply_url}`만 반환하고 부서·조직·원장 id를 내보내지 않는다. 예외는 지원자별 링크 열람(`trailer_invite_open`) 하나뿐으로, 동의의 유효 요건인 **수집 주체 표시 이름** 1개를 더 반환한다(ADR-062). 생성 입력에 원시 발언·카드 배경·인용 quote를 넣지 않는다.
21. **실제 지원자 링크 발급·열람·제출·채점은 모두 `orgs.trailer_assessment_enabled`가 true일 때만 가능하고, 그 값은 운영 스크립트만 바꾼다**(불변식 12의 `orgs` 사용자 접근 없음). 데모 조직(`orgs.is_demo`)에는 발급·`kind='candidate'` 생성을 SQL이 거부한다 — 데모 읽기 정책이 anon에 attempt를 공개하기 때문이다. 지원자 이메일은 `trailer_invites`에만 두고 attempt에는 비식별 라벨만 둔다. 토큰은 해시로만 저장하고, 열람·제출 검증(토큰+이메일+동의)은 TS가 아니라 SQL 안에서 하며 요청 경로는 anon RPC만 부른다. 점수의 모든 근거는 지원자 본인의 이유 문자열·이벤트·선택 사실 id로 검증하고 총점은 코드가 계산한다. 합불·추천·순위 필드는 없고 실제 지원자 점수표에 점수순 정렬을 두지 않는다. 지원자 본인 철회·부서장 삭제·`purge_after` 자동 파기는 같은 파기 함수를 쓴다.
22. **각 phase의 마이그레이션은 그 phase의 보안 하니스·DB 무관 E2E·리뷰가 통과한 뒤에만 운영 DB에 적용한다. DB가 필요한 E2E는 적용 직후 기능 플래그를 끈 상태에서 QA 조직으로 돌리고, 통과한 뒤에만 플래그를 켠다(ADR-047).** 컷된 기능은 플래그 뒤에 숨기는 것으로 끝나지 않는다. 적용 전이면 적용하지 않고, 적용 후면 롤백 SQL로 테이블·RPC를 제거한다.

**상태 추가** — `member_invites`: 대기 → 수락/철회(만료는 `expires_at` 파생, 수락·철회 시 토큰 해시 무효화) · `trailers`: `generating → checking → review ⇄ checking → published → unpublished → (수정) checking`, `generating/checking → failed`, 10분 스윕 `failed(timeout)` · `trailer_attempts`: `scoring → scored/failed`.

### 6-3. 부서별 신입 미션 데모 (ADR-059)

- `/demo/hiring`은 `fixtures/hiring/missions.ts`의 고정 합성 자료만 전달한다. 로그인·DB·LLM·제출 API가 없다. 계약은 `lib/contracts.ts`, 제출/파일 순수 검증은 `lib/hiring-demo.ts`다.
- `components/hiring-demo.tsx`는 부서 ID별 React 상태에 직접 작성한 단계·판단·첨부 File·제출 스냅샷을 분리한다. File은 메모리 참조만 유지하고 읽기/분석/실행/전송하지 않는다. 결과 문서/코드는 텍스트로만 렌더한다.
- 단계 기록·샘플 적용·제출 이벤트는 참가자가 누른 동작만 표시한다. 입력 감시·시간 평가·자동 채점·합불·순위는 없다. 초기화는 선택 부서만, 새로고침은 모든 진행을 지운다. 서버/브라우저 영속 저장을 추가하지 않는다.
- 데모 시드는 기존 4개 부서를 보존하고 인사·프론트·백엔드를 추가한다. `orgs.is_demo` 판정과 기존 RLS·읽기 전용 체험 경계를 그대로 따른다. 런타임 요청에서 시드 실행이나 service role 호출은 없다.

### 6-4. 개발 회고 (ADR-063, PRD §3-6) — 설계, 미구현

23. **회고 활동은 본인 것만, 짧게, 마스킹 후.** `retro_activities`의 `user_id`는 항상 `auth.uid()`이고 번들의 어떤 필드도 사람·부서를 지정하지 못한다. 수집기와 서버 RPC가 각각 마스킹하며 마스킹 전 텍스트·번들 파일은 저장하지 않는다. Claude/Codex 응답·도구 결과·붙여넣은 본문·diff 본문·URL 쿼리스트링은 파서가 읽지 않는다. 활동 1건 500자·하루 500건·번들 1MB.
24. **`self`는 가시성 등급이 아니라 소유 판정이다.** `retro_days` RLS는 `user_id = auth.uid() or (visibility <> 'self' and can_see(auth.uid(), dept_id, visibility))`. `can_see()`는 바뀌지 않고 다른 테이블은 `self`를 쓰지 않는다. `dept`/`leads_only`로 넓히기는 인용된 Tier 0 활동의 `source_visibility`보다 넓을 수 없다(불변식 4). 개인 범위가 두 번째로 생기면 ACL 테이블로 승격한다(PRD §6-12).
25. **회고 인용은 활동 원문 포함 검증을 3중으로 통과한다** — `verifyRetroDraft`(job) · `save_retro`/`confirm_retro`(SQL) · UI 렌더 필터. 인용 0개 항목은 어디에서도 남지 않고, 항목 0개면 `needs_review`.
26. **회고는 결정 원장이 아니다.** revision은 append-only이지만 본인은 하루치 전체를 삭제할 수 있다. 공개 링크(3단계)는 조직 관리자 승인·`dept` 회고·브라우저 활동 미포함이 SQL에서 모두 참일 때만 slug가 생기고, 내리면 `slug = null`. 개인 토큰(2단계)은 sha256 해시만 저장하고 스코프 `retro:upload` 하나, 90일 만료, 본인 폐기이며 토큰 업로드 경로는 수집 어댑터로 분류해 `auth.role() = 'service_role'` 가드가 있는 `*_as` RPC만 부른다.
27. **회고의 외부 연결은 개인 OAuth·개인 키만이다(ADR-064).** `retro_connections`는 본인 행에만 있고 `encrypted_secret`은 어떤 select·RPC 반환에도 실리지 않는다. 조직 토큰으로 구성원 활동을 읽거나 관리자 감사 API(Figma Activity Logs·Google Admin SDK Reports·Zendesk 관리자 export)를 쓰지 않는다. 부서장은 누가 무엇을 연결했는지 보지 못한다. 연결 해제는 토큰과 그 제공자 접두사의 활동을 같은 트랜잭션에서 지운다. restricted scope(Gmail·Drive 전체) 데이터를 서버에 저장하는 커넥터는 만들지 않는다.
28. **상대방(고객·지원자·참석자)의 개인 식별 정보는 파싱하지 않는다.** 커넥터 변환은 이름·전화번호·이메일 필드를 읽지 않고(테스트로 증명) 회사명·건수·결과·`상대 N`만 남긴다. VoIP 통화 메타데이터(`call_*`)는 법률 자문 통과 전에는 켜지 않는다. 수집 동의(연결 시)와 공개 동의(첫 `dept`/`leads_only` 전환 시, `retro_user_settings.share_consented_at`)는 분리해 기록하며 공개 동의 없이는 `set_retro_visibility`가 넓히지 않는다.
29. **집계 지표는 활동이 아니라 스냅샷이고, 작성자 없는 부서 문맥 활동은 "내가 했다"의 인용이 될 수 없다.** `metric_snapshot`은 "확인했다·비교했다" 서술만, `dept_context` 활동을 인용한 항목과 마스킹 토큰이 문장에 옮겨진 항목은 `verifyRetroDraft`가 버린다. 부서 프리셋은 라벨·힌트·추천 커넥터만 바꾸고 섹션 키·스키마·검증·화면은 하나다.

## 7. 만들지 않는 것 (되살리지 말 것)

| 항목 | 대신 | 근거 |
|---|---|---|
| Supabase Edge Function | Next.js 워커 하나 | ADR-009 — 런타임 2개를 1인이 관리하지 않는다 |
| 별도 벡터 DB | pgvector + RLS | ADR-008 — 권한 필터를 두 곳에서 관리하게 된다 |
| 별도 백엔드 서버·외부 큐 서비스 | Route Handler + `jobs` 테이블 | ADR-007·009 |
| 슬랙·노션 원본 권한 자동 상속, ACL 테이블 | lead가 소스별 `dept`/`leads_only` 수동 지정 | ADR-014 |
| 인용 정합성 LLM 심판(2차) | 문자열 포함 검증 | ADR-013 |
| `excluded_count` service role 2차 검색 · 감사 로그 화면 | `answers` 기록만 | PRD §8-0 |
| Presidio 2차 마스킹 · 음성 화자 지문 · 모바일 백그라운드 녹음 | 정규식 마스킹 · 전사 파일 화자 라벨 · Whisper 입력. 웹 직접 회의 녹음은 ADR-056 설계 | PRD §3-4·§8-1 · ADR-032·056 |
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
| `app/api/**/route.ts` · `lib/supabase/*` · `lib/slack/{blocks,post}.ts` · `lib/llm.ts` · `lib/recording/browser/*`(ADR-056, AudioWorklet·IndexedDB·MediaStream 어댑터) | SDK 어댑터·배선·프레젠테이션. 순수 녹음 로직은 `lib/recording/*.ts`에서 TDD | E2E로 간접 검증 | **비대상** |
| `components/` · `app/**`의 TSX(page·layout·보조 클라이언트 컴포넌트) · Next.js 프록시·메타데이터 파일(`proxy.ts`·`app/robots.ts`·`app/sitemap.ts`·아이콘·OG 이미지) | 표현 | Playwright | 비대상 |
| E2E `tests/e2e/` | ① 게스트 `/demo` 시크릿 창 완주 + 우리 팀 실데이터 문자열 grep 0건 + LLM 호출 0 ② D3 세로 슬라이스: 슬랙 메시지 → 분류 → 카드 → 웹 결정 → 원장 5분 ③ 같은 질문 lead/member 답 차이 ④ 결정 버튼 연타 → decisions 1건 | Playwright, 배포 URL 대상 | 비대상 |

`tdd-guard.sh`의 허용 목록은 이 표를 그대로 옮긴 것이다. 표를 바꾸면 훅도 바꾼다. **완료는 이 테스트가 실제로 실행된 기록으로 판정한다** (PRD §11). Codex의 "완료했습니다"는 신호가 아니다.

---

## 9. 10배 규모에서 깨지는 곳 (대비하지 않는다)

| 결정 | 지금 (부서 1, 채널 3, 하루 ~200건) | 10배에서 깨지는 곳 |
|---|---|---|
| 조직당 Slack 설치·암호화 토큰 1개 | 파일럿 조직별 workspace 격리 | Enterprise Grid 조직 전체 설치·자동 rotation은 별도 설계 |
| 워커 단일 레인 매분 | 하루 200 job, 여유 | 부서 10개면 분당 처리량 한계 → 병렬화 또는 큐 서비스 |
| pgvector 순차 스캔(인덱스 없음) | 5만 건 이하 ms 단위 | 50만 건부터 HNSW 인덱스 (인덱스 추가만으로 해결) |
| 노션 지정 페이지 5분 자동 갱신 | 페이지 몇 개 | 문서 수십 개·짧은 갱신 주기면 webhook·증분 cursor 검토 |
| RLS 함수 `can_see` 행별 호출 | 무시 가능 | 대량 조회에서 느려지면 visibility를 items에 비정규화 |
| `citations.owner_kind/owner_id` 다형 참조 | FK 무결성 없음을 알고 감수 | 소유 종류가 늘면 테이블 분리 |

---

## 10. 외부 의존성이 죽었을 때

### Slack ASK 전달 (ADR-051)
- `slack_answer_deliveries`는 worker 전용(RLS on, API 역할 직접 권한 0)이다. 질문·인용을 복사하지 않고 answer ID·목적지·scope·message timestamp·lease·전송 상태만 보관한다.
- `ingest_slack_question`은 멤버십·동의·채널을 재검증하여 answer·delivery·progress job·answer job을 원자 생성한다. 답변의 종료 상태 트리거가 최종 delivery job을 예약한다.
- `claim_slack_answer_delivery`는 `can_see()`와 인용 전체를 현재 상태로 검증한 결과만 반환한다. `chat.update` 실패는 전달만 재시도한다. 세션 RPC `my_slack_questions`·`retry_my_slack_answer`는 질문자 본인에게만 열려 있다.
- `answers_current_evidence` SELECT 정책은 현재 인용 전체가 유효하지 않은 done 답변을 직접 REST에서도 숨긴다. 권한 로직을 앱에 복제하지 않는다.

의존성 9개별 거동·사용자 문구·다음 행동은 PRD §6-10 표가 원천이다. 구조 관점의 원칙 하나: **어댑터는 외부 장애와 무관하게 items를 먼저 저장한다.** LLM·임베딩·슬랙 발송·회의 정리는 전부 job이라 나중에 따라잡는다. 사용자에게는 "무엇이 실패했는지 + 다음에 할 수 있는 것"을 보여주고, 내부에는 `error_code`(`llm_timeout|llm_refusal|schema_invalid|citation_invalid|rate_limited`)를 남긴다. "오류가 발생했습니다"만 있는 화면은 만들지 않는다.

### 회고 구현 흐름과 권한 재검사 (2026-09-19)

`retro-collect.ts` → 마스킹한 번들 → 세션 `POST /api/d/[dept]/retros` → `create_retro_day` → job → `retro-draft.ts` → `llm.structured` → 인용 검증 → fenced finish → 본인 편집/확정 → RLS로 읽는 타임라인·Markdown이다. Claude의 중첩 pastedContents는 파싱하지 않으며 Chrome은 복사본만 읽는다. 브라우저에서 service role을 사용하지 않는다.

공유는 `self` 소유 판정 또는 기존 `can_see()`를 사용한다. `retro_activity_live`와 `retro_revision_live`는 원본 삭제·동의·멤버십·자료 검토 권한·인용 유효성을 재검사하고 RLS와 export에 공통 적용한다. 자료 검토함 파생 활동은 review_editor 권한을 유지하며 부서 전체로 넓히지 않는다. day에는 주제를 복제하지 않는다. 초안은 owner만, 다른 사람은 마지막 확정 revision에 인용된 활동만 읽는다. 생성 claim/renew/finish는 generation·lease·만료·동의를 검사하며 2분 sweep은 같은 행 잠금으로 실행된다.

지원자 익명 경로는 0048의 잠금 누적·보관 중 철회 계약을 사용한다. 채용 UI는 자기 부서의 세션/RLS 조회, 제출과 동의는 익명 최소 RPC, 채점·기한 정리는 워커 내부 service role이다. 기능이 꺼진 조직도 이미 수집한 개인정보의 파기 대상에서 제외하지 않는다.
