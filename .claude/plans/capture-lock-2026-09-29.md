# 한 탭 녹음 판정 정리 (capture-lock) — 2026-09-29

`/pdca analyze browser-meeting-recording` → 차이 G-1 → "후속 step으로 수정".

## 승인된 결정

| # | 결정 | 처리 |
|---|---|---|
| 1 | G-1은 phase 23 후속 step 명세로 고친다. 설계 §4.2 그대로이며 새 제품 결정은 없다 | `phases/23-browser-meeting-recording/step0-capture-lock-20260929.md` |
| 2 | index.json 등록·실행은 다른 세션의 phase 23 미커밋 변경이 커밋된 뒤 | 대기 |

## 조사에서 나온 사실

- `acquireCaptureLock`(`storage.ts:271-311`)의 heartbeat 쓰기 실패와 5초 넘는 타이머 정지가 `capture_lease_lost`로 녹음을 끊는다(`capture.ts:67·82`).
- `BroadcastChannel("sasu-meeting-capture")`을 읽는 코드는 없다.
- 실행 공백은 `capture-watchdog.ts`가 `capture_suspended`로 따로 감지한다.
- `execute.py`는 `step{N}.md`만 읽는다. 하위 명세는 세션이 직접 실행한다.

## 노드

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 | 상태 |
|---|---|---|---|---|---|---|
| C1 | step 명세 작성 | general | 0/0/0/1=1 | fast | main | 완료 |
| C2 | Web Locks만 남김·lease/BroadcastChannel 제거·옛 DB 정리·사례 추가 | frontend | 0/1/1/1=3 | balanced | codex terra·medium | 대기 |
| R1 | 최종 리뷰 + analyze 재실행 | review | 1/1/0/2=4→오버라이드 | powerful | main | 대기 |

## 게이트

G1 PASS · G2 PASS(R1 최종 리뷰 powerful·메인) · G3 PASS · G4 PASS(powerful 1/3=33%, 최종 리뷰 하드 오버라이드라 강등 불가) · G5 PASS(D3=2 없음) → **PASS**

## 실행

```powershell
git status --short    # 비어 있어야 한다
codex exec -m gpt-5.6-terra -c model_reasoning_effort=medium "phases/23-browser-meeting-recording/step0-capture-lock-20260929.md를 읽고 그대로 수행하라"
```
