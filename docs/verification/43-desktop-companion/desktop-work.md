# Step 10 — 데스크톱 일 맡기기 검증

- 실행일: 2026-10-02 KST
- 범위: 팀장용 자료 올리기와 영업 원문 검토, 서버 발급 ID 파싱 경계
- 환경: `node scripts/review-qa.mjs build` 뒤 로컬 QA 서버 `http://127.0.0.1:3011`, 로컬 Supabase, Electron

## 결과

`desktop/tests/e2e/work.spec.ts`를 포함한 Electron E2E 4건이 통과했다.

1. 팀장 기기가 작은 `.txt` 자료를 등록(201)하고 원본을 비공개 Storage에서 확인했다. 구간 작업은 202로 등록됐고, 워커 선처리에 대비해 `queued`·`processing`·`done`·`ready` 중 상태와 jobs 행 존재를 확인했다.
2. 팀장 기기가 2초 합성 WAV 원본과 구간을 등록(201/202)하고 Storage의 `original`·`parts/0.wav`를 확인했다.
3. 서로 다른 원문 4건으로 영업 검토를 요청(202)하고 같은 `request_id` 재요청이 같은 `task_id`를 돌려주는 것을 확인했다.
4. 팀원 기기에서는 두 구역이 렌더되지 않았고, `members:list`·`sales:sources`·`upload:review` IPC 직접 호출 모두 `lead_only`로 거부됐다.

화면 기록: [팀장 일 맡기기](screenshots/desktop-work-lead.png), [팀원 제한 안내](screenshots/desktop-work-member.png).

## 서버 ID와 오류 경계

`queue_review_part`가 만드는 결정적 작업 ID는 RFC 4122 variant가 아닐 수 있다. 따라서 앱이 서버에서 받은 불투명 ID는 `z.guid()`로 받고, 앱이 직접 만드는 `crypto.randomUUID()` ID는 그대로 사용한다. 응답 스키마 오류는 더 이상 네트워크 오류로 바꾸지 않고 `invalid_response`으로 구분하며 재시도 대상이 아니다.

## 실행 기록

```text
npm --prefix desktop run lint                 PASS
npm --prefix desktop test                     PASS (5 files, 22 tests)
npm --prefix desktop run build                PASS
node scripts/review-qa.mjs build              PASS
SASU_DESKTOP_E2E=1 npm --prefix desktop run e2e  PASS (4 tests)
```

이번 step은 이미 존재하는 renderer → preload → main IPC → Bearer API 흐름의 검증·보완 범위여서 새 구조나 실행 흐름을 추가하지 않았다. 따라서 Graft/Archify 실행 결과는 없다.
