# 카드 담당자 DM 도달성 · 대시보드 결정 링크 수정 (2026-10-05)

브랜치 `fix/card-assignee-and-dashboard-link-20261005` (origin/main 866f39e 기준).

## 운영 증거 (2026-10-05, 부서 "파일럿 부서")
부서에 lead 2명(한 명은 슬랙 연결·동의 완료, 한 명은 슬랙 미연결)이 있는 상태에서 슬랙 → 카드 → 결정을 실제로 수행했다.
- 카드 2건이 `slack_delivery_status=failed`, `slack_delivery_error=slack_dm_unavailable`로 기록됐다. 두 카드의 담당자(assignee)는 슬랙이 없는 lead였다.
- 카드에서 결정을 내린 뒤에도 대시보드의 해당 기록에는 "→ 결정 기록" 대신 "카드로 올리기"가 보였다.

## 근본 원인
1. `lib/pipeline/card.ts` `resolveAssignee()`가 힌트가 없거나 `leads_only`일 때 `members.find(role === "lead")`로 첫 lead를 골랐다. members 조회에는 정렬이 없고 `slack_user_id`·`consented_at`을 읽지 않아, 슬랙 없는 lead가 뽑히면 `send-slack.ts`가 `slack_dm_unavailable`로 실패 처리했다. 다른 lead는 DM을 받을 수 있었는데도 그렇게 됐다.
2. `app/api/d/[dept]/items/route.ts`의 `decisionByItem`은 `citations.owner_kind='decision'`만 사용했다. 카드에서 내린 결정은 `decisions.request_id = decision_requests.id`이고 카드 citation은 `owner_kind='decision_request'`라서 연결되지 않았다.

## 수정
1. `Member`에 `slackUserId`·`consentedAt`(선택)을 추가하고 members select에 `slack_user_id, consented_at`을 포함했다. 폴백 lead는 user_id 순으로 정렬한 뒤 DM 가능(슬랙 연결 + 동의) lead를 우선하고, 없으면 정렬상 첫 lead를 쓴다. 힌트와 일치한 멤버는 그대로다.
2. 직접 결정 citation으로 매핑되지 않은 item에 대해 `decision_requests`(origin_item_id, dept 한정)와 `citations(owner_kind='decision_request')`로 요청 id를 모은 뒤 `decisions.request_id`로 결정 id를 찾는다. 기존 직접 매핑이 우선이며 응답 형태는 같다. 모두 세션(RLS) 클라이언트이며 service role은 쓰지 않았다.

## 변경 파일
- `lib/pipeline/card.ts`
- `app/api/d/[dept]/items/route.ts`
- `tests/pipeline/card.test.ts` (resolveAssignee 4건 추가)
- `tests/items-route-decision-link.test.ts` (신규, 3건)

## Red → Green
- `npx vitest run tests/pipeline/card.test.ts` 구현 전: 53건 중 3건 실패 (`expected 'lead-a' to be 'lead-b'`, `'lead-z' to be 'lead-c'`, `'lead-b' to be 'lead-a'`). 힌트 일치 케이스는 처음부터 통과(회귀 방지용).
- `npx vitest run tests/items-route-decision-link.test.ts` 구현 전: 3건 중 1건 실패 (`{ i1: null, i2: null }` 기대 `{ i1: dec-of-req-1, i2: dec-of-req-2 }`). 구현 후 3건 통과.

## 전체 검증
- `npm run lint`: exit 0 (blocking 0, 기존 경고 84건)
- `npm run test`: 188개 파일, 1901건 모두 통과
- `NEXT_PRIVATE_OUTPUT_TRACE_ROOT='D:\바이브코딩\sasu' npm run build`: 성공
- `npx tsc --noEmit`: 오류 없음
