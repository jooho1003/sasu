# 사수(SASU) MVP 구현 명세 v1.0

> AI 팀원을 채용하고, 일 시키고, 과정 기반 인사평가와 코칭으로 성장시키는 플랫폼.
> 원티드 AI Championship 2026 제출용 MVP. **과제 제출 마감: 2026-09-20(일) 23:59.**
>
> 이 문서는 Claude Code에 그대로 먹여서 구현을 시작할 수 있는 수준을 목표로 한다.
> 포지셔닝·심사 전략은 별도 제출 킷 문서 참조.

---

## 0. 목표와 Definition of Done

MVP의 유일한 목표는 아래 **데모 시나리오 5단계가 배포된 URL에서 끊김 없이 도는 것**이다.

1. **JD 입력** — "경쟁사 동향을 주 2회 브리핑하는 마케팅 리서처" 한 줄 입력 → 에이전트 스펙 생성
2. **수습 과제 수행** — 에이전트가 실제 태스크 3건 수행, 전 과정 트레이스 기록
3. **인사평가 리포트** — 7개 차원 루브릭 채점 + 트레이스 근거 인용, 등급 산출 (예: B)
4. **코칭 적용** — 최저점 차원의 코칭 카드 생성 → 시스템 프롬프트 패치 자동 적용
5. **재평가 Δ** — 동일 태스크 재수행·재평가 → 점수 상승을 Δ 그래프로 표시 (데모 클라이맥스)

**Definition of Done 체크리스트**

- [ ] 위 5단계가 로그인한 사용자 기준 15분 안에 완주 가능
- [ ] 게스트 모드: 로그인 없이 샘플 JD 3종의 완성된 리포트를 30초 내 열람 가능
- [ ] 심사 기간(9/21~10/5) 내내 배포 링크 정상 접속 (원티드 FAQ 요건 — 접속 불가 시 심사 제외)
- [ ] 인간 채점 20건과 심판 점수의 일치도(가중 κ) 측정 완료, 수치를 앱 푸터/리포트에 표기
- [ ] 제출서에 사용 AI 도구·활용 방식 기재 (필수 항목)

## 1. 범위

### In (이번 3주)

- JD → 에이전트 스펙 변환 (역할, 시스템 프롬프트, 도구, 완료 조건)
- 에이전트 실행: 태스크당 tool-use 루프, 스텝 단위 스팬 기록
- 도구는 **웹 검색 1개**로 시작 (서버 도구라 클라이언트 실행 코드 불필요)
- 평가 파이프라인: 3심판(Haiku 4.5) + 재심(Opus 5), 7차원 루브릭, 근거 인용 강제
- 코칭 카드 생성 → 프롬프트 패치 → 재평가 → Δ 표시
- 리포트 UI (인사평가서 형태) + Δ 차트
- 게스트 모드 (사전 실행 스냅샷 정적 제공)
- 이메일 매직링크 로그인 (Supabase Auth)

### Out (제출 후로 미룸)

- 노션/슬랙/구글드라이브 연동 (데모 서사에서는 "로드맵"으로만 언급)
- 팀·멀티유저, 권한 관리
- 결제
- 에이전트 스케줄링(주 2회 자동 실행) — 데모에서는 수동 트리거
- Upstage Solar 교차 심판 — **시간이 남으면 J3만 교체** (파트너 어필용, 컷 1순위의 역순)
- 커스텀 도구(문서 작성 등) 추가

### 컷 라인 (일정이 밀리면 이 순서로 버린다)

1. Upstage 교차 심판 → Haiku 3심판으로 통일
2. 재심(Opus 5) → 3심판 중앙값 사용
3. 로그인 → 게스트 모드만으로 제출 (데모 시나리오는 시연 영상으로 커버)
4. **절대 안 버리는 것**: 실행→평가→코칭→Δ 루프, 게스트 모드, 근거 인용

## 2. 화면 (5개)

| # | 화면 | 핵심 요소 |
|---|---|---|
| S1 | 채용 (JD 입력) | JD 텍스트박스, 샘플 JD 3종 버튼, 생성된 에이전트 스펙 카드(역할·도구·평가 기준 미리보기, 수정 가능) |
| S2 | 팀원 카드 | 에이전트 프로필(이름·직무·입사일·현재 등급), 태스크 목록, "과업 배정" 버튼 |
| S3 | 과업 실행 뷰 | 실시간 스팬 타임라인(계획→검색→작성→검증), 산출물 미리보기 |
| S4 | 인사평가 리포트 | 7차원 레이더/바, 차원별 점수+근거 인용(스팬 링크), 종합 등급 도장(S/A/B/C), 코칭 카드 |
| S5 | 성장 (Δ) | 평가 회차별 점수 추이, 코칭 전후 비교, "코칭 적용 후 재평가" 버튼 |

게스트 모드 = S2→S4→S5를 스냅샷 데이터로 읽기 전용 렌더. 라우트: `/demo/[preset]` (preset: `researcher` / `cs-bot` / `weekly-report`).

## 3. 데이터 모델 (Supabase Postgres)

```sql
-- 에이전트 (AI 팀원)
create table agents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users,          -- 게스트 프리셋은 null
  name text not null,                            -- "리서처 김린이"
  jd_raw text not null,                          -- 사용자가 입력한 JD 원문
  spec jsonb not null,                           -- {role, system_prompt, tools[], done_criteria[]}
  system_prompt_version int not null default 1,  -- 코칭 패치마다 +1
  grade text,                                    -- 최신 등급 S/A/B/C
  created_at timestamptz default now()
);

-- 태스크 (배정된 과업)
create table tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid references agents not null,
  title text not null,
  instruction text not null,
  status text not null default 'pending',        -- pending|running|done|failed
  created_at timestamptz default now()
);

-- 실행 (태스크 1회 수행; 재평가 시 같은 task에 run이 2개)
create table runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid references tasks not null,
  system_prompt_version int not null,            -- 이 run이 쓴 프롬프트 버전
  output text,                                   -- 최종 산출물
  usage jsonb,                                   -- {input_tokens, output_tokens, duration_ms}
  status text not null default 'running',
  created_at timestamptz default now()
);

-- 스팬 (실행의 각 스텝 = 평가 근거의 단위)
create table spans (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs not null,
  seq int not null,                              -- 순서
  kind text not null,                            -- plan|tool_call|tool_result|draft|verify|final
  content jsonb not null,                        -- kind별 페이로드
  created_at timestamptz default now()
);

-- 평가 (run 1건당 1건)
create table evaluations (
  id uuid primary key default gen_random_uuid(),
  run_id uuid references runs not null unique,
  dimension_scores jsonb not null,               -- {task_understanding: {score, evidence[], reasoning}, ...} × 7
  judge_details jsonb not null,                  -- 심판별 원점수 + 재심 여부
  weighted_score numeric not null,               -- 1.00~5.00
  grade text not null,                           -- S|A|B|C
  created_at timestamptz default now()
);

-- 코칭 카드
create table coaching_cards (
  id uuid primary key default gen_random_uuid(),
  evaluation_id uuid references evaluations not null,
  target_dimension text not null,                -- 최저점 차원
  diagnosis text not null,
  patch text not null,                           -- 시스템 프롬프트에 append할 지시문
  applied boolean default false,
  created_at timestamptz default now()
);
```

RLS: `owner_id = auth.uid()` 기본. 게스트 프리셋 행(owner_id null)은 read-only 공개 정책.

## 4. 에이전트 실행 파이프라인

TypeScript, `@anthropic-ai/sdk`. 실행은 Next.js Route Handler(또는 Supabase Edge Function)에서 비동기로.

### 4-1. JD → 스펙 변환

- 모델: `claude-opus-5`, adaptive thinking (`thinking: {type: "adaptive"}` — Opus 5는 생략해도 adaptive가 기본), structured output으로 스펙 JSON 강제: `output_config: {format: {...JSON schema...}}` 또는 SDK의 `parse()` 헬퍼.
- 스키마: `{name, role, system_prompt, tools: string[], done_criteria: string[], sample_tasks: [{title, instruction}] (3건)}`
- **주의**: Opus 5는 `budget_tokens` 불가(400), assistant prefill 불가. 형식 제어는 structured output으로만.

### 4-2. 태스크 실행 루프

- 모델: `claude-opus-5` + 서버 도구 웹 검색 `{"type": "web_search_20260209", "name": "web_search", "max_uses": 5}` — 서버사이드 실행이라 클라이언트 도구 코드가 필요 없음. 커스텀 도구를 추가하게 되면 `client.beta.messages.toolRunner` + `betaZodTool` 사용.
- 시스템 프롬프트 = `agents.spec.system_prompt` (+ 적용된 코칭 패치). 프롬프트에 다음 구조를 강제: ① 먼저 계획을 세우고 ② 작업하고 ③ 제출 전 자기 검증을 수행하라 — 스팬 추출이 가능하도록 각 단계를 명시적으로 출력.
- 스트리밍 사용 (`client.messages.stream`), `max_tokens: 16000` 이상.
- `stop_reason: "refusal"` 처리: Opus 5는 안전 분류기가 거절할 수 있음 → `betas: ["server-side-fallback-2026-07-01"]` + `fallbacks: "default"` 켜두기.
- **스팬 기록**: 응답 컨텐츠 블록을 순회하며 저장 —
  - `web_search_tool_result` → kind `tool_call`/`tool_result` (검색 에러는 content가 배열이 아닌 객체 — 분기 필수)
  - 텍스트 중 계획/검증 섹션 → kind `plan`/`verify` (프롬프트로 섹션 헤더를 강제해 파싱)
  - 최종 산출물 → kind `final` + `runs.output`
- usage(`response.usage`)를 `runs.usage`에 저장 — S3 화면과 비용·효율 차원(⑦)의 원재료.

### 4-3. 비용 추정 (데모 기간)

- 태스크 1건: Opus 5 ($5/$25 per MTok) 기준 입력 ~10K·출력 ~4K → **약 $0.15/건**
- 평가 1건: Haiku 4.5 ($1/$5) ×3심판, 트레이스 ~8K 입력·~1.5K 출력 → **약 $0.05/건**, 재심 발생 시 +$0.10
- 데모데이+심사 기간 전체 여유 있게 **$50 이내**. 게스트 모드는 스냅샷이라 $0.

## 5. 평가 파이프라인 (제품의 심장)

### 5-1. 루브릭 (7차원, 가중치)

| 키 | 차원 | 가중치 |
|---|---|---|
| `task_understanding` | 과업 이해 | 15% |
| `planning` | 계획·분해 | 15% |
| `tool_use` | 도구 활용 | 15% |
| `iteration` | 반복 개선 | 15% |
| `self_verification` | 자기 검증 | 15% |
| `output_quality` | 산출물 품질 | 20% |
| `efficiency` | 비용·효율 | 5% |

각 차원은 1~5점 행동 앵커로 채점 (앵커 전문은 `rubric.ts`에 상수로 정의 — 제출 킷 문서의 표를 코드로 옮긴다).

### 5-2. 심판 구성

- **J1 정확성 / J2 프로세스 / J3 수용자** — 3심판 모두 `claude-haiku-4-5`, 렌즈만 다른 시스템 프롬프트.
- 입력: 루브릭 앵커 전문 + 태스크 지시 + 스팬 목록(id 포함) + 산출물. J2는 산출물을 제외하고 스팬만 받는다(프로세스 전용 렌즈).
- **재심**: 차원별 3심판 점수의 표준편차 > 1.0 이면 해당 차원만 `claude-opus-5`가 세 채점의 근거를 대조해 최종 판정.
- 비동기 일괄 평가(게스트 프리셋 재생성 등)는 Batch API(`client.messages.batches.create`, 50% 할인) 사용.

### 5-3. 편향 완화 구현

- **score-last**: structured output 스키마의 필드 순서를 `evidence[] → reasoning → score`로 정의해 근거 서술 후 점수가 생성되게 한다.
- **근거 인용 강제**: `evidence: [{span_id, quote}]`를 required로. 파이프라인에서 span_id 실존 검증 — 존재하지 않는 id를 인용하면 해당 차원 재채점 (1회 재시도, 그래도 실패 시 그 심판 점수 제외).
- **위치 편향**: 스팬은 시간순 고정이 자연스러우므로 순서 셔플은 하지 않되, 심판 3명의 시스템 프롬프트에 "길이가 아니라 행동을 채점하라" 명시(장황함 편향 완화).
- **structured output** `strict: true`로 점수 범위(1~5 integer)와 enum 강제.

### 5-4. 심판 출력 스키마 (심판 1명 기준)

```jsonc
{
  "dimensions": {
    "task_understanding": {
      "evidence": [{ "span_id": "uuid", "quote": "..." }],  // 1개 이상 required
      "reasoning": "...",                                    // 앵커 대비 판단
      "score": 3                                             // 1~5 integer
    }
    // × 7차원 (J2는 output_quality 제외 6차원)
  }
}
```

### 5-5. 등급·집계

- 차원 점수 = 3심판 평균(재심 차원은 재심 값). 가중 평균 → `weighted_score`.
- 등급: ≥4.5 S / 3.5~4.4 A / 2.5~3.4 B / <2.5 C.

### 5-6. κ 캘리브레이션 (W3에 반드시 수행)

1. 개발 중 축적된 run 20건을 골라 사람이 7차원 루브릭으로 직접 채점 (스프레드시트)
2. 심판 파이프라인 점수와 가중 코헨 κ 계산 (quadratic weights, 차원별 + 전체)
3. 결과 수치를 리포트 하단에 상시 표기: "이 평가는 인간 채점과 κ=0.61 일치 (20건 기준)"
4. κ < 0.4가 나오면: 앵커 문구를 구체화하고 재측정 — 점수를 손보는 게 아니라 루브릭을 손본다

## 6. 코칭 루프

1. 평가 완료 → 최저점 차원 선택 (동점이면 가중치 높은 쪽)
2. `claude-opus-5`에 [해당 차원 앵커 + 심판 reasoning + 인용 스팬]을 주고 코칭 카드 생성 — structured output: `{diagnosis, patch}`. `patch`는 시스템 프롬프트에 append 가능한 **행동 지시문** ("제출 전 핵심 주장 2개 이상을 서로 다른 출처로 교차 확인하고, 확인 결과를 '검증' 섹션에 기록하라")
3. 사용자가 "코칭 적용" 클릭 → `agents.spec.system_prompt`에 패치 append, `system_prompt_version` +1
4. 동일 태스크로 새 run 생성·실행·재평가
5. S5 화면에서 버전별 점수 비교 (Δ) — 상승/하락/유지 모두 정직하게 표시 (하락도 "코칭 재조정" CTA로 소화)

## 7. API 엔드포인트 (Next.js Route Handlers)

| 메서드·경로 | 동작 |
|---|---|
| `POST /api/agents` | JD → 스펙 생성, agents insert |
| `POST /api/agents/[id]/tasks` | 태스크 배정 (스펙의 sample_tasks 기반 or 수동) |
| `POST /api/runs` | 태스크 실행 시작 (body: task_id) → run_id 반환, 백그라운드 실행 |
| `GET /api/runs/[id]` | run 상태 + 스팬 폴링 (MVP는 2초 폴링, SSE는 시간 남으면) |
| `POST /api/runs/[id]/evaluate` | 평가 파이프라인 실행 → evaluation 반환 |
| `POST /api/evaluations/[id]/coach` | 코칭 카드 생성 |
| `POST /api/coaching/[id]/apply` | 패치 적용 + 재실행·재평가 트리거 |
| `GET /api/demo/[preset]` | 게스트 스냅샷 JSON (정적, 캐시) |

Vercel 함수 타임아웃 주의: 실행·평가는 오래 걸리므로 `maxDuration` 연장(Fluid Compute) 또는 Supabase Edge Function으로 분리. **폴링 기반으로 설계해 두면 어느 쪽이든 UI 변경 없음.**

## 8. 게스트 모드

- 빌드 전 로컬 스크립트(`scripts/generate-presets.ts`)로 샘플 JD 3종의 전체 루프(실행→평가→코칭→재평가)를 실제로 돌리고, 결과를 JSON 스냅샷으로 `presets/` 에 저장 → DB에 owner_id null로 시드.
- `/demo/[preset]` 은 이 데이터를 읽기 전용 렌더. **모조 데이터가 아니라 실제 실행 결과의 스냅샷** — 제출서에도 그렇게 명시 (진정성 + AI 활용 적절성 어필).
- 투표 트래픽 대비: 스냅샷 라우트는 `revalidate` 캐시로 DB 부하 차단.

## 9. 리포지토리 구조 & 셋업

```
sasu/
├── app/                      # Next.js App Router
│   ├── (auth)/hire/          # S1
│   ├── (auth)/agents/[id]/   # S2, S3, S4, S5
│   ├── demo/[preset]/        # 게스트 모드
│   └── api/                  # §7 엔드포인트
├── lib/
│   ├── anthropic.ts          # 클라이언트 싱글턴
│   ├── rubric.ts             # 7차원 앵커 상수 (단일 소스)
│   ├── agent-runner.ts       # §4 실행 파이프라인
│   ├── evaluator.ts          # §5 평가 파이프라인
│   └── coach.ts              # §6 코칭
├── scripts/
│   ├── generate-presets.ts   # 게스트 스냅샷 생성
│   └── calibrate.ts          # κ 계산 (인간 채점 CSV 입력)
└── supabase/migrations/      # §3 스키마
```

환경 변수: `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, (선택) `UPSTAGE_API_KEY`.

배포: Vercel (프론트+API). DB/Auth: Supabase. 별도 워커 서버는 MVP에서 두지 않는다 (§7 참조).

## 10. 3주 스프린트 플랜 (8/31 기준, 마감 9/20)

### W1 (9/1~9/7) — 코어 루프가 CLI에서 돈다
- 리포·Supabase·Vercel 셋업, 스키마 마이그레이션 (D1)
- JD→스펙 변환 + 태스크 실행 + 스팬 기록, CLI/스크립트로 검증 (D2~4)
- 평가 파이프라인 v1: 심판 1명·근거 인용·score-last까지 (D5~6)
- **W1 게이트: 스크립트로 "JD → run → 평가 JSON"이 나온다**
### W2 (9/8~9/14) — 제품이 된다
- 3심판+재심, 코칭 루프, 재평가 Δ (D8~9)
- 화면 S1~S5 (D10~12)
- 로그인, RLS (D13)
- **W2 게이트: 배포 URL에서 데모 5단계 완주**
### W3 (9/15~9/20) — 제출 품질
- 게스트 프리셋 3종 생성·시드, `/demo` 라우트 (D15)
- κ 캘리브레이션 20건 + 수치 표기 (D16)
- 폴리시·엣지케이스·모바일 뷰, (여유 시) Upstage J3 교체 (D17~18)
- **9/18(금): 참가 접수 + 팀원 초대 마감일 — 접수는 이 날 이전에 미리 완료**
- 제출서 작성·시연 영상 촬영, **9/19(토) 제출** (마감 하루 전 버퍼) (D19)

매일 마지막 커밋은 배포 가능한 상태 유지. 일정 슬립 시 §1 컷 라인 순서대로 자른다.

## 11. 리스크

| 리스크 | 대응 |
|---|---|
| Vercel 함수 타임아웃으로 실행 중단 | 폴링 설계 유지 + maxDuration 연장; 안 되면 Supabase Edge Function으로 실행부만 이전 |
| 심판 점수가 널뛴다 | 앵커 구체화가 1순위 처방. κ 측정 전에 심판 프롬프트를 감으로 고치지 않는다 |
| Opus 5 refusal로 태스크 중단 | `fallbacks: "default"` 상시 적용, stop_reason 체크 후 UI에 상태 표시 |
| 웹 검색 결과 품질 낮은 샘플 태스크 | 프리셋 JD를 검색이 잘 되는 주제로 선정 (실행해 보고 고른다) |
| 심사 기간 트래픽 | 게스트 모드 정적 캐시, 인증 필요 기능은 심사자 동선에서 제외 |
| API 키 노출 | 모든 Anthropic 호출은 서버에서만. 클라이언트 번들에 키 절대 금지 |

## 12. 제출 체크리스트 (원티드 요건)

- [ ] 참가 접수 완료 (9/18 금 23:59까지 — 팀원 초대도 이 시점까지)
- [ ] 배포된 서비스 링크 (심사 기간 접속 유지)
- [ ] 해결하고자 한 문제 / AI 활용 방식 / 사용한 AI 툴 기재 (제출 킷 문서에서 복사·다듬기)
- [ ] 개발 과정 AI 활용 기록 첨부 (Claude Code 세션 로그 요약)
- [ ] 과제에 개인정보·기밀 미포함 확인
- [ ] 9/20(일) 23:59 이전 최종 제출 — 임시저장은 제출로 인정되지 않음
