# ASK 문단 선택 보완 (ADR-067) — 2026-09-23

"설계가 제대로 되어 있는지 확인해줘" → 검토 → "진행해 줘".
ADR-066(phase 32 step0)을 코드와 대조한 검토에서 고칠 것 3개와 작은 문제 4개가 나왔다. 설계(D0)는 끝났다. S1~S4는 Codex가 `phases/32-grounded-answer/`로 실행한다. 운영 DB와 배포는 플랜 밖이다.

## 검토 결과 → 노드

| 검토 항목 | 처리 |
|---|---|
| 같은 출처 1문단 제한으로 예외 조항 누락·정답 거절 | S1: 연속 문단 범위 허용 |
| 모델이 최대 2,400자 문단을 그대로 베낌 · JSON 이중 인코딩 · 근거 두 번 전송 | S1: 번호 범위 선택, 코드가 인용 생성, 단일 인코딩 |
| 본문과 인용이 같은 글 두 번 · Slack 길이 한도 | S1: 본문은 고정 안내 문장 |
| 재시도 지시에 실패 이유 없음 | S1: 실패 코드 전달 |
| 단어 일치: 조사 불일치 · 가나다순 32개 자르기 | S2: 0054 |
| 원문 화면이 인용 부분을 표시하지 않고 문구가 사실과 다름 | S3 |
| phase 32가 하네스 인덱스에 없음 | D0에서 등록 |
| 조각 경계 조건 · 앞뒤 조각 이동 · 유사도 0.25 | 범위 밖(ADR-067 후속 과제) |

## 노드

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| R0 | 설계 검토 | review | 2/2/0/2=6 | powerful | main (완료) |
| D0 | ADR-067·PRD·ARCHITECTURE·플랜·step 파일 | general | 1/2/1/2=6 | powerful | main (완료) |
| S1 | answer-selection | general | 1/1/1/1=4 | balanced | codex terra |
| S2 | decision-search-terms (0054) | general | 0/1/1/1=3 | balanced | codex terra |
| S3 | evidence-highlight | frontend | 1/1/0/1=3 | balanced | codex terra |
| S4 | verification (완료 시 blocked) | qa | 0/1/1/1=3 | balanced | codex terra |
| R1 | 최종 리뷰 | review | 2/2/0/2=6 | powerful | main (위임 금지) |

의존: S1·S2는 D0 뒤 서로 독립. S3는 S1 뒤(`answer.ts` 링크 인자). S4는 S1~S3 뒤.

## 게이트

- G1 완전성: PASS
- G2 오버라이드: PASS — R0·D0·R1은 powerful + 위임 안 함. S2가 권한 절을 바꾸게 되면 security로 재배정한다
- G3 클램프: PASS
- G4 비용: PASS — powerful 3/7 = 43%. 초과 근거: 세 노드 모두 하드 오버라이드 + never_delegate. 실행 노드는 전부 balanced
- G5 안전: PASS — D3=2 없음. 운영 DB·배포는 사용자 승인

결과: **PASS**

## 실행 전 조건

`scripts/execute.py`는 `feat-32-grounded-answer` 브랜치에서 step마다 `git add -A`로 커밋한다. 실행 전에 step0 변경과 이번 설계 문서를 커밋해 작업 트리를 비우고, 다른 세션의 미커밋 변경이 없는지 확인한다.

```bash
py -3 scripts/execute.py 32-grounded-answer
```
