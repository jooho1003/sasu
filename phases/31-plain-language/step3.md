# Step 3: core-screens

핵심 4화면(대시보드·결정 카드·결정 기록·묻기)의 문구를 사전대로 바꾸고 U2·U3·U4를 고친다. 로그인 화면과 데모 화면을 함께 고친다(같은 문구가 둘에 있다).

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §1-5 U2·U3·U4 · §3 · §4-2~§4-5 · §0-2(버튼 라벨 확정값)
- `docs/wording-guide.md` · `lib/labels.ts`
- 대시보드: `components/dashboard-s1.tsx` · `app/demo/d/[dept]/page.tsx` · `components/demo-records.tsx`
- 카드: `app/(auth)/d/[dept]/cards/[id]/page.tsx` · `app/demo/d/[dept]/cards/[id]/page.tsx` · `components/card-actions.tsx` · `components/card-reminder.tsx` · `components/demo-safe-actions.tsx`(카드·원장 안전 체험 부분)
- 결정 기록: `components/ledger-s3.tsx` · `components/decision-correction.tsx` · `app/demo/d/[dept]/ledger/page.tsx` · `components/demo-document-workspace.tsx`(원장 부분) · `lib/conflicts.ts`(`formatConflictBadge`)
- 묻기: `components/ask-s4.tsx` · `components/question-history.tsx` · `components/slack-questions.tsx` · `components/demo-questions.tsx`
- `docs/PRD.md` §6-5 고정 문구 — **이 step에서 PRD를 먼저 고친다**(아래 4)
- `docs/verification/plain-language-audit-2026-09-19/text-ledger.txt` — U3의 실제 목록(60여 줄 반복)

## 작업

### 1. 대시보드 (§4-2)

- 탭: `label("itemLabel", …)` 사용 → 결정 필요 · 할 일 · 정보 · 잡담 · 아직 못 나눔. 출처 탭: 전체 · 슬랙 · 회의 · 문서.
- 상단: "영업 사수의 워크스페이스" → "영업 사수의 부서". "오늘, 함께 살펴볼 결정." 유지. "흩어진 대화에서 결정할 순간을 모았습니다. 근거부터 확인해보세요." 유지.
- "결정 카드 N건 / 배경과 원문 근거를 확인하고, 다음 방향을 살펴보세요." → "결정 카드 N건 / 무슨 일인지와 원문 근거를 보고, 어느 쪽으로 갈지 정해 보세요." 배지 "팀장 근거 포함" 유지. "지난 결정 보기" 유지.
- U2: 항목 전체(`<li>` 또는 카드)를 하나의 링크로 만들고, 반복 텍스트 "출처와 결정 보기"를 없앤다. 각 항목 오른쪽에 "원문" 한 단어 + 결정으로 이어진 항목만 "→ 결정 기록". 스크린리더용 `aria-label`은 "{채널} {작성자} 원문 보기".
- 빈 상태: "슬랙 채널을 연결하면 기록이 쌓입니다" / "설정에서 채널을 연결해 주세요." / [설정으로 가기]. "이 분류에 표시할 항목이 없습니다. 다른 분류를 확인해주세요." → "여기에 넣을 기록이 아직 없습니다. 다른 탭을 눌러 보세요."
- 로딩 "부서 기록을 불러오는 중입니다." 유지.

### 2. 결정 카드 (§4-3)

- 메타 5칸 라벨: 마감 · **결정하는 사람** · **볼 수 있는 사람** · 근거 · 상태. 값은 `label()`(팀장 / 팀장만·부서 전체 / N개 / 아직 결정 안 함).
- 섹션 제목: 배경 → **무슨 일인가요** · 근거 인용 → **원문 근거** · 과거 결정과 충돌 확인 → **예전 결정과 다릅니다** · 추천 방향 → **사수의 제안**. `formatConflictBadge`: "9월 17일 결정과 충돌" → "9월 17일 결정과 다름".
- 버튼(§0-2 확정값): 결정하기 · 미루기 · 돌려보내기. 입력 라벨 "결정 사유" → "왜 그렇게 정했나요". "카드에서 결정하기 / 브라우저에서만 반영" → "여기서 결정해 보기 / 이 화면에서만 바뀝니다".
- "검증된 인용이 없어 카드 본문과 추천 방향을 표시하지 않습니다." → "원문과 맞는 근거를 찾지 못해 내용을 보여 주지 않습니다. 팀장이 확인한 뒤 다시 만들 수 있습니다."
- "근거를 확인하지 못했습니다 · 팀장 검토 필요" → "근거를 찾지 못함 · 팀장 확인 필요".
- `card-reminder.tsx` "다시 확인할 시간" 유지. "확인을 예약" → "다시 볼 시간을 정해 두기".
- 데모 안내 "안전 체험 결과는 브라우저에서만 보이며 실제 결정 원장이나 외부 채널을 변경하지 않습니다." → "여기서 누른 결과는 이 화면에만 남습니다. 진짜 결정 기록이나 슬랙에는 아무것도 보내지 않습니다."
- 4단계 안내 "다음 3/4 · 과거 결정 확인 / 충돌한 결정의 이유와 원문 근거를 원장에서 확인하세요." → "다음 3/4 · 예전 결정 보기 / 왜 다른지, 예전 결정의 이유와 원문을 결정 기록에서 확인하세요." 버튼 "결정 원장 보기" → "결정 기록 보기".

### 3. 결정 기록 (§4-4)

- 제목 "결정 원장" → "결정 기록". 부제 "무엇을 결정했는지, 왜 그렇게 정했는지. 그 맥락을 함께 남깁니다." → "무엇을, 왜 그렇게 정했는지 남깁니다." "결정의 맥락 물어보기" → "이 결정에 대해 묻기".
- U3 "판단 근거 선택": 출처(문서·회의·채널)별 `<details>`로 접고, 같은 원문 id는 한 번만(중복 제거는 `item_id` 기준, 없으면 문자열 동일 기준). 검색창 1개(이름·본문). 기본은 모두 접힘, 가장 최근 출처 1개만 펼침. 선택한 근거는 위에 칩으로 모아 보여 준다.
- "결정 정정" → "결정 고치기" + 한 줄 "이전 기록은 지우지 않고 남깁니다." 입력 "정정한 결정 결과" → "고친 결정", "정정 사유" → "왜 고치나요". "정정 이력 N건" → "고친 기록 N건". "리드타임" → "걸린 시간". "원장 #{id}" → "기록 #{id}". "보류 이력 · 후속 결정 완료" → "미룸 · 다음 결정 있음".
- "원장 반영 미리보기" → "기록에 남을 모습 미리 보기". 빈 상태: "첫 결정을 직접 남겨 보세요" / "무엇을 정했는지와 이유를 적으면 팀의 첫 기록이 됩니다."
- 출처 목록 "(결정 1 · 보류 0)" → "(결정 1 · 미룸 0)". "N개 기록 · 결정 완료 N개 · 보류 N개" → "기록 N개 · 결정 N개 · 미룸 N개".

### 4. 묻기 (§4-5) — PRD §6-5 먼저

- `docs/PRD.md` §6-5 5항의 고정 문구를 다음으로 고친다(설계 §2 "바꾸지 않는 고정 문구" 절차): 웹·DM "내가 볼 수 있는 이 부서 기록만 보고 답했습니다" / 슬랙 채널 "이 채널에서 볼 수 있는 부서 기록만 보고 답했습니다" / refused "이 질문에 답할 근거를 부서 기록에서 찾지 못했습니다. 팀장에게 결정 카드로 보낼까요?". 같은 절의 "N건 제외 표시 금지"는 그대로.
- `ask-s4.tsx`: 배지 "이 부서의 기록만 참고" → "내가 볼 수 있는 기록만 보고 답합니다". 안내 "궁금한 질문을 골라보세요. 답변 옆에서 원문 근거를 확인할 수 있습니다." 유지. "답변의 근거 · 원문 인용 N" → "근거가 된 원문 N". "범용 AI 답변 예시 · 사전 작성" → "보통 AI라면 이렇게 답합니다 · 미리 써 둔 예시". "이 부서의 기록만 참고한, 미리 준비된 답변입니다." → "이 부서 기록만 보고 미리 써 둔 답입니다."
- 오류: "답변을 만들지 못했습니다. 잠시 후 다시 질문해주세요." 유지. "현재 확인할 수 있는 근거로 답변을 표시할 수 없습니다." → "지금 볼 수 있는 기록으로는 답을 만들 수 없습니다. 질문을 바꿔 다시 물어봐 주세요." "답변 확인이 지연되고 있습니다." → "답이 늦어지고 있습니다. 잠시 뒤 질문 기록에서 확인해 주세요."
- 상태 이름표는 `label("answerStatus", …)`(refused → 근거 없음, failed → 답을 만들지 못함, pending → 찾는 중).
- `question-history.tsx` "아직 질문 기록이 없습니다." 유지. `slack-questions.tsx` "전송 재시도 필요" → "다시 보내야 함", "연결 또는 동의 상태 변경으로 전송 중단" → "연결이나 동의가 바뀌어 보내지 못함".
- 데모 `demo-questions.tsx`: "자유 질문·음성 입력 체험 / 전송 없음" → "직접 물어보기·말로 물어보기 / 서버로 보내지 않습니다". "가까운 근거 답변 보기" → "비슷한 답 찾기". "🎙 음성 질문 동작 보기"의 이모지 제거 → "말로 묻는 모습 보기". "개발 사수에게 같은 질문" 유지.

### 5. E2E

버튼·라벨 텍스트를 잡는 셀렉터(결정/보류/반려·원장·출처와 결정 보기)를 갱신한다. 게스트 완주·카드 결정·병합 E2E가 통과해야 한다.

## Acceptance Criteria

```bash
node scripts/check-wording.mjs components/dashboard-s1.tsx "app/demo/d/[dept]/page.tsx" components/demo-records.tsx "app/(auth)/d/[dept]/cards/[id]/page.tsx" "app/demo/d/[dept]/cards/[id]/page.tsx" components/card-actions.tsx components/card-reminder.tsx components/demo-safe-actions.tsx components/ledger-s3.tsx components/decision-correction.tsx "app/demo/d/[dept]/ledger/page.tsx" components/demo-document-workspace.tsx lib/conflicts.ts components/ask-s4.tsx components/question-history.tsx components/slack-questions.tsx components/demo-questions.tsx   # blocking 0
grep -n "내가 볼 수 있는 이 부서 기록만" docs/PRD.md   # §6-5 개정 확인
npm run lint && npm run test && npm run build
npm run e2e   # 게스트 완주·카드·묻기
# 실측: /demo/d/<영업>/ledger 직접 기록 → 판단 근거 선택이 출처별로 접혀 있고 중복 문장이 없다 (스크린샷)
```

## 금지사항

- 인용 검증 로직(`quote`가 원문에 포함되는지)과 refused 판정을 건드리지 마라. 이유: CLAUDE.md CRITICAL — 인용 없는 문장은 렌더하지 않는다. 이 step은 표시 문구만 바꾼다.
- 고정 문구를 PRD §6-5보다 먼저 코드에서 바꾸지 마라. 이유: 문서 우선순위(PRD → ARCHITECTURE → ADR → 코드). 작업 4의 순서를 지킨다.
- U3의 근거 후보를 줄이려고 데이터(시드·API 응답)를 바꾸지 마라. 이유: 표시 그룹화의 문제이지 데이터의 문제가 아니다. 컴포넌트에서 접고 중복을 없앤다.
- 카드 상태값(`open`·`deferred`…)이나 결정 API 페이로드를 바꾸지 마라. 이유: DB·슬랙·E2E와 묶여 있다. 라벨은 `lib/labels.ts`만.
- 이모지를 추가하지 마라. 이유: W4 — 어휘를 낮추되 유치하게 만들지 않는다. 기존 이모지(🎙)는 뺀다.
