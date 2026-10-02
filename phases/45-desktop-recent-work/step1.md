# step1 — 회귀·분석·보고

입력: docs/02-design/features/desktop-recent-work.design.md §8~11, step0 결과.
AC: desktop npm run lint/test/e2e -- followup.spec.ts; root npm run lint/build/test;
node scripts/verify-security-sql.mjs. 각 종료 코드를 따로 확인한다.
Graft 전후/Archify 실행 기록, bkit 독립 gap(U1~6/S1~2) 분석 후 90% 미만 보완/재검증,
90% 이상 report. 운영 메일/설치 검증을 합성 테스트로 대체하지 않는다.
완료 기록: docs/verification/45-desktop-recent-work/verification.md,
docs/03-analysis/desktop-recent-work.analysis.md,
docs/04-report/features/desktop-recent-work.report.md.

## 완료 기록

Electron 18·desktop 78·root 1,834·isolated SQL 316/권한 조합 2,016 PASS, lint PASS. 기본 Turbopack build는 외부 node_modules junction 환경을 거부했다. 제품 Next 설정을 바꾸지 않고 `npm run build -- --webpack` production build·타입·정적 생성 PASS로 대체 검증했다. Graft 전후 native binding 실패로 자동 그래프가 없으며 수동 호출 확인 범위를 기록했다. Archify 9/9와 자동 browser containment PASS. 독립 gap에서 읽음 오류의 탭 세대 누락을 수정하고 재검토 8/8, 성공 조건 5/5, 대상 일치율 100%. 운영 미반영, SMTP 보류.
