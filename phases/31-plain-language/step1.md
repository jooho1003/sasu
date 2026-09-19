# Step 1: labels-ssot

상태값의 한글 이름표를 한 파일로 모으고, 영문 값이 화면·오류 문장에 그대로 나오는 자리를 없앤다. 문구 사전 적용은 여기서 하지 않는다(이름표 값만 사전을 따른다).

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §1-4(결함 4곳)·§3-2(상태 이름표 값)·§5-2(명세)
- `docs/wording-guide.md` (step 0 산출물)
- `lib/contracts.ts` — enum 전부. 특히 `MemberRole`, `TrailerInviteStatus`, 분류 `label`, `visibility`, 카드·답변·검토·job 상태
- `components/trailers/invites.tsx:18` · `app/demo/d/[dept]/cards/[id]/page.tsx:51` · `components/admin/notion-collection.tsx:36` · `app/api/d/[dept]/cards/[id]/route.ts`(상태 전이 오류 문장) — 고칠 자리
- `components/trailers/views.tsx:6-9`(`trailerStatus` 등) · `lib/trailer-invite.ts:14-22`(`inviteStatusLabel`) · `components/question-history.tsx:6` · `components/slack-questions.tsx:6` · `components/demo-questions.tsx:146-154` — 이미 흩어져 있는 이름표. 이 파일들의 매핑을 `lib/labels.ts`로 옮기고 import로 바꾼다

## 작업

### 1. `lib/labels.ts` (테스트 먼저 — `tests/labels.test.ts`)

```ts
import type { z } from "zod";
import { CardStatus, AnswerStatus, ItemLabel, Visibility, MemberRole, TrailerInviteStatus, TrailerStatus, ReviewStatus, JobStatus, NotionRootState } from "@/lib/contracts";
export const LABELS = {
  cardStatus: { open: "아직 결정 안 함", decided: "결정함", deferred: "미룸", rejected: "돌려보냄", needs_review: "팀장 확인 필요", merged: "다른 카드에 합침" } satisfies Record<z.infer<typeof CardStatus>, string>,
  itemLabel:  { decision: "결정 필요", action: "할 일", info: "정보", chatter: "잡담", unclassified: "아직 못 나눔" } satisfies Record<z.infer<typeof ItemLabel>, string>,
  visibility: { dept: "부서 전체", leads_only: "팀장만" } satisfies Record<z.infer<typeof Visibility>, string>,
  memberRole: { lead: "팀장", member: "팀원" } satisfies Record<z.infer<typeof MemberRole>, string>,
  // … 나머지 enum 전부
} as const;
export function label<K extends keyof typeof LABELS>(kind: K, value: keyof (typeof LABELS)[K]): string;
```

- enum이 `lib/contracts.ts`에 export 되어 있지 않으면 **export만 추가**한다(값·이름 변경 금지).
- `satisfies Record<…>`로 전수 강제. 값 하나가 빠지면 `tsc`가 실패해야 한다 — 테스트에 `// @ts-expect-error` 케이스 1개.
- 값은 설계 §3-2 사전을 따른다(보류→미룸, 반려→돌려보냄, 발행→공개, 철회→거둠, 파기→완전히 지움, 채점 중→점수 매기는 중). §0-2가 "유지"로 확정되면 결정/보류/반려 값만 원래대로 둔다.

테스트: 모든 이름표가 한글만·8자 이내(공백 포함 10자)·`terms.json` 금지어 0(step 0의 `checkStrings` 재사용)·`label()`이 알 수 없는 값에 `never`.

### 2. 결함 4곳 수정

- `components/trailers/invites.tsx:18` → `label("inviteAttempt", row.attempt_status)`(null이면 "—").
- `app/demo/d/[dept]/cards/[id]/page.tsx:51` → `label("cardStatus", card.status)`.
- `components/admin/notion-collection.tsx:36` → `label("notionRootState", root.state)`.
- `app/api/**/route.ts`의 `${…status}` 템플릿 문장 전부 → 이름표를 거친 문장. 예: `"지금은 '아직 결정 안 함' 상태가 아니라 바꿀 수 없습니다. 화면을 새로 고쳐 주세요."` 검사기(`template`)가 0건이어야 한다.

### 3. 흩어진 매핑 통합

`trailerStatus`·`inviteStatusLabel`·`question-history`·`slack-questions`·`demo-questions`의 상태 매핑을 `lib/labels.ts`에서 import하도록 바꾼다. 화면 표시가 바뀌는 곳은 요약에 전후를 적는다.

## Acceptance Criteria

```bash
npx vitest run tests/labels.test.ts
npx tsc --noEmit
node scripts/check-wording.mjs components/trailers/invites.tsx "app/demo/d/[dept]/cards/[id]/page.tsx" components/admin/notion-collection.tsx | grep -c "\[template\]"   # 0
node scripts/check-wording.mjs --report | grep -c "\[template\]"   # 0
npm run lint && npm run test
```

## 금지사항

- `lib/contracts.ts`의 enum 값·이름을 바꾸지 마라. 이유: DB·API·슬랙 페이로드와 묶여 있다. export 추가만.
- 이름표를 컴포넌트 안에 새로 만들지 마라. 이유: SSOT가 둘이면 어긋난다(CLAUDE.md의 `can_see()` 원칙과 같은 이유).
- 이름표 밖의 문구를 바꾸지 마라. 이유: 화면 문구는 step 2~6이 파일 단위로 맡는다. 같은 파일을 두 step이 고치면 충돌한다.
- 상태 이름표에 영문·괄호 설명을 넣지 마라. 이유: W2·8자 규칙. 설명이 필요하면 화면 쪽 도움말 한 줄로(그 step에서).
