이 프로젝트는 Harness 프레임워크를 사용한다. 아래 워크플로우에 따라 작업을 진행하라.

---

## 워크플로우

### A. 탐색

`/docs/` 최상위 문서(PRD, ARCHITECTURE, ADR, setup-guide, submission-checklist)를 읽고 프로젝트의 기획·아키텍처·설계 의도를 파악한다. 필요시 Explore 에이전트를 병렬로 사용한다. `docs/archive/`는 폐기본이므로 읽지 않는다.

### A-1. 코드 맥락과 구조 확인

`docs/AI-DEVELOPMENT.md`를 따라 Graft로 관련 코드·호출·의존 관계를 확인한다. 여러 구성 요소의 경계나 실행 흐름이 바뀌면 Archify로 구조도를 작성해 명세와 대조한다. 실제 파일을 읽고 코드 그래프의 최신성을 확인한다. 결과 파일과 영향 범위를 step의 입력·완료 요약에 연결한다.

도구를 사용할 수 없으면 실제 코드로 확인한 범위와 누락된 도구 결과를 기록한다. 필요한 도구 결과가 완료 기준에 포함되어 있으면 해당 기준을 충족하기 전에는 완료 처리하지 않는다. 도구 실행 결과를 추정해 기록하지 않는다.

### B. 논의

구현을 위해 구체화하거나 기술적으로 결정해야 할 사항이 있으면 사용자에게 제시하고 논의한다. PRD §10의 `(확인 필요)`·`미정` 항목이 step에 걸리면 먼저 푼다. 요구가 모호해 논의가 길어지면 `/plan-plus <feature>`로 의도·대안·YAGNI 검토를 함께 진행한다.

### B-1. bkit 계획·설계

step 초안을 쓰기 전에 bkit PDCA로 기능의 plan/design 문서를 만든다. 생략하지 않는다. `<feature>`는 task 디렉토리명에서 번호를 뺀 slug다(`23-browser-meeting-recording` → `browser-meeting-recording`).

1. `/pdca plan <feature>` → `docs/01-plan/features/<feature>.plan.md`
2. `/pdca design <feature>` → `docs/02-design/features/<feature>.design.md`

문서 우선순위(CLAUDE.md)는 바뀌지 않는다. B·B-1에서 정해진 범위·결정은 PRD §3·§8·ADR에 먼저 적고, plan/design 문서에는 그 절 매핑과 `/pdca analyze`가 비교할 목록(엔드포인트·화면·모듈·job·테이블)만 둔다. 기존 예: `docs/01-plan/features/browser-meeting-recording.plan.md`, `docs/02-design/features/sasu-mvp.design.md`. 논의로 결정이 바뀌면 design 문서도 같이 갱신한다. design 문서가 없으면 C로 넘어가지 않는다.

### C. Step 설계

사용자가 구현 계획 작성을 지시하면 B-1의 design 문서를 기준으로 여러 step으로 나뉜 초안을 작성해 피드백을 요청한다.

설계 원칙:

1. **Scope 최소화** — 하나의 step에서 하나의 레이어 또는 모듈만 다룬다. 여러 모듈을 동시에 수정해야 하면 step을 쪼갠다.
2. **자기완결성** — 각 step 파일은 독립된 세션에서 실행된다. "이전 대화에서 논의한 바와 같이" 같은 외부 참조는 금지한다. 필요한 정보는 전부 파일 안에 적는다.
3. **사전 준비 강제** — 관련 문서 경로와 이전 step에서 생성/수정된 파일 경로를 명시한다. 세션이 코드를 읽고 맥락을 파악한 뒤 작업하도록 유도한다.
4. **시그니처 수준 지시** — 함수/클래스의 인터페이스만 제시하고 내부 구현은 에이전트 재량에 맡긴다. 단, 설계 의도에서 벗어나면 안 되는 핵심 규칙(멱등성, RLS USING+WITH CHECK, 요청 경로 service role 금지, `llm.ts` 단일 호출점, 인용 검증, 미동의 발언 미저장)은 반드시 명시한다.
5. **AC는 실행 가능한 커맨드** — "~가 동작해야 한다" 같은 추상적 서술이 아닌 `npm run build && npm test` 같은 실제 실행 가능한 검증 커맨드를 포함한다. PRD §11 검증표의 행이 걸리는 step은 그 행의 판정 기준(예: "같은 슬랙 이벤트 2회 전송 → items 1건")을 AC로 옮긴다.
6. **주의사항은 구체적으로** — "조심해라" 대신 "X를 하지 마라. 이유: Y" 형식으로 적는다.
7. **네이밍** — step name은 kebab-case slug로, 해당 step의 핵심 모듈/작업을 한두 단어로 표현한다 (예: `schema-v1`, `jobs-worker`, `slack-adapter`, `card-pipeline`).
8. **주입되는 문서와 주입되지 않는 문서를 구분한다** — execute.py의 가드레일은 AGENTS.md + `docs/` **최상위** `*.md`(PRD·ARCHITECTURE·ADR·setup-guide·submission-checklist)만 주입한다. `docs/01-plan/`·`docs/02-design/`(bkit 어댑터), `docs/proposal/`, `docs/submission/`, `docs/archive/`는 주입되지 않는다. 본문은 최상위 문서에 있으므로 주입할 필요는 없지만, 해당 기능의 design 문서는 `/pdca analyze`가 비교할 목록을 담고 있으므로 `## 읽어야 할 파일`에 경로를 적는다. step이 최상위 문서의 특정 절(예: PRD §6-1 스키마, §6-3 카드 파이프라인 ⑨ 멱등성)에 의존하면 `## 읽어야 할 파일`에 **절 번호까지** 적는다. 절 번호 없이 "PRD 참조"라고 쓰면 에이전트는 900줄을 훑다가 추측한다.
9. **참조 문서의 버전을 적었다면 그 버전이 현행인지 확인한다** — step 파일에 "스키마 v1"처럼 버전을 박아두면 문서가 갱신돼도 step은 갱신되지 않는다. 특히 D2 임베딩 마이그레이션, D3·D6·D9 게이트 판정 후에는 PRD §4·§8-0이 바뀌므로, 이미 completed된 step이 참조하던 절이 바뀌었으면 그 델타를 반영할 후속 step이 필요한지 판단한다. harness에는 이를 감지하는 장치가 없다.
10. **게이트 판정은 step이 아니라 사람이 한다** — D3 세로 슬라이스·D6 봇·D8 코드 리뷰·D9 컷은 setup-guide §10의 사람 판정이다. step은 판정 재료(배포 URL·실행 기록)를 만들고 `blocked`로 멈춘다. step이 스스로 강등을 결정하지 않는다.

### D. 파일 생성

사용자가 승인하면 아래 파일들을 생성한다.

#### D-1. `phases/index.json` (전체 현황)

여러 task를 관리하는 top-level 인덱스. 이미 존재하면 `phases` 배열에 새 항목을 추가한다.

```json
{
  "phases": [
    {
      "dir": "0-vertical-slice",
      "status": "pending"
    }
  ]
}
```

- `dir`: task 디렉토리명.
- `status`: `"pending"` | `"completed"` | `"error"` | `"blocked"`. execute.py가 실행 중 자동으로 업데이트한다.
- 타임스탬프(`completed_at`, `failed_at`, `blocked_at`)는 execute.py가 상태 변경 시 자동 기록한다. 생성 시 넣지 않는다.

#### D-2. `phases/{task-name}/index.json` (task 상세)

```json
{
  "project": "sasu",
  "phase": "<task-name>",
  "steps": [
    { "step": 0, "name": "project-setup", "status": "pending" },
    { "step": 1, "name": "schema-v1", "status": "pending" },
    { "step": 2, "name": "jobs-worker", "status": "pending" }
  ]
}
```

필드 규칙:

- `project`: 프로젝트명 (`sasu`).
- `phase`: task 이름. 디렉토리명과 일치시킨다.
- `steps[].step`: 0부터 시작하는 순번.
- `steps[].name`: kebab-case slug.
- `steps[].status`: 초기값은 모두 `"pending"`.

상태 전이와 자동 기록 필드:

| 전이 | 기록되는 필드 | 기록 주체 |
|------|-------------|----------|
| → `completed` | `completed_at`, `summary` | 에이전트 세션 (summary), execute.py (timestamp) |
| → `error` | `failed_at`, `error_message` | 에이전트 세션 (message), execute.py (timestamp) |
| → `blocked` | `blocked_at`, `blocked_reason` | 에이전트 세션 (reason), execute.py (timestamp) |

`summary`는 step 완료 시 산출물을 한 줄로 요약한 것으로, execute.py가 다음 step 프롬프트에 컨텍스트로 누적 전달한다. 따라서 다음 step에 유용한 정보(생성된 파일, 핵심 결정 등)를 담아야 한다.

`created_at`은 execute.py가 최초 실행 시 task 레벨에 한 번만 기록한다. step 레벨의 `started_at`도 execute.py가 각 step 시작 시 자동 기록한다. 생성 시 넣지 않는다.

#### D-3. `phases/{task-name}/step{N}.md` (각 step마다 1개)

```markdown
# Step {N}: {이름}

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/ARCHITECTURE.md` §2 디렉토리 · §3 패턴 · §6 불변식
- `/docs/ADR.md`
- `/docs/PRD.md` §{이 step에 필요한 절 번호}
- `/docs/02-design/features/{feature}.design.md` (bkit 설계 — 이 step이 구현할 항목)
- {이전 step에서 생성/수정된 파일 경로}

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 작업

{구체적인 구현 지시. 파일 경로, 클래스/함수 시그니처, 로직 설명을 포함.
코드 스니펫은 인터페이스/시그니처 수준만 제시하고, 구현체는 에이전트에게 맡겨라.
단, 설계 의도에서 벗어나면 안 되는 핵심 규칙은 명확히 박아넣어라.}

## 코드 관계와 구조 확인

- Graft로 확인할 관련 코드·의존 관계와 수정 후 영향 범위.
- 구조 변경 시 Archify로 표현할 구성 요소·실행 흐름·사람의 결정 지점.
- 산출물 저장 경로: `docs/verification/{task-name}/`.

## Acceptance Criteria

```bash
npm run build   # 컴파일 에러 없음
npm test        # 테스트 통과
```

{PRD §11 검증표에서 이 step이 만족시키는 행의 판정 기준을 실행 가능한 형태로 추가}

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md §2 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙(can_see 단일 판정 · 요청 경로 service role 금지 · llm.ts 단일 호출점 · 인용 검증 · 미동의 미저장 · 비밀값 · 로그)을 위반하지 않았는가?
   - 새 `lib/` 모듈에 `tests/` 미러 테스트가 있는가?
3. 결과에 따라 `phases/{task-name}/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 플랜 확인, 슬랙 앱 설정, 게이트 판정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- {이 step에서 하지 말아야 할 것. "X를 하지 마라. 이유: Y" 형식}
- 기존 테스트를 깨뜨리지 마라
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다
- Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라. 이유: 재시도·refusal·비용 기록이 거기에만 있다
```

### E. 실행

```bash
python scripts/execute.py {task-name}                    # 순차 실행 (기본 에이전트: codex)
python scripts/execute.py {task-name} --agent claude     # Claude Code로 실행
python scripts/execute.py {task-name} --push             # 실행 후 push
```

> **Windows**: `python3`는 Windows Store 앱 실행 별칭 스텁이라 그대로 쓰면 아무것도 실행되지 않는다. `py -3`도 런처가 없는 환경이 있다. `python --version`으로 3.x임을 확인한 뒤 `python scripts/execute.py {task-name}`으로 실행한다. 훅 스크립트는 `bash`와 `jq`가 PATH에 있어야 한다 (Git Bash 포함, jq는 별도 설치 — `scripts/test_hooks.py`로 확인).

execute.py가 자동으로 처리하는 것:

- `feat-{task-name}` 브랜치 생성/checkout
- 가드레일 주입 — AGENTS.md(없으면 CLAUDE.md) + `docs/` **최상위** `*.md`를 매 step 프롬프트에 포함 (재귀하지 않는다. `docs/01-plan/`·`02-design/`·`proposal/`·`submission/`·`archive/` 하위는 주입 대상이 아니다 — 설계 원칙 8)
- 컨텍스트 누적 — 완료된 step의 summary를 다음 step 프롬프트에 전달
- 자가 교정 — 실패 시 최대 3회 재시도하며, 이전 에러 메시지를 프롬프트에 피드백
- 2단계 커밋 — 코드 변경(`feat`)과 메타데이터(`chore`)를 분리 커밋
- 타임스탬프 — started_at, completed_at, failed_at, blocked_at 자동 기록

에러 복구:

- **error 발생 시**: `phases/{task-name}/index.json`에서 해당 step의 `status`를 `"pending"`으로 바꾸고 `error_message`를 삭제한 뒤 재실행한다.
- **blocked 발생 시**: `blocked_reason`에 적힌 사유를 해결한 뒤(대개 setup-guide의 사람 작업), `status`를 `"pending"`으로 바꾸고 `blocked_reason`을 삭제한 뒤 재실행한다.

### E-1. bkit 확인

task의 step이 모두 `completed`가 되면 `/pdca analyze <feature>`로 design 문서 대비 일치율을 확인한다.

- 90% 미만: 차이가 작으면 `/pdca iterate <feature>`로 고치고, step 단위 구현이 필요하면 후속 step을 추가해 E로 다시 실행한다. 그다음 다시 분석한다.
- 90% 이상: `/pdca report <feature>`로 완료 보고서를 남긴다.
- 분석·보고서 경로를 `docs/verification/{task-name}/` 검증 기록에 연결한다. 일치율은 설계 대비 확인이다 — PRD §11 실행 기록을 대신하지 않는다.

### F. 이 프로젝트의 task 순서 (PRD §9)

| task | D | 내용 | 게이트 |
|---|---|---|---|
| `0-vertical-slice` | D1~D3 | 리포·스키마 v1·`can_see` RLS·jobs 워커·`llm.ts`·마스킹·규칙+gpt-oss-20b 분류·슬랙 어댑터·S1·카드 생성(인용 검증)·웹 카드 S2·웹 결정·원장 S3 | **D3 자정 사람 판정** |
| `0b-embedding` | D2~ | 임베딩 모델 확정 → `items.embedding`+`embed_model` 마이그레이션 · `embed` job · `search_as()` · 카드 입력의 유사 items 5 · 72h·0.85 병합 | 모델 확정은 사람 판정 (setup-guide §8) |
| `1-slack-dm-backfill` | D4 | Block Kit DM 버튼·모달·리드타임·7일 백필 | 컷 ① |
| `2-meeting` | D5~D6 | 업로드 파서 → Recall.ai → 회의 정리 (72h 병합은 `0b-embedding`) | **D6 봇 판정** · 컷 ③ |
| `3-notion-ask-rls` | D7~D8 | 노션 가져오기·S4 Q&A·권한 차등 답변·인용 검증·충돌 감지·@사수 (`can_see`는 task 0, `search_as`는 `0b-embedding`) | D8 사람 코드 리뷰 |
| `4-settings-consent` | D9 | S5 체크리스트·visibility·S0 동의·채널 공지·ask 상한 | 컷 ⑤⑥⑦ |
| `5-demo-seed` | D10 | seed-demo.ts 부서 2개·`/demo`·generic_answer | 프리징 |
| `6-polish` | D11 | 부하 테스트·에러 화면·빈 상태 | — |

`0b-embedding`은 PRD §9 D2의 "임베딩 모델 확정 → embedding 컬럼 마이그레이션"을 별도 task로 분리한 것이다. ADR-018이 확정 전 컬럼 고정을 금지하므로 task 0은 임베딩 없이 완주하고, 유사도가 필요한 기능(카드 입력의 유사 items 5·72h 병합·`search_as`)만 여기로 모았다.
