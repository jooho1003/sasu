# Step 12: e2e-merge-aware

## 읽어야 할 파일

- `/docs/PRD.md` §6-3 ⑥(ADR-037 병합), §11 DECIDE 행("슬랙 질문 1건 + 회의 보류 1건 → 카드 1장으로 병합, 인용 링크 클릭 시 원문 도달, DM 버튼으로 결정 시 원장·스레드 공지 확인")
- `/docs/ADR.md` ADR-037
- `tests/e2e/vertical-slice.spec.ts` 전체, `playwright.config.ts`
- `app/api/d/[dept]/meetings/transcript/route.ts`(lead 전사 업로드), `lib/adapters/transcript.ts`
- `lib/pipeline/card.ts` 병합 경로

## 배경 (2026-09-13 운영 실행 기록)

운영에서 `vertical-slice.spec.ts`가 "card was not created"로 실패했다. 원인은 결함이 아니라 **병합이 정상 동작**한 것이다. 9/10 E2E 실행이 남긴 "외주사 B 견적 12% 인상" open 카드가 72h 안에 있어서, 같은 문구의 새 이벤트가 `merge_confirm=true`로 기존 카드에 인용만 추가됐다. 테스트는 매 실행 새 카드가 생긴다고 가정한다.

## 작업

1. **결정 흐름 테스트 격리**: `vertical-slice.spec.ts`의 합성 메시지를 매 실행 고유 안건으로 만든다. 예: `eventId`에서 파생한 가상 품목·금액·거래처 코드(예: "합성 품목 QA-7F3A 월 구독 증액 38만원")로 이전 실행 카드와 **다른 결정**이 되게 한다. 실데이터처럼 보이는 실제 회사명은 쓰지 마라. `[합성 QA 테스트 — 실제 업무 아님]` 접두사 유지.
   - 카드 대기 polling 실패 시 진단 메시지에 `citations`에서 해당 item이 다른 카드에 병합됐는지 조회해 `merged_into=<id>`를 포함한다(본문 출력 금지).
2. **병합 E2E 추가**: 같은 파일에 `test("슬랙 질문과 회의 보류가 카드 1장으로 병합된다")` (같은 `E2E_ALLOW_EXTERNAL_WRITES=1` 가드):
   - 고유 안건 A(1번과 같은 방식으로 run별 고유)를 슬랙 이벤트로 보내 카드 생성까지 대기.
   - 같은 안건 A를 다르게 표현한 회의 발언이 담긴 합성 `.vtt`를 lead 세션으로 `/api/d/[dept]/meetings/transcript`에 업로드(화자는 동의된 seed 멤버 표시명과 매칭되게 — 기존 라우트의 화자 매칭 규칙을 읽고 따른다). 워커 실행.
   - 판정: 회의 item이 **새 카드의 origin이 아니고**, 첫 카드의 citations에 슬랙 item과 회의 item이 모두 있다. 카드 상세 페이지에서 인용 2개가 보인다.
   - 전사 item이 decision으로 분류되지 않으면(분류 모델 판단) 테스트를 실패로 두되 메시지에 label을 포함한다. 분류를 우회하는 코드 경로를 만들지 마라.
3. **테스트 후 정리**: 두 테스트가 만든 open 카드는 테스트 끝에 lead 세션으로 `decide_request`의 `reject`를 호출해 닫는다(원장 append-only 원칙상 삭제 금지). 기존 테스트가 결정까지 가는 카드는 그대로 결정 흐름을 탄다.
4. 로컬에서는 `E2E_ALLOW_EXTERNAL_WRITES` 없이 skip되는지만 확인한다(`npx playwright test tests/e2e/vertical-slice.spec.ts` → skipped). **운영 대상으로 실행하지 마라** — 운영 실행은 오케스트레이터가 한다.

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npx playwright test tests/e2e/vertical-slice.spec.ts --list   # 테스트 2개 인식
```

## 검증 절차

1. AC 실행. 2. 체크리스트(실데이터 문자열 없음 · 로그/진단에 본문 없음 · 원장 삭제 없음). 3. index.json step 12 갱신.

## 금지사항

- 병합을 끄는 테스트 전용 플래그·env를 앱 코드에 추가하지 마라. 이유: 운영 동작을 테스트에 맞춰 바꾸는 것.
- `E2E_ALLOW_EXTERNAL_WRITES=1`로 운영 URL에 실행하지 마라. 이유: 외부 발신은 오케스트레이터의 승인 노드.
