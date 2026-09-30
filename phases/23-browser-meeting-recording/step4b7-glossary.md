# Step 4-B7: 부서 용어집

- 설계: `docs/02-design/features/browser-meeting-recording.design.md`의 4-B7 대조 목록. 원천: PRD ACC-02, 상세 설계 §11.3.
- 대상: 신규 migration과 순수 예산 모듈(TDD), 세션 route·부서장 화면, 녹음 전사·문서 요약 워커.
- 부서 구성원은 자기 부서 용어를 읽고, 동의한 부서장만 수정한다. 서버에서 마스킹 후 저장한다. 사람 이름·연락처를 넣지 않도록 안내하고 민감 패턴을 거부한다.
- 최근 수정 용어부터 Whisper prompt의 224토큰 예산을 넘지 않게 고른다. 요약 표기 기준에도 같은 용어를 쓴다. ASK 음성은 영향받지 않는다.
- 검증: 예산·중복·민감 패턴 순수 테스트, 역할별 SQL, route, 전사/요약 전달, lint/build/test, 기존 경로 회귀.
