# Step 6: slack-llm-style

슬랙으로 나가는 모든 문구를 사전대로 바꾸고, `lib/llm.ts` 전역 지시에 문체 블록을 붙인다. 슬랙 페이로드 구조·인용 검증·refused 판정은 건드리지 않는다.

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §1-6 · §4-9 · §6(문체 블록 원문) · §0-2
- `docs/wording-guide.md` · `lib/labels.ts`
- `docs/PRD.md` §6-5(step 3이 개정한 고정 문구) · §6-10 · §10 #21
- `docs/ADR.md` ADR-013·035(인용 검증) · ADR-050·051(슬랙 답변·안내) · ADR-065 결정 4
- 슬랙: `lib/slack/blocks.ts` · `lib/slack/answer.ts` · `lib/pipeline/slack-answer-delivery.ts` · `lib/pipeline/send-slack.ts` · `lib/pipeline/reminder.ts` · `app/api/slack/events/route.ts` · `app/api/slack/interactions/route.ts` · `app/api/slack/oauth/**/route.ts`
- LLM: `lib/llm.ts:36`(전역 지시)·`:280`(붙는 위치) · `lib/pipeline/answer.ts:383-394` · `lib/pipeline/card.ts:223-231` · `lib/pipeline/classify.ts` · `lib/pipeline/meeting-summary.ts` · `lib/pipeline/document-summary.ts` · `lib/agent-role.ts` · `lib/trailer-generation.ts:17` · `lib/trailer-assessment.ts:69`
- 테스트: `tests/slack/*.test.ts` · `tests/llm.test.ts` · `tests/pipeline/answer.test.ts`·`card.test.ts` — 문구를 잡는 assertion을 찾아 갱신한다

## 작업

### 1. 슬랙 카드 DM·모달 (`blocks.ts`, `send-slack.ts`)

- 헤더 "지금 결정" 유지. 섹션 `*배경*` → `*무슨 일인가요*`, `*추천 방향*` → `*사수의 제안*`, `*근거*` 유지, `:warning: *과거 결정과 충돌*` → `:warning: *예전 결정과 다릅니다*`. "마감 미정" 유지.
- 버튼(§0-2 확정값): 결정하기 · 미루기 · 돌려보내기. `action_id`·`value`는 그대로.
- 모달: 제목 "카드 처리" → "결정 남기기". 제출 "{상태} 기록" → "결정하기"/"미루기"/"돌려보내기". 입력 "결과" → "무엇으로 정했나요", "결정 사유" → "왜 그렇게 정했나요".
- "웹 카드에서 자세히 보기" 유지. 원문 무효화: "근거 원문이 변경되거나 삭제되어 이 결정 카드는 재검토가 필요합니다." → "근거가 된 원문이 바뀌거나 지워졌습니다. 이 카드는 다시 확인이 필요합니다."
- 동의 블록 "동의합니다"·"전문 보기" 유지. `CONSENT_SECTIONS` 본문은 step 5의 경계대로 건드리지 않는다.

### 2. 슬랙 답변·안내 (`answer.ts`, `slack-answer-delivery.ts`, `events/route.ts`, `interactions/route.ts`)

- 푸터(PRD §6-5 개정값): 채널 "이 채널에서 볼 수 있는 부서 기록만 보고 답했습니다." / DM "내가 볼 수 있는 부서 기록만 보고 답했습니다." 헤더 "사수의 답변" 유지. 거절 "이 질문에 답할 근거를 부서 기록에서 찾지 못했습니다." 링크 라벨 "원문 확인" → "원문 보기", "부서에서 보기" 유지, "결정 원장 확인" → "결정 기록 보기". 인용 메타 "근거 N · 작성자 · 시각" 유지, "시각 미상"·"작성자 미상" → "시각 모름"·"누가 썼는지 모름".
- 진행: "부서 기록을 찾아보고 있습니다. 최대 2분 정도 걸릴 수 있습니다. 결과가 늦으면 웹의 사수에게 묻기에서 확인해 주세요." → "부서 기록을 찾고 있습니다. 2분쯤 걸릴 수 있습니다. 늦으면 웹의 '묻기'에서 확인해 주세요." 실패 두 문장도 같은 식.
- 안내: "오늘 질문 한도(50회)를 모두 사용했습니다. 내일 다시 물어봐 주세요." 유지. "질문을 저장하지 않았습니다. 먼저 수집·처리에 동의해 주세요: …/consent" → "질문을 저장하지 않았습니다. 먼저 여기서 동의해 주세요: …/consent". "Slack 계정이 사수 멤버십에 연결되어 있지 않습니다. 부서 세팅에서 계정 연결이 필요합니다." → "이 슬랙 계정이 아직 사수 부서에 연결되지 않았습니다. 부서 설정에서 계정을 이어 주세요." "부서 설정에서 Slack 계정과 채널 연결을 확인해 주세요" → "부서 설정에서 슬랙 계정과 채널 연결을 확인해 주세요".
- 결정 결과: "결정을 원장에 기록했습니다." → "결정을 기록에 남겼습니다." "원장에서 보기" → "결정 기록 보기". "카드를 보류했습니다." → "카드를 미뤘습니다." "카드를 반려했습니다." → "카드를 돌려보냈습니다." "이미 {이름}이(가) {시각}에 결정했습니다 → 원장 #…" → "… → 기록 #…". 오류 문장 전부 W6 두 문장.
- 리마인더: "마감이 지난 담당 결정이 있습니다. 결정 카드를 확인해주세요." → "마감이 지난 결정이 있습니다. 결정 카드를 확인해 주세요." 버튼 "결정 카드 보기" 유지.
- OAuth: "조직 관리자만 Slack을 설치할 수 있습니다." → "조직 관리자만 슬랙을 설치할 수 있습니다."

### 3. LLM 문체 블록 (`lib/llm.ts`)

- `:36` 전역 지시 뒤에 설계 §6의 블록을 상수 `STYLE_GUIDE`로 추가하고, `:280`에서 모든 system 프롬프트에 함께 붙인다(citations 지시와 같은 방식).
- `lib/trailer-generation.ts`만 추가 문장: "가상 동료의 말풍선(dialogues[].question, NPC 대사)은 '-해요'로 끝낼 수 있습니다."
- 기존 프롬프트의 금지어 지시(합격·불합격·추천·평가·적합도)와 "한국어로" 지시는 그대로. 중복되는 "한국어로 작성" 문장은 두어도 된다(제거하지 않는다).
- `tests/llm.test.ts`: system 프롬프트에 `STYLE_GUIDE`가 포함되는지, quote 제외 문장이 포함되는지 assertion 추가. `tests/pipeline/answer.test.ts`의 인용 케이스는 **그대로 통과**해야 한다.

### 4. 샘플 검증

- 실제 Groq 호출로 데모 준비 질문 6개(`demo-questions` 목록)·카드 3개(영업 시드 안건)·문서 요약 2개를 만든다(`SASU_LLM_SAMPLE=1` 같은 임시 스크립트 `scripts/sample-llm-style.mjs`, 결과는 화면에 쓰지 않는다).
- 생성 문장(quote 제외)마다 `node scripts/check-wording.mjs --text "…"`를 돌려 위반 수를 센다. `docs/verification/plain-language-audit-2026-09-19/llm-style-samples.md`에 **항목 | 문장 수 | 위반 수 | 위반 종류**만 기록한다(생성 본문 전체를 붙이지 않는다. 40자 이내 발췌만).
- 준수율(위반 0인 항목 / 11)을 요약에 적는다. 70% 미만이면 PRD §10 #21 순서로 프롬프트를 한 번 더 강화해 다시 잰다.

## Acceptance Criteria

```bash
node scripts/check-wording.mjs lib/slack lib/pipeline/slack-answer-delivery.ts lib/pipeline/send-slack.ts lib/pipeline/reminder.ts app/api/slack   # blocking 0
npx vitest run tests/llm.test.ts tests/pipeline/answer.test.ts tests/pipeline/card.test.ts tests/slack
npm run lint && npm run test && npm run build
test -f docs/verification/plain-language-audit-2026-09-19/llm-style-samples.md
```

## 금지사항

- 슬랙 `action_id`·`value`·`block_id`·페이로드 구조를 바꾸지 마라. 이유: `interactions/route.ts`와 E2E가 그 값으로 분기한다. 텍스트만.
- 인용 검증(quote 포함 검사)·`isRefusalPayload`·canonical refused 문구 대체 로직을 바꾸지 마라. 이유: ADR-013·035, CLAUDE.md CRITICAL. 문체는 게이트가 아니다.
- 문체 위반을 이유로 답변·카드를 `failed`·`needs_review`로 만들지 마라. 이유: ADR-065 결정 4 — 문체는 품질 지표다. 막는 것은 인용 검증뿐.
- 샘플 검증 결과 문서에 생성 본문·질문 원문을 통째로 넣지 마라. 이유: 불변식 9(원문 로그 금지). 40자 발췌와 숫자만.
- `lib/llm.ts` 밖에서 Groq SDK를 부르지 마라. 이유: CLAUDE.md CRITICAL — 재시도·거절·`llm_calls`·마스킹 확인이 거기에 있다. 샘플 스크립트도 `llm.structured()`를 쓴다.
