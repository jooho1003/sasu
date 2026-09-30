# Step 3 심사위원 녹음 데모 검증 (2026-09-28)

상태: 구현·로컬 제품 브라우저 검증 완료, 운영 게이트 진행 중. 구현 입력은 [step3](../../../phases/23-browser-meeting-recording/step3.md)과 PRD REC-05다. 운영 배포는 하지 않았다.

## 구현과 경계

- `/demo/d/[dept]/reviews`에서 reviewer가 직접 누른 뒤 마이크 또는 화면의 음성 트랙을 최대 60초 녹음한다. `MediaRecorder`의 Blob URL로 이 탭에서만 재생·내려받고, 종료·새로고침 시 폐기한다. 화면의 영상 트랙은 녹음 파일에 포함하지 않는다. 권한 거절·마이크 부재 시 오류를 보여 주고 준비된 예시로 계속 진행한다.
- 별도 파일 없이 들을 수 있는 `public/demo-files/onsaemiro-sales-weekly-meeting.wav`를 포함했다. `Microsoft Heami Desktop`으로 화면의 네 문장을 읽어 만들었고 16kHz·mono, 26.23초, 839,246바이트다. `scripts/generate-demo-meeting-audio.ps1`가 생성 원문을 보존한다.
- 예시 음성의 받아쓴 글·수정·확정·요약은 **가상 회의 자료**라고 표시한다. 직접 녹음한 음성과 연결하지 않는다. 요약의 세 근거 문자열이 수정한 글에 모두 남아 있을 때만 요약을 표시한다.
- 이 데모 컴포넌트는 녹음·수정 내용을 IndexedDB, DB, Storage, LLM 또는 앱 API로 보내는 경로를 갖지 않는다. 기존 파일 예시 5개는 유지한다.

## 실행 기록

| 검사 | 결과 |
|---|---|
| WAV 헤더·크기 | 16kHz, mono, 26.23초, 839,246바이트 확인 |
| 문구 검사 | 차단 0건. 원본 발화인 `영업 리드`는 음성과 일치시키기 위해 주석 예외 |
| Chrome 제품 E2E, CSP 보고·강제 각각 | 두 모드 모두 2건 통과. 직접 녹음 재생·실제 다운로드 바이트, 권한 거절 대체 흐름, 새로고침 폐기 확인. 녹음 중 쓰기 네트워크·IndexedDB 열기 0. 실행 전후 `review_recordings`·`reviewed_materials`·`jobs`·`llm_calls`·`storage.objects` 건수 동일 |
| 심사위원 자동 로그인·전체 기능 지도·기존 기능 | Chrome 제품 E2E 5건 통과. 모든 기능 URL과 비동기 화면 로딩, 앱 요청·직접 DB 쓰기 거부, 390px 화면, 카드·원장·묻기·기존 자료 검토 체험 확인 |

[실제 Chrome 화면 캡처](step3-demo-local.png)에는 로컬 녹음 플레이어와 독립된 합성 음성·받아쓴 글·원문 근거가 보인다. 환경의 실제 시스템 소리 공유는 테스트하지 않았으므로 지원으로 판정하지 않는다.
