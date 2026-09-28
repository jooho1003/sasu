# 녹음 수집 중단·복구 후속 — 2026-09-25

Phase 23 step0의 수집·로컬 복구 경계를 보완했다. [작업 명세](../../../phases/23-browser-meeting-recording/step0-capture-recovery-20260925.md)는 PRD §3-4·§8·§11과 상세 설계 §4.1~4.2에 따른다. 실제 기기 검증, 제품 녹음 화면, 서버 생성/finalize 계약과 운영 반영은 이 결과로 완료 처리하지 않는다.

## 구현과 재현

- `CaptureWatchdog`는 음량 대신 수신 샘플 수를 본다. 워커가 타이머를 계속 실행해도 5초간 PCM이 오지 않으면 `capture_input_stalled`로 중단한다. 5초를 넘는 실행 공백은 다음 PCM을 받기 전에 `capture_suspended`로 처리한다. 무음 PCM은 정상 입력이고 명시적 일시정지·재개에는 새 수신 대기 시간을 적용한다. 새 순수 모듈은 테스트를 먼저 작성했다.
- `prepareRecordingStore`는 용량 추정 확인 뒤 임시 ID에 작은 합성 PCM을 암호화해 실제 IndexedDB에 commit하고 읽기·복호화·삭제까지 확인한다. 성공해야 실제 녹음 ID를 만들고 워커가 `ready`를 보낸다. 전사 원문·실제 음성·서버 요청은 없다. 저장 용량 오류, 복호화 오류, 암호화 권한이 없는 키를 검사했다.
- 저장 워커는 수신 중단 시 기존 `RecordingSession.interrupt()`와 `store.finish()`를 사용해 마지막 짧은 구간을 보존한다. 워커 자체의 응답이 끊기면 페이지가 5초 이후 트랙·타이머·잠금을 정리하고 중단 상태를 표시한다. 이때는 마지막 확인 구간까지만 복구하며 미확인 PCM 보존을 약속하지 않는다. snapshot 없는 워커 오류도 화면에 종료 상태를 전달한다.
- 실제 입력은 기존 5초 메모리 음량 시험만 유지했다. 새 저장·복구 검사는 합성 데이터만 사용했고 제품 라우트·DB migration·LLM 경로는 바꾸지 않았다.

구현 전 순수 모듈 테스트는 모듈 부재로 실패했다([TDD red](unit-red.txt)). 기존 워커는 PCM 한 번을 받은 뒤 추가 입력이 없어도 종료되지 않았고, 8초 검사 제한에 도달했다([브라우저 red](browser-red.txt)). 첫 red 실행의 저장 오류 두 사례는 미구현 함수 호출도 잡아 통과할 수 있었으므로, 실제 chunk 쓰기·복호화 호출 횟수를 검사하도록 보강했다. 최종 결과는 보강된 검사 기준이다.

## 실행 결과

Windows / Playwright Chromium 153.0.8010.12. SQL·서비스 제공사 호출 없이 브라우저의 실제 Worker·MessagePort·IndexedDB·Web Crypto를 사용했다.

| 검사 | 결과 | 근거 |
|---|---|---|
| 순수 진행 검사·기존 체크포인트 | 2파일 11개 통과 | [단위](unit-targeted.txt) |
| 녹음 브라우저 전체 | 15개 통과, 선택적 3분 검사 1개 제외 | [전체](browser-all.txt) |
| 3분 실시간 합성 녹음 후 새로고침 | 별도 1개 통과, 181,191ms·180구간·2,880,000샘플 복구 | [로그](browser-realtime.txt)·[수치](realtime-recovery.json)·[화면](realtime-recovery.png) |
| 30분 분량 가속 저장 | 28,800,000샘플·1,800구간·불일치 0 | [결과](endurance.json) |
| 워커 무응답·트랙 해제·잠금 해제·새 녹음 | 통과, 저장된 구간 복구 가능 | [복구 화면](worker-timeout-recovery.png) |
| lint | 통과, 문구 차단 0·기존 경고 77 | [로그](lint.txt) |
| 프로덕션 빌드 | Next.js 16.3.4 컴파일·타입 검사·페이지 생성 통과 | [로그](build.txt) |
| 전체 단위 테스트 | 140파일 1,409개 통과 | [로그](unit-all.txt) |

30분 검사는 가속 합성 저장이며 실제 30분 기기 녹음·청취 검사가 아니다. 3분 검사는 실제 시간을 경과시켰지만 입력은 합성이다. 기존 tests가 과거 기록 경로에 쓰는 캡처·JSON은 이번 디렉터리로 복사한 뒤 기존 기록을 복원했다.

```powershell
npx vitest run tests/recording/capture-watchdog.test.ts tests/recording/session.test.ts
npm run e2e:recording -- --reporter=line
$env:E2E_RECORDING_REALTIME='1'
npm run e2e:recording -- tests/recording/realtime-recovery.spec.ts --reporter=line
npm run lint
$env:SASU_VERIFY_BUILD='1'
npm run build
npm test -- --maxWorkers=2 --testTimeout=15000
```

## 코드 관계와 구조도

수정 전 실제 소스에서 `capture → storage.worker → RecordingSession → openRecordingStore`와 `AudioWorklet → MessagePort → worker`를 확인했다. 기존 워커의 타이머 검사는 이벤트 루프 공백만 확인하고, 저장 준비 검사는 헤더 쓰기·읽기만 확인했다. 변경 후 흐름은 `worker → prepareRecordingStore → 암호화/IndexedDB/복호화`가 ready보다 먼저이며, `PCM/200ms timer → CaptureWatchdog → interrupt/finish`와 `page → worker 응답 검사 → cleanup`으로 이어진다. `RecordingSession`, 암호화 형식, 원본 RLS·키 발급 규칙은 유지한다.

Graft 실행 파일과 연결 도구를 찾지 못했고 이전 검증에서 사용한 Docker도 엔진이 꺼져 있어 접근할 수 없었다([환경 확인](graft-environment.txt)). 이번 변경의 Graft 전후 그래프는 없다. 파일·호출 관계를 직접 검토한 범위이며 과거 그래프를 현재 결과로 사용하지 않았다.

Archify 2.17 로컬 패키지를 사용했다. 첫 후보는 가독성 검사를 통과하도록 폭을 조정한 뒤 생성했으나 브라우저에서 세로 넘침이 발견됐다([첫 브라우저 영수증](archify-visual.json)). 새 후보에서 메시지 간격을 정리하고 본문과 겹치는 설명 카드를 제거했다. 최종 [명세](capture-flow-v2.json)와 [실행 흐름 HTML](capture-flow-v2.html)은 [9/9 검증](archify-validate-v2.json)·[delivery 영수증](archify-delivery-v2.json)·[브라우저 영수증](archify-visual-v2.json)으로 연결된다. 다이어그램 검증은 녹음 기능 검증과 별개다.

- diagram_type: `sequence`
- specification_sha256: `815870a571142f9bee81fe61eb656987f9904191bd482d92342939bb66ea4b81`
- artifact_sha256: `d543e86dfa8f485312af316ce565cca80e9b48637e77ba7691e2f11ac4568b5c`
- validation: 9/9 showcase, 오류 0·경고 0
- browser_evidence: passed, 1440×900·1600×1000·1920×1080·2048×1320 넘침 0
- visual_review: 이미지 도구로 1440×900 라이트·2048×1320 다크의 노드·라벨·화살표·범례 잘림과 겹침 없음을 확인했다. 별도 사람 검수나 내보내기 검증은 아니다. 자동 영수증의 `visualReview: pending`은 유지했다.

작성 문구는 한국어이며 도구의 고정 뷰어 UI와 HTML lang은 영어다. 형식·시각 보정은 폭 조정 1회, 세로 배치 보정 2회(첫 높이 조정에서 마지막 메시지 범위 초과)였다.

## 남은 게이트

V01~V06의 실제 Windows Chrome/Edge 마이크·Meet·Zoom 공유 음성·장치 분리·절전·프로세스 종료·장시간 청취, 녹음 시작 전 영속 세션과 키 발급의 계약, step4-A의 제공사 확인·운영 CSP 관찰과 승인은 남아 있다. Step1 → step2 → step4-B → step3의 선행 조건을 바꾸지 않는다. 이번 결과를 제품 녹음 기능 전체 완료로 표시하지 않는다. 운영 배포·운영 DB 변경·커밋·외부 메시지 발신은 실행하지 않았다.
