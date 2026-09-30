# Step 4-B6: 검증된 문서 추출 결과의 인용 보존 병합

- 설계: `docs/02-design/features/browser-meeting-recording.design.md`의 4-B6 대조 목록. 원천: PRD ACC-03, 상세 설계 §11.4·V16.
- 대상: `lib/pipeline/document-summary.ts`, 해당 단위·워커 테스트.
- 순서: chunk별 모델 응답을 각 chunk 원문으로 검증한다 → 검증된 결과만 한 번 더 구조화 모델로 병합한다 → 병합 결과를 전체 원문으로 검증한다 → 인용 0개면 실패로 저장한다.
- 합치기 전후 같은 item에 속한 서로 다른 문장은 보존하고, 완전히 같은 문장만 중복 제거한다. 원문 속 지시문은 명령으로 따르지 않는다.
- 검증: 거짓 인용·거짓 문장 제거, 같은 chunk의 여러 결정 보존, chunk 2개에서 병합 호출 1회, 단일 chunk 기존 동작, lint/build/test, 기존 문서 흐름 회귀.
- Graft/Archify는 사용 가능 여부를 확인하고, 없으면 수동 의존·흐름 검토와 누락 범위를 검증 기록에 남긴다.
