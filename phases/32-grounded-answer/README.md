# Phase 32 — ASK 질문 → 결정 → 원문 확인 (ADR-066 · ADR-067)

> 2026-09-23 후속: 사용자가 운영 적용·자동 배포를 승인하여 DB·배포·운영 웹 ASK/원문 강조 확인까지 실행했다. 아래는 최초 step 실행 조건이며, 현재 상태는 [운영 검증 기록](../../docs/verification/release-completion-2026-09-23/README.md)을 따른다. Slack 실제 발송 등 남은 범위는 완료로 처리하지 않는다.

- 원천: PRD §3 "ASK 근거 확인 보완" · §6-5 · §8 · ADR-066 · ADR-067 · ARCHITECTURE §1 Q&A 줄·§3.5
- step0(9/22): 관련 결정 검색·원문 열람·완전 문단 인용. 완료. 운영 미적용.
- step1~4(9/23): 설계 검토에서 나온 결함을 고친다. 모델은 번호 범위만 고르고 코드가 인용을 원문에서 자른다. 같은 출처는 연속 문단 범위로 고른다. 본문은 고정 안내 문장이다. 결정 검색 단어 추출을 고치고, 원문 화면에 인용 부분을 표시한다.
- 플랜: `.claude/plans/grounded-answer-selection-2026-09-23.plan.json` (게이트 PASS)

## 실행 순서와 의존

| step | name | 의존 | 비고 |
|---|---|---|---|
| 0 | grounded-answer | — | 완료 (9/22) |
| 1 | answer-selection | — | 계약·`lib/answer-grounding.ts`(TDD)·`lib/pipeline/answer.ts`·실제 모델 평가 before/after |
| 2 | decision-search-terms | — | 0054 · 권한 절은 0053과 같게 유지 |
| 3 | evidence-highlight | 1 | 원문 링크 `?answer=` · 인용 부분 표시 |
| 4 | verification | 1, 2, 3 | 전체 검증·기록 · 완료 시 **blocked** (운영 반영은 사람 판정) |

step1과 step2는 서로 파일이 겹치지 않는다. step3은 step1이 바꾼 `lib/pipeline/answer.ts`의 링크 부분을 이어서 고친다.

## 실행 전 조건

- `scripts/execute.py`는 `feat-32-grounded-answer` 브랜치에서 step마다 `git add -A`로 커밋한다. 실행 전에 step0 변경과 ADR-067 설계 문서를 커밋하고, 다른 세션의 미커밋 변경이 작업 트리에 없는지 확인한다.
- 실제 모델 평가(step1)와 로컬 실DB E2E(step4)는 `GROQ_API_KEY`·`VOYAGE_API_KEY`와 Docker(로컬 Supabase)가 필요하다. 없으면 해당 step은 `blocked`로 멈춘다.

```bash
py -3 scripts/execute.py 32-grounded-answer
```

## 공통 규칙

- 검증 기록은 `docs/verification/grounded-answer-selection-2026-09-23/README.md` 하나에 step별 절로 모은다. 9/22 기록(`grounded-answer-2026-09-22/`, `answer-grounded-live.json`)은 덮어쓰지 않는다. 9/22 기록은 "보완 전" 근거다.
- 질문 원문·근거 원문·Slack 본문을 로그·요약·재시도 지시에 넣지 않는다. 실패는 코드와 번호로만 남긴다.
- 평가 자료는 모두 합성 자료다. 실제 팀 데이터를 쓰지 않는다.
- 운영 DB 적용·배포·Slack 실제 발송을 하지 않는다.
