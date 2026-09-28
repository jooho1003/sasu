# Step 0 후속: 수집 중단 감지와 암호화 저장 사전 검사

원천: PRD §3-4·§8·§11, 상세 설계 §4.1~4.2, 기존 step0. 제품 범위·서버 생성 계약을 변경하지 않는다.

## 수정 범위

- `lib/recording/capture-watchdog.ts`: 음량과 무관한 PCM 수신 진행 검사. 워커가 응답해도 5초간 샘플이 없으면 중단하고, 이벤트 루프 공백 뒤 음성을 조용히 이어 붙이지 않는다. 명시적 일시정지는 제외한다. 순수 모듈은 TDD.
- `lib/recording/browser/storage.ts`: 실제 녹음 ID를 만들기 전 합성 데이터로 AES-GCM 암호화 → IndexedDB commit → 읽기·복호화 → 삭제를 검증한다. 실패 시 수집 준비를 알리지 않는다.
- `lib/recording/browser/storage.worker.ts`: 사전 검사 뒤 ready, PCM/타이머에서 진행 검사, 중단 시 받은 샘플의 마지막 짧은 구간까지 저장한다.
- `lib/recording/browser/capture.ts`: 워커 응답 중단·오류를 종료 상태로 전달하고 트랙·잠금을 정리한다.
- 개발 실험실과 Playwright: 실제 Worker/MessagePort/IndexedDB를 사용한 입력 중단·일시정지·복구·저장 실패 검사. 합성 입력만 영속 저장한다.

## 확인할 관계와 실행 기준

수정 전후 `capture → storage.worker → RecordingSession/저장소`를 확인한다. Graft·Archify 실행 결과를 검증 기록에 연결한다. 실행 불가 범위는 명시한다.

```powershell
npx vitest run tests/recording/capture-watchdog.test.ts tests/recording/session.test.ts
npm run e2e:recording
npm run lint
$env:SASU_VERIFY_BUILD='1'
npm run build
npm test -- --maxWorkers=2 --testTimeout=15000
```

실기기 V01~V06, 운영 CSP·제공사 확인, 녹음 시작 전 영속 세션 계약, step1 이후 선행 조건은 유지한다. 이 후속의 자동 검증 통과만으로 step0 전체를 완료 처리하지 않는다.
