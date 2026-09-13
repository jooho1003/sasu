# Step 13: design-team-demo

## 읽어야 할 파일

- `/docs/PRD.md` §6-7 게스트 모드, §8-3(게스트는 합성 데이터만), CLAUDE.md "게스트 라우트는 LLM 호출 0회, 쓰기 0건, 우리 팀 실데이터 0건"
- `docs/05-qa/team-workflows.qa-plan.md`, `docs/05-qa/team-workflows.qa-report.md` (디자인팀 미제공을 누락으로 보고)
- `scripts/seed-demo.ts` 전체 (기존 영업·개발·기획팀 구조, 고정 UUID 규칙, prepared answers, 카드·원장·충돌 시드)
- `tests/e2e/team-coverage.spec.ts` (디자인팀 데모 요구), `tests/e2e/guest.spec.ts`
- `app/demo/page.tsx`, `demo_departments` RPC가 있는 마이그레이션(grep)

## 작업

게스트 데모에 **디자인팀**을 추가해 `team-coverage.spec.ts`의 기획·디자인·개발 세 팀 완주를 성립시킨다.

1. `scripts/seed-demo.ts`에 온새미로 주식회사 **디자인팀** 부서를 기존 팀과 같은 구조로 추가:
   - 고정 UUID 계열을 기존 규칙과 겹치지 않게 새로 정한다(예: `40000000-…`). 기획팀처럼 `dddddddd-…` 식 부서 id 규칙이 있으면 따른다.
   - 소스: 슬랙 채널 1(dept) · 회의 전사 1 · 노션 원칙 문서 1 · leads_only 소스 1(데모 장면 4 권한 차등 유지)
   - 합성 대화 20~30건: 시안 변경 승인, 접근성 기준(터치 최소 48px 등), 브랜드 가이드 예외, 출시 일정에 따른 시안 컷, 외주 일러스트 계약 등 **디자인 업무 맥락**. 실존 인물·회사·제품명 금지.
   - open 카드 2장 이상(1장은 슬랙+회의 이중 인용 — 병합 장면), 원장 결정 3건 이상, 원칙과 충돌 1건(배지 표시), prepared answers 6건(lead·member 차등 답변 쌍 포함, 모든 답변에 원문 포함 인용).
   - 기존 팀 시드의 멱등성(데모 org truncate 후 재생성)을 유지한다.
2. `team-coverage.spec.ts`는 수정하지 마라(요구의 원천). `guest.spec.ts`가 부서 수를 고정 가정하면 4개 부서에 맞게만 고친다.
3. 로컬 검증: 로컬 Supabase가 없으면 `seed-demo.ts`를 실행하지 말고, 시드 데이터 구조 단위 테스트(있으면 확장, 없으면 `tests/seed-demo.test.ts` 신설 — 시드 정의를 import해 디자인팀 존재·인용 quote가 item content에 포함·leads_only 소스 1개·prepared answer 인용 존재를 검사)로 대신한다. 시드 정의가 import 불가능한 구조면 데이터 정의를 `scripts/seed-demo-data.ts`로 분리한다(동작 불변).

## Acceptance Criteria

```bash
npm run lint
npx tsc --noEmit
npm run test
npm run build
```

## 검증 절차

1. AC 실행. 2. 체크리스트: 합성 데이터만 · 실데이터 문자열 0 · 게스트 LLM 0회(시드는 사전 스냅샷) · 인용 quote ⊂ content. 3. index.json step 13 갱신.

## 금지사항

- 운영 DB에 시드를 실행하지 마라. 이유: 승인 노드(오케스트레이터 실행).
- 다른 팀을 디자인팀으로 재명명하지 마라. 이유: QA 계획이 명시적으로 금지.
- 시드에서 LLM을 호출하지 마라. 이유: 게스트 모드 비용 $0 원칙.
