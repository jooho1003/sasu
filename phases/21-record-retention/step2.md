# Step 2: retention-verification
## 읽어야 할 파일
- phase 21 step 0/1 산출물, docs/PRD.md §11
## 작업
보존 현황 화면·권한·만료 위험 표시·다운로드의 인용/체크섬·부분 범위 표시를 검증한다. 외부 저장소를 구매하거나 실제 Slack 내보내기/보존 설정을 변경하지 않는다. 운영 미확정 항목과 구현·검증 결과를 구분한다.
## Acceptance Criteria
`npm run lint`, `npm run build`, `npm test`, 관련 SQL/E2E 실행 및 백업 복원 기록.

## 실행 결과
개발 및 격리 검증 완료. [실행 증거](../../docs/verification/reviewed-materials-2026-09-16/README.md)를 참조한다. 운영 배포·정기 백업 설정은 완료 범위에 포함하지 않는다.
