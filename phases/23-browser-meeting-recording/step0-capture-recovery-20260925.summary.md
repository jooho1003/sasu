# Step 0 후속 결과 — 2026-09-25

상태: 명세의 수집 중단·저장 사전 검사 보완과 자동 검증 완료. **step0 전체는 실제 기기 게이트 미충족으로 partial/pending 유지**. 운영 미반영.

- `lib/recording/capture-watchdog.ts`를 TDD로 추가했다. 무음과 입력 단절을 구분하고 5초 수신 단절·실행 공백을 감지한다. 일시정지는 제외한다.
- `lib/recording/browser/storage.ts`의 `prepareRecordingStore`는 합성 PCM으로 암호화·실제 IndexedDB 쓰기·읽기·복호화·삭제를 검사한 뒤 녹음 ID를 만든다. 워커는 이 검사 이후에만 준비 완료를 알린다.
- `storage.worker.ts`가 입력 중단 시 마지막 짧은 구간까지 저장한다. `capture.ts`는 워커 무응답·snapshot 없는 오류를 중단으로 표시하고 트랙·잠금을 해제한다.
- 실험실에 같은 저장 워커를 직접 검증하는 진입점을 추가했다. 제품 라우트는 바꾸지 않았으며 실제 입력의 영속 저장·업로드는 연결하지 않았다.

실행 결과: lint 통과(기존 문구 경고 77·차단 0), Next.js 프로덕션 빌드 통과, Vitest 140파일·1,409개 통과. 녹음 Playwright 15개 통과와 별도 3분 실시간 합성 녹음·새로고침 복구 1개 통과. 30분 분량 가속 저장·기존 두 탭·손상·quota 회귀 포함.

[전체 실행 기록·코드 관계·실패 재현](../../docs/verification/recording-capture-2026-09-25/README.md) · [Archify 구조도](../../docs/verification/recording-capture-2026-09-25/capture-flow-v2.html). Graft CLI/연결 도구와 Docker 엔진을 사용할 수 없어 Graft 전후 그래프는 없으며 수동으로 호출 관계를 확인했다. Archify는 9/9 형식 검사와 브라우저 화면 크기 4종을 통과했고 라이트·다크 이미지를 직접 검토했다.

다음 단계: V01~V06 실제 입력·장치·절전·복구 시험과 녹음 시작 전 영속 세션 계약을 해결해야 step1 이후로 진행할 수 있다. 제공사 확인·운영 CSP 관찰/승인·0058 운영 반영은 기존 gate로 남는다. 커밋·배포·운영 DB 변경은 하지 않았다.
