# Step 1: encrypted-backup
## 읽어야 할 파일
- docs/PRD.md §8, docs/planning/Slack_기록보존_백업_운영안.md §7~8
- scripts/review-qa.mjs
## 작업
운영자가 지정한 위치에 DB 및 보관 원본의 암호화 묶음을 저장하고 무결성을 검증하는 도구를 작성한다. 암호화 키는 환경 변수로만 받고 본문에 넣지 않는다. 복원 검증은 격리된 로컬 환경에서 하며 jobs/Slack 재발송을 차단한다. 실제 주기 실행과 보관 위치는 운영 설정으로 남긴다.
## Acceptance Criteria
합성 DB/원본 백업 → 암호화 확인 → 체크섬 검증 → 격리 복원 → 삭제/권한 재적용 검증. docs/verification에 실행 기록.

## 실행 결과
개발 및 격리 검증 완료. [실행 증거](../../docs/verification/reviewed-materials-2026-09-16/README.md)를 참조한다. 운영 배포·정기 백업 설정은 완료 범위에 포함하지 않는다.
