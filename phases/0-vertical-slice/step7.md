# Step 7: mask-rules

## 읽어야 할 파일

- `/docs/PRD.md` **§6-2 "마스킹 규칙"** — 무엇을 지우고 **무엇을 지우면 안 되는지**가 여기 있다
- `/docs/PRD.md` **§6-2 "규칙 휴리스틱"** — 규칙 분류가 잡아야 할 5가지 신호
- `/docs/PRD.md` **§10 #8**(재현율 가설) · **§11 WATCH 행**(재현율 ≥ 0.7 작업 임계와 미달 시 대응 순서)
- `/docs/ARCHITECTURE.md` **§8 테스트 경계 1행** — `lib/mask.ts`·`lib/rules.ts`는 **TDD 대상**이고, 표에 검증 항목이 명시돼 있다
- `/docs/ADR.md` **ADR-011**(규칙이 정량 신호를 먼저 잡는다)
- 이전 step 산출물: `lib/contracts.ts`의 `Classification`(step 3) · `lib/llm.ts`(step 5, 마스킹 확인 정규식이 임시로 여기 들어 있다)

## 작업

**이 step은 TDD 대상이다.** `tests/mask.test.ts`·`tests/rules.test.ts`를 먼저 쓴다. 둘 다 순수 함수라 mock이 필요 없다.

### 1. `lib/mask.ts`

```ts
export function mask(text: string): string;
export const MASK_PATTERNS: { name: string; re: RegExp; token: string }[];
```

**지우는 것**: 전화번호 · 이메일 · 주민등록번호 · 계좌번호 · 카드번호.

**절대 지우지 않는 것**: 금액 · 날짜 · 수량. 이유는 PRD §6-2에 그대로 적혀 있다 — "견적 금액이 전화번호로 오인되면 결정 근거가 사라진다". 이게 이 모듈에서 가장 중요한 요구사항이고, 테스트의 절반이 여기 가야 한다.

치환 토큰은 종류를 남긴다: `[전화번호]` · `[이메일]` · `[주민번호]` · `[계좌번호]` · `[카드번호]`.

한국어 맥락의 함정을 테스트로 박아라:
- `12,000,000원` · `1200만원` · `견적 3,500` → **그대로 남아야 한다**
- `2026-09-08` · `9/8` · `9월 8일` → **그대로 남아야 한다**
- `010-1234-5678` · `01012345678` · `010 1234 5678` → 마스킹
- `a@b.co.kr` → 마스킹
- `123456-1234567` → 마스킹
- `국민 123456-78-901234` → 마스킹하되 앞의 은행명은 남는다

**step 5에서 `lib/llm.ts` 안에 임시로 둔 마스킹 확인 정규식을 여기로 옮기고**, `llm.ts`가 `MASK_PATTERNS`를 import해 쓰도록 고친다. 패턴이 두 곳에 있으면 어긋난다.

### 2. `lib/rules.ts`

```ts
export type RuleSignal = {
  isDecisionCandidate: boolean;
  reasons: string[];              // 어떤 규칙이 걸렸는지 (디버깅·프롬프트 근거용)
  deadlineHint: Date | null;      // 규칙이 뽑은 마감. 해석 불가면 null
};

export function classifyByRules(input: {
  content: string;
  spokenAt: Date;
  hasReplyWithin12h?: boolean;
}): RuleSignal;
```

PRD §6-2의 신호 5가지를 구현한다:
1. 물음표 + 2인칭 요청 — "~할까요", "~해도 돼요", "~해도 될까요", "확인 부탁", "검토 부탁"
2. 마감 표현 — "오늘까지", "내일까지", "금요일", "이번 주까지", 명시적 날짜
3. 회의 정리의 "보류" 태그
4. 12시간 이상 답글 없는 질문 (`hasReplyWithin12h === false`)
5. 위 중 하나라도 걸리면 `isDecisionCandidate = true`

**`deadlineHint`는 `spokenAt` 기준 상대 표현을 KST로 해석한다** (PRD §6-2). "금요일까지"는 `spokenAt` 이후 가장 가까운 금요일. 해석 불가면 `null`이고, 카드에는 "마감 미정"으로 나간다. 시간대를 UTC로 계산하지 마라 — 한국 사용자의 "오늘까지"가 하루 밀린다.

**규칙이 잡은 것만 LLM에 보낸다** (ADR-011). `isDecisionCandidate === false`면 step 9의 분류 파이프라인이 LLM을 부르지 않고 `chatter`/`info`로 끝낸다. 비용이 여기서 결정된다.

### 3. 재현율에 대해

PRD §11이 "결정 필요" 재현율 ≥ 0.7을 **작업 임계**로 정해 뒀다. 이 step에서 그 수치를 측정할 실데이터는 아직 없다(D3에 사람이 20건 수동 채점한다). **점수를 맞추려고 규칙을 과하게 넓히지 마라** — 오탐이 늘면 카드가 쏟아진다. 지금은 §6-2의 5가지를 정확히 구현하는 것까지가 범위다.

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
```

```bash
npx vitest run tests/mask.test.ts tests/rules.test.ts --reporter=verbose
# 아래가 테스트 목록에 실제로 있어야 한다:
#   - mask 는 금액(12,000,000원 · 1200만원)을 지우지 않는다
#   - mask 는 날짜(2026-09-08 · 9월 8일)를 지우지 않는다
#   - mask 는 휴대폰 번호를 하이픈 유무와 무관하게 [전화번호] 로 바꾼다
#   - mask 는 이메일·주민번호·계좌·카드번호를 종류가 남는 토큰으로 바꾼다
#   - classifyByRules 는 "이 견적 받아도 돼요?" 를 결정 후보로 잡는다
#   - classifyByRules 는 "점심 뭐 먹지" 를 결정 후보로 잡지 않는다
#   - deadlineHint 는 "금요일까지" 를 spokenAt 이후 가장 가까운 금요일 KST 로 해석한다
#   - deadlineHint 는 해석 불가한 표현에 null 을 준다
```

```bash
# 마스킹 패턴이 두 곳에 있지 않은가
grep -n "MASK_PATTERNS" lib/llm.ts || { echo "FAIL: llm.ts 가 mask.ts 패턴을 쓰지 않는다"; exit 1; }
echo "OK: mask & rules"
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트:
   - 테스트 파일이 구현보다 먼저 만들어졌는가? (TDD 훅)
   - 두 모듈이 순수 함수인가? (Supabase·Groq·`Date.now()` 직접 참조 없이, 시각은 인자로 받는가)
   - 마스킹 패턴이 `lib/mask.ts` 한 곳에만 있고 `lib/llm.ts`가 그것을 import하는가?
   - 금액·날짜·수량을 지우지 않는 테스트가 실제로 있는가?
3. `phases/0-vertical-slice/index.json`의 step 7을 업데이트한다:
   - 성공 → `"completed"` + `"summary"`에 `mask`/`classifyByRules` 시그니처와 구현한 규칙 신호 목록
   - 실패 → `"error"` + `"error_message"`
   - 사용자 개입 필요 → `"blocked"` + `"blocked_reason"`

## 금지사항

- 금액·날짜·수량을 마스킹하지 마라. 이유: 결정의 근거가 사라진다 (PRD §6-2). 전화번호 정규식이 `12,000,000`을 먹지 않는지 테스트로 확인하라.
- 마스킹 전 원문을 어디에도 저장·로그하지 마라. 이유: ARCHITECTURE §6 불변식 9 — `items.content`는 마스킹 후만 저장한다.
- Presidio나 외부 PII 라이브러리를 추가하지 마라. 이유: PRD §8-1에서 "나중"으로 확정됐다. 정규식 선마스킹만이다.
- `lib/rules.ts`에서 LLM을 부르지 마라. 이유: 규칙은 1차이고 LLM은 2차다. 순서가 뒤집히면 ADR-011의 비용 구조가 무너진다.
- 시각 계산을 UTC로 하지 마라. 이유: "오늘까지"가 KST 기준이다.
- 재현율을 올리려고 규칙을 과하게 넓히지 마라. 이유: 오탐 카드가 담당자에게 DM으로 쏟아진다. 조정 순서는 PRD §11에 정해져 있다.
- 기존 테스트를 깨뜨리지 마라.
