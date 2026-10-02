# step1 — 회귀·독립 분석·보고

읽을 파일: desktop-decision-flow plan/design 전체와 step0 결과.
AC: desktop lint/test/e2e -- followup.spec.ts, root lint/build/test, isolated SQL.
Graft 전후 실제 결과/수동 누락 범위와 Archify 실행을 기록한다.
독립 analyze(U1~6/S1~2·SC1~5), 90% 미만 수정/재분석, 이상 report.
기본 worktree junction의 Turbopack 실패는 기록하고 제품 설정 변경 없이 webpack production build로 보완한다.
운영 미반영·SMTP 보류를 유지한다.

## 완료 기록

Electron 25/25, desktop 78/root 1,834 단위, lint, root webpack production 타입 검사/49 정적 페이지 생성, isolated SQL 316/권한 조합 2,016 PASS. 기본 Turbopack의 외부 junction 거부와 Graft Win32 binding 오류/수동 관계 대조 범위를 기록했다. Archify 9/9·browser containment PASS. 독립 정적 대조 8/8·성공 조건 5/5·대상 가중 일치율 100%이며, docs/03-analysis/desktop-decision-flow.analysis.md와 docs/04-report/features/desktop-decision-flow.report.md에 연결한다. 운영 0.1.1 유지, 메일 연결 보류.
