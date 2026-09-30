# 녹음 화면 UI/UX 개선 — 2026-09-29

"ui/ux 검토해줘" → (녹음 화면·QA 페이지 둘 다) → "step으로 정리해줘" → 시작 단계 "준비·시작을 한 번의 클릭으로", 초안 "이대로 생성".

## 승인된 결정

| # | 결정 | 처리 |
|---|---|---|
| 1 | ADR-071: `녹음 시작` 한 번으로 입력 선택 → 세션 → 키 → 사전 검사 → 캡처. 취소하면 세션 없음. 불변식 30 유지 | ADR·PRD 1.18·설계 §4.1·phase 23 step2 반영(A1 완료) |
| 2 | `녹음 종료` 확인은 화면 안 두 단계 버튼 | step 2 명세 |
| 3 | 새 task `33-recording-ux`로 분리 | `phases/33-recording-ux/`, `phases/index.json` |

## 조사에서 나온 사실

- `MeetingRecorder.recover`가 `cause.message === "recording_unavailable"`로 로컬 자료 삭제를 분기한다(`meeting-recorder.tsx:317`). 그래서 모든 step이 "던지는 코드는 그대로, 표시할 때만 변환"을 금지사항으로 갖는다.
- Graft는 JSX 사용을 호출 관계로 잡지 않는다. `graft grep`으로 사용처를 확인했다([기록](../../docs/verification/recording-ux-2026-09-29/README.md) §3).
- `execute.py`는 step마다 `git add -A`로 커밋한다. 다른 세션의 phase 23 미커밋 변경을 먼저 정리해야 한다.
- `execute.py`는 step의 `codex_model`·`effort`로 모델을 바꾼다. index.json에 `gpt-5.6-terra`·`medium`을 넣었다.

## 노드

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 | 상태 |
|---|---|---|---|---|---|---|
| A1 | ADR-071·PRD 1.18·설계·phase 23 step2 반영 | general | 0/2/0/2=4→아키텍처 | powerful | main | 완료 |
| S0 | recorder-copy (TDD) | frontend | 1/1/1/1=4 | balanced | codex terra | 대기 |
| S1 | recorder-start (ADR-071) | frontend | 0/1/1/1=3 | balanced | codex terra | 대기 |
| S2 | recorder-safety | frontend | 1/1/1/1=4 | balanced | codex terra | 대기 |
| S3 | recorder-flow | frontend | 1/1/1/1=4 | balanced | codex terra | 대기 |
| S4 | segment-player | frontend | 0/1/1/1=3 | balanced | codex terra | 대기 |
| S5 | recording-entry-switch (V19) | frontend | 0/1/1/1=3 | balanced | codex terra | 대기 |
| S6 | review-detail-notices | frontend | 0/1/1/1=3 | balanced | codex terra | 대기 |
| S7 | admin-recording-switch | frontend | 0/1/1/1=3 | balanced | codex terra | 대기 |
| S8 | ux-verification | qa | 0/1/0/1=2 | balanced | codex terra | 대기 |
| R1 | 최종 리뷰 | review | 2/2/0/2=6 | powerful | main | 대기 |

## 게이트

G1 PASS · G2 PASS(A1 아키텍처·R1 최종 리뷰는 powerful·메인) · G3 PASS · G4 PASS(powerful 2/11=18%) · G5 PASS(D3=2 없음) → **PASS**

## 실행

```powershell
git status --short        # 비어 있어야 한다 (phase 23 작업 커밋 뒤)
python scripts/execute.py 33-recording-ux
```
