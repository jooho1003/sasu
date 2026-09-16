# Step 1: review-processing

## 읽어야 할 파일
- docs/PRD.md §3-3·§8, docs/ADR.md ADR-054
- lib/llm.ts, lib/mask.ts, lib/adapters/document.ts, lib/jobs.ts
- phase 20 step 0 마이그레이션

## 작업
먼저 tests에 신규 lib 모듈 테스트를 작성한다. 구간 계획·WAV 변환·검토 계약·마스킹·출처 구분·텍스트 내보내기와 세션 API를 구현한다. 음성 변환은 llm.transcribeAudio만 사용한다. 원문을 로그/영속 job payload에 저장하지 않는다. 문서도 초안을 거쳐야 한다.

## Acceptance Criteria
`npm test -- tests/reviews.test.ts tests/adapters/review-audio.test.ts` 및 신규 API 테스트.

## 실행 결과
개발 및 격리 검증 완료. [실행 증거](../../docs/verification/reviewed-materials-2026-09-16/README.md)를 참조한다. 운영 배포·정기 백업 설정은 완료 범위에 포함하지 않는다.
