# Step 0: source-condition-checklist

## 읽어야 할 파일

- `docs/PRD.md` §3-3 AG-04~06·§8
- `docs/ARCHITECTURE.md` §3·§6 불변식, `docs/ADR.md` ADR-077~079
- `docs/02-design/features/sales-review-condition-checklist.design.md` 전체
- `lib/sales-review-sources.ts`, `lib/sales-review-literal-comparison.ts`
- `app/api/d/[dept]/sales-review/compare/route.ts`, `components/sales-review-sources.tsx`
- `phases/39-sales-review-literal-comparison/step0.summary.md`

## 작업

1. 신규 순수 모듈의 테스트부터 작성해 실패를 기록한다. 설계 §3·4의 응답과 ADR-079의 단어/전체 줄·한도를 구현한다.
2. 세션 POST에서 기존 strict selection·AG-04 검증·현재 RLS 조회를 사용한다. lead·동의·비데모·실패 응답·no-store를 확인한다.
3. 기존 원문 화면에 조건 질문 버튼·주제·인용·링크·빈 주제·제한 안내·이전 결과 제거를 연결한다.
4. 인증 브라우저와 기존 원문/문구/합성/게스트 회귀, 단위·lint·build를 실행한다.
5. PDCA analyze/report와 실제 실행 기록을 연결하고 phase 상태를 갱신한다.

## 코드 관계와 구조 확인

화면→checklist POST→membership/demo→세션 items/sources RLS→원문 검증→순수 탐색→evidence 링크를 전후 확인한다. Graft·Archify가 없으면 실제 코드 수동 추적·설계 Mermaid와 누락을 기록한다. 산출물은 `docs/verification/sales-review-condition-checklist-2026-10-01.md`.

## Acceptance Criteria

```powershell
npx vitest run tests/sales-review-condition-checklist.test.ts tests/sales-review-condition-checklist-route.test.ts
npm run lint
node scripts/review-qa.mjs build
npm run test
node scripts/review-qa.mjs sales-review-checklist-test
node scripts/review-qa.mjs sales-review-compare-test
node scripts/review-qa.mjs sales-review-sources-test
node scripts/review-qa.mjs sales-review-test
node scripts/review-qa.mjs guest-test
git diff --check
```

UI 성공/선택 변경/실패 후 숨김·정확 인용·링크·타 부서 404/member·미동의·demo 403·원문 비활성 거절·쓰기 및 LLM 증가 0을 실행 기록으로 확인한다. Docker/인증 환경 장애가 끝까지 남으면 브라우저 미검증으로 표시하고 완료 처리하지 않는다.

## 금지사항

원칙 충돌·가격 계산·승인 사실을 생성하지 않는다. 사용자 경로 service role, 가시성 복제, 로그 원문, 새 job/LLM/DB 쓰기를 추가하지 않는다. 운영 migration·배포를 실행하지 않는다. 기존 미추적 Supabase 설정을 변경하지 않는다.
