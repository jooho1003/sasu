# Step 4-B5: 인용에서 녹음 위치로 이동

설계: [browser-meeting-recording.design.md](../../docs/02-design/features/browser-meeting-recording.design.md) 4-B5. 범위: PRD §3-4 ACC-01·§8, 상세 설계 §11.2, ADR-072.

## 사용자 결과

- 발행된 녹음의 답변·문서 요약·결정 카드·원장 인용 칩을 누르면 해당 검토 구간으로 이동하고 시작 시각에서 원본을 들을 수 있다.
- 일반 자료, 권한이 없는 사용자, 발행 뒤 초안이 달라진 녹음, 원본이 삭제된 녹음은 현재 원문 링크를 유지한다.

## 구현

1. Graft로 답변·문서·카드·원장 인용 API와 검토 화면의 호출 관계를 확인한다.
2. `lib/recording/citation-location.ts`의 순번→구간 변환 테스트를 먼저 작성한다. Postgres `publish_review`의 2,400 유니코드 문자 청크·공백 청크 건너뛰기와 일치해야 한다.
3. 세션 클라이언트와 RLS로 읽은 검토 자료만 위치 대상으로 사용한다. 응답의 quote 원문 검증은 유지한다.
4. 검토 화면에서 지정된 구간으로 이동하고 기존 재생 버튼을 사용한다. 원본 접근은 기존 단회 허가 API가 계속 판정한다.
5. route·브라우저 검증, lint·build·test, Graft 이후 관계, Archify 흐름을 기록한다.

운영 반영과 migration 적용은 이 step에 없다.
