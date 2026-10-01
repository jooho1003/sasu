# Step 10 — 데스크톱 일 맡기기

- 실행일: 2026-10-02
- 범위: 팀장 전용 자료 올리기·영업 원문 검토 IPC 화면

## 통과

- `npm --prefix desktop run lint`
- `npm --prefix desktop test` — 4 파일, 20 테스트 통과
- `npm --prefix desktop run build`
- `npm run lint` — 오류 0 (기존 경고 2건)
- `npm run test` — 183 파일, 1,834 테스트 통과
- `npm run build`
- `npm run check:wording` — 이번 변경의 차단 항목 0
- 렌더러 정적 검사와 `git diff --check` — 출력 0줄

## 로컬 QA E2E 실패 기록

`SASU_DESKTOP_E2E=1 npm --prefix desktop run e2e -- --grep "팀장 기기는 자료"`를 세 번 실행했다. 팀장 Electron 기기 로그인·일 맡기기 화면·원문 후보 화면과 캡처는 열렸고, DB에는 작은 문서 자료 행과 `review_parts` 처리 행이 생겨 `original_uploaded=true`·`ready`까지 진행됐다. 그러나 `upload:review` IPC는 호출자에게 `network: 서버에 연결하지 못했습니다.`를 반환했다. 같은 QA 사용자·기기 연결을 사용한 독립 HTTP 요청은 `/api/companion/reviews`에서 201을 반환해, 서버 라우트나 Storage 권한만의 실패로 단정할 수 없다.

기기 연결 직후 폴링이 세션을 지우는 경쟁을 막고, transient network/timeout 재시도를 추가했지만 IPC 반환 오류는 남았다. 이 때문에 요구된 음성 구간 202·영업 원문 4건 요청의 멱등·팀원 IPC 403을 한 번의 통과 E2E 기록으로 남기지 못했다. Step 10 상태는 `error`다.

현재 남은 원인은 Electron main process의 `upload:review` 내부 API 호출 응답 경로다. 다음 시도에서는 API 호출 단계별 코드만 남기는 안전한 진단을 추가하고, `create_review`·Storage 업로드·`queue_review_part`의 IPC 반환 경계를 각각 분리해 확인해야 한다.

Graft와 Archify 명령은 현재 셸에서 발견되지 않아 실행 결과가 없다.
