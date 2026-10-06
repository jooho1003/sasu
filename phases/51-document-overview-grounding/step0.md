# Step 0: overview-grounding

## 읽어야 할 파일
- `/AGENTS.md` · `/docs/ADR.md` ADR-090 · `/docs/PRD.md` §8 "문서 요약 overview 근거 검증"
- `/docs/02-design/features/document-overview-grounding.design.md`
- `lib/pipeline/document-summary.ts`, 기존 테스트(`tests/`에서 `document-summary` 검색)
- `docs/verification/browser-meeting-recording/v16-2026-10-05.md`, `scripts/verify-document-injection.ts`

## 작업
1. 테스트 먼저(U1~U5) red 확인 → 구현. 항목·인용 검증·스키마·LLM 호출은 바꾸지 않는다.
2. lint·test·build. R1은 로컬 QA DB·실제 Groq가 필요하다 — 메인 체크아웃의 로컬 QA 서버/Docker를 다른 에이전트가 쓰고 있으면 실행하지 말고 "root 인계"로 기록한다.

## Acceptance Criteria
```bash
npx vitest run <document-summary 테스트>
npm run lint && npm run test
NEXT_PRIVATE_OUTPUT_TRACE_ROOT='D:\바이브코딩\sasu' npm run build
```

## 금지사항
- overview를 모델 문장 그대로 렌더하는 경로를 남기지 마라(불변: 인용 없는 문장 비렌더).
- 훅 우회·커밋·푸시 금지.
