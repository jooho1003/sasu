# phase 51 운영 반영·확인 (2026-10-07)

- 반영: PR #44(기록) → PR #45(phase 51) main 병합, 머지 커밋 `38d50a8` Vercel 상태 `success`. DB 변경 없음. 사용자 승인 2026-10-07.
- 운영 읽기 E2E(`E2E_BASE_URL=https://getsasu.com SASU_RETRO_ENABLED=true SASU_CSP_ENFORCE=true`, guest·demo-reviewer·demo-public-workspace·demo-meeting-recorder·site·security-headers): **26 passed**. 덮어쓴 과거 기록은 `git checkout`으로 되돌렸다.
- 워커: `POST /api/jobs/run`(`x-jobs-secret`) 200.

## 문서 요약 overview 운영 확인

[`check.mjs`](check.mjs)(Playwright + 시드 QA 팀장 세션, 파일럿 부서). 합성 TXT 1건("운영확인-합성-20261007.txt", 원문 5문장)을 「문서 추가」로 올려 검토 → 확정 → 요약까지 진행한 뒤 「자료 전체 삭제」로 지웠다(삭제 200, 목록에서 사라짐).

| 항목 | 결과 |
|---|---|
| 요약 상태 | `summarized` (`citation_invalid_dropped` — 모델 overview가 대체됨) |
| 한눈에 보기 | "정책: 50만원을 넘는 소모품 구매는 팀장 확인 후 진행한다. 박대리는 이번 주 금요일까지 비품 목록을 정리해 공유한다." |
| overview 문장 중 원문에 없는 것 | **0** |
| 인용 | 4 |
| 1440·390 화면 | 「한눈에 보기」 표시, 가로 넘침 없음 ([1440](document-summary-1440.png) · [390](document-summary-390.png)) |

원본: [`report.json`](report.json)(부서·자료 ID는 가림). 같은 실행에서 공개 메인·데모·대시보드·문서 화면(1440·390) 모두 200, 가로 넘침 0, 콘솔 오류 0. 대시보드에서 카드로 결정한 항목에 「→ 결정 기록」 표시(#43) 확인.

## 관찰 (후속 후보)

- 대체 경로에서는 「한눈에 보기」가 아래 「핵심 내용」·「다음 할 일」 첫 문장과 같아 반복된다(설계상 예상, ADR-090 RISK).
- 문서 머리의 "근거 N개"는 `chunk_count`(원문 조각 수)라 아래 "원문 근거 N"(인용 수)과 숫자가 달라 헷갈린다.
- 2026-10-07 이전에 정리된 문서는 예전 overview가 그대로 남는다(저장 시점 검증).
