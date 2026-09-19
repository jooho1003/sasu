# Step 0: wording-guide-lint

용어 사전과 문구 검사기를 만들고, 지금 코드의 위반을 **보고만** 한다. 이 step은 화면 문구를 한 글자도 바꾸지 않는다. **설계 §0의 사용자 결정이 확정되지 않았으면 시작하지 마라.**

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §2(규칙 W1~W7)·§3(용어 사전)·§5-1(검사기 명세)·§5-3(체크리스트) — 이 step의 명세. 사전 표를 그대로 옮긴다
- `docs/PRD.md` §3-7 PL-01·PL-02·PL-03 · §7 "문구 원칙"
- `docs/ADR.md` ADR-065 결정 1·2·3
- `scripts/check-demo-release.mjs` · `scripts/audit-showcase-data.ts` — 리포의 검사 스크립트 형식(출력·종료 코드·본문 비출력)
- `scripts/hooks/tdd-guard.sh` — `lib/` 테스트 미러 규칙
- `lib/mask.ts` — 순수 함수 모듈의 형태

## 작업

### 1. `docs/wording-guide.md`

설계 §2의 규칙 7개(각 규칙 옆에 검사 방법)·허용 목록·고정 문구 목록, §3의 사전 3표(메뉴·개념어·호칭), §5-3의 리뷰 체크리스트 7줄. 설계 문서를 링크하되 내용은 복제한다(가이드는 단독으로 읽힌다).

### 2. `scripts/wording/terms.json`

```json
{ "version": 1, "terms": [
  { "term": "원장", "replacement": "결정 기록", "reason": "중2에게 병원 원장", "allow_in": [] },
  { "term": "매직링크", "replacement": "로그인 링크", "reason": "외래 합성어", "allow_in": [] },
  { "term": "RLS", "replacement": "데이터베이스가 직접 권한을 확인", "reason": "약어", "allow_in": ["app/(site)/privacy/**", "lib/consent.ts"] }
] }
```

- 설계 §3의 모든 행을 넣는다. `allow_in`은 glob 배열(개인정보·동의 파일만 병기 허용).
- 한 단어가 다른 뜻으로 쓰일 수 있는 항목(전사·보관·발행)은 `"context": "regex"`를 두어 오탐을 줄인다. 예: `전사`는 `전사(?!원)`.

### 3. `lib/wording-check.ts` (테스트 먼저 — `tests/wording-check.test.ts`)

순수 함수만. 파일 시스템을 읽지 않는다.

```ts
export type Finding = { line: number; kind: "banned" | "english" | "template" | "length" | "style_mix" | "button_noun"; text: string; suggestion?: string; blocking: boolean };
export function extractStrings(source: string, ext: ".tsx" | ".ts"): { line: number; text: string; context: "jsx" | "literal" | "button" | "error" }[];
export function checkStrings(items: ReturnType<typeof extractStrings>, terms: Term[], opts: { file: string; styleExempt: boolean }): Finding[];
```

- `extractStrings`: JSX 텍스트 노드, 문자열 리터럴(`"…"`, `'…'`, 템플릿의 정적 부분), `error:`/`message:` 값. 제외: import 경로, `className`, `href`, `data-*`, `console.*` 인자, 주석, 정규식 리터럴, 한글이 없는 문자열. `<button>`·`role="button"`·`type="submit"` 안 텍스트는 `context: "button"`.
- `checkStrings`:
  - `banned`(차단): `terms.json`의 term이 포함되고 `allow_in`에 해당하지 않을 때. `suggestion = replacement`.
  - `english`(차단): 한글 문자열 안의 `[A-Z]{2,}` 또는 `\b[A-Za-z]{3,}\b`. 예외: 소문자 점 확장자(`.vtt`), `terms.json`의 `allow_english`(예: `Slack`은 `components/admin/slack-installation.tsx`만).
  - `template`(차단): 원본 줄에 `${…status}`·`${…state}`·`${…kind}`가 한글과 같은 문자열에 있을 때. `오류가 발생` 포함도 차단.
  - `length`(경고): 문장(`.`·`다`·`요`·`!`·`?` 기준 분리) 60자 초과.
  - `style_mix`(경고): 같은 파일에서 `(어|아|해|예)요[.!?]?$` 종결과 `(습니다|세요)[.!?]?$` 종결이 함께 나올 때. `styleExempt`면 건너뜀(예고편 컴포넌트).
  - `button_noun`(경고): `context === "button"`이고 텍스트가 공백 없는 1어절이며 `기|하기|보기|받기`로 끝나지 않을 때(`취소`·`확인`은 예외 목록).
- 같은 줄 끝에 `// wording-ok: <이유>`가 있으면 그 줄의 차단 항목을 `blocking: false`로 내리고 이유를 finding에 붙인다. 이유가 비면 그대로 차단.

테스트(먼저 작성): 각 kind마다 잡히는 예·안 잡히는 예 1개 이상, `allow_in`·`wording-ok`·확장자 예외·버튼 예외 목록.

### 4. `scripts/check-wording.mjs`

- 대상 glob: `app/**/*.tsx`, `components/**/*.tsx`, `lib/slack/**/*.ts`, `lib/consent.ts`, `lib/demo-access.ts`, `lib/org-admin.ts`, `lib/trailer-invite.ts`, `lib/trailer-assessment.ts`, `lib/labels.ts`(step 1 뒤), `app/api/**/route.ts`. 제외: `tests/**`, `scripts/**`, `*.test.*`, `node_modules`.
- 문체 예외 파일 목록(`styleExempt`): `components/recruitment-trailer.tsx`, `components/trailer-office.tsx`.
- `tsx`로 `lib/wording-check.ts`를 불러 쓴다(`npx tsx` 또는 `node --import tsx`). 이 리포의 다른 `.mjs`가 TS를 부르는 방식이 있으면 그대로 따른다.
- 출력: `파일:줄 [kind] 원문 앞 40자 → 대체어`. 마지막에 kind별 건수. 문자열 본문은 40자까지만(원문 전체를 출력하지 않는다).
- 옵션: `--report`(항상 종료 0) · `--text "<문장>"`(파일 대신 문장 하나 검사, step 6의 LLM 샘플용) · 파일 인자(그 파일만).
- 기본은 `blocking` 1건 이상이면 종료 1. **이 step에서는 lint 체인에 넣지 않는다**(설계 §0-7).
- `package.json`: `"check:wording": "node scripts/check-wording.mjs"`.

### 5. 현재 위반 보고서

`node scripts/check-wording.mjs --report > docs/verification/plain-language-audit-2026-09-19/baseline.txt`(본문 40자 제한이라 저장 가능). 요약에 kind별 건수와 상위 10개 파일을 적는다. 이 숫자가 step 7의 "0건" 비교 기준이다.

## Acceptance Criteria

```bash
npx vitest run tests/wording-check.test.ts     # 통과
node scripts/check-wording.mjs --report | tail -8   # kind별 건수 출력, 종료 0
node scripts/check-wording.mjs --text "결정을 원장에 기록했습니다" ; echo $?   # banned 1건, 종료 1
node scripts/check-wording.mjs --text "결정을 기록에 남겼습니다" ; echo $?     # 0건, 종료 0
npm run lint && npm run test
```

## 금지사항

- 화면 문구를 바꾸지 마라. 이유: 이 step의 산출물은 기준과 도구다. 문구는 step 2~6이 파일 단위로 나눠 고친다.
- `npm run lint`에 검사기를 넣지 마라. 이유: 설계 §0-7 — 기존 위반 수백 건이 다른 세션의 커밋을 막는다. step 7에서 넣는다.
- 검사기가 원문 전체를 출력하게 하지 마라. 이유: 불변식 9(로그에 본문 금지)의 정신. 40자 제한.
- `lib/wording-check.ts`에서 파일을 읽지 마라. 이유: 순수 함수여야 테스트가 빠르고, `--text` 옵션이 같은 경로를 탄다.
- 사전에 없는 말을 임의로 금지어에 넣지 마라. 이유: 사전은 설계 §3이 원본이다. 추가는 요약에 근거와 함께 적고 설계 문서에 반영을 요청한다.
