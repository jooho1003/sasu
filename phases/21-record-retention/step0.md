# Step 0: retention-export
## 읽어야 할 파일
- docs/PRD.md §3-3·§8, docs/ADR.md ADR-054
- docs/planning/Slack_기록보존_백업_운영안.md §3~8
- supabase/migrations/0030_source_lifecycle.sql, lib/pipeline/slack-backfill.ts
## 작업
현재 부서장 권한으로 수집 현황·플랜/보존 확인값·알림 기준을 관리하고, 기간/채널별 검토 가능한 Markdown·JSON 보관 묶음을 만든다. 원문/버전/체크섬·누락 미확인·첨부 미포함을 명시한다. 다른 부서·미동의·삭제 원문은 내보내지 않는다. 범위 초과를 조용히 자르지 않는다. 실제 Slack 설정이나 장기 보존 정책을 자동 변경하지 않는다.
## Acceptance Criteria
`npm test -- tests/retention.test.ts` → `node scripts/verify-security-sql.mjs <pglite-directory>` → 로컬 E2E.

## 실행 결과
개발 및 격리 검증 완료. [실행 증거](../../docs/verification/reviewed-materials-2026-09-16/README.md)를 참조한다. 운영 배포·정기 백업 설정은 완료 범위에 포함하지 않는다.
