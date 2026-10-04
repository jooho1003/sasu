# Step 2 검증 요약 — 영업 검토 회복

2026-10-03 · branch `feat/desktop-sales-flow` · 기준 `12ad4d7`

step0/step1 완료 요약과 plan/design 전체·PRD DC-16/§8/§11·ARCHITECTURE §6-12·ADR-086을 읽었다. 실제 제품·IPC/main·E14/E15/E16·공용 lib·SQL 관계를 대조하고 step 명세의 전체 검증을 실행했다. 제품 변경은 하지 않았으며 테스트의 source/ready 두 기존 사례에 380px·overflow assertion와 screenshot만 추가했다. 독립 G1 보완은 root가 구현 담당자에게 다시 배정했다.

## 최종 실행

| 범위 | 실제 결과 | 기록 |
|---|---|---|
| desktop lint→build→unit→전체 Electron | 모두 exit 0, 12 files/78 unit, 기존25+신규12=37 Electron PASS/3.8분 | [lint](desktop-lint.txt)·[build](desktop-build.txt)·[unit](desktop-test.txt)·[Electron](electron.txt) |
| 실제 development React Strict replay | G1 actual red exit 1→sourcesActive 소유권 보완→6 PASS/23.8초, exit 0 | [red](strict-red.txt)·[green](strict-green.txt)·[step0 부록](step0.md) |
| root lint→기본 build→webpack→unit→SQL | lint 0, 기본 Turbopack 1(외부 junction), webpack 0·타입·49/49, 183 files/1,834 unit PASS, SQL316/0fail·권한조합2,016 | [lint](root-lint.txt)·[기본 build](root-build.txt)·[webpack](root-build-webpack.txt)·[unit](root-test.txt)·[SQL](sql.txt) |
| Graft 사전/최종 제품 후 | native `ERR_DLOPEN_FAILED`, exit 1; 수동 코드 경로/누락 기록 | [전](graft-before.txt)·[후](graft-after.txt) |
| Archify 최종 제품 후 | deliver 9/9·오류/경고0, browser containment PASS, 두 명령 exit 0 | [flow](flow.json)·[delivery](archify-deliver.json)·[browser](archify-browser.json) |

최종 production chain에서는 development opt-in와 NODE_ENV override를 제거했다. 실제 development 6개는 같은 테스트의 별도 React 모드 실행이므로 고유 테스트 수에 합산하지 않는다. 보완 전 production 37 PASS/desktop3단계 로그를 suffix로 보존했고 실제 개발 replay red와 분리했다. root 검증 후 추가 변경은 desktop renderer/test-only helper에만 있으므로 desktop을 제외하는 root lint/type/unit 범위는 재실행하지 않았다. 모든 실행 세션은 종료했다.

## 도구·화면·산출물

수동 관계: App(workKey/current)→WorkTab→WorkSalesReview→preload/main sales IPC→ApiClient→E14/E15/E16→loadSalesSourceCandidates/startSalesSourceReview/readSalesSourceReviewStatus→0068 SQL. 현재 ready 재조회→origin 제한 app:openWeb→OS 요청 성공→App rememberSeen(current)도 대조했다. Graft 자동 전역 그래프는 없고 합성 API의 의미/권한 판단을 실제 SQL 실행과 구분했다.

Archify는 source Strict 단일 읽기·선택별 시작·status 단일 flight·오류 수동 retry·terminal 새 검토·현재 ready→웹→읽음·cleanup을 담았다. 첫 legacy 가독성 warning과 재사용 evidence 경로 충돌은 별도 receipt를 보존하고 최종 폭/새 out-dir으로 재실행했다. 최종 flow/HTML의 실제 SHA는 delivery receipt와 일치했다.

[선택 화면](screenshots/sales-form.png)·[ready section](screenshots/sales-ready-section.png)은 실제 380px Electron이다. step2 agent와 root가 view_image로 네 label/select·상태·버튼 접근과 가로 잘림 없음을 확인했고 세로 scroll은 정상이다. 보완 후 캡처도 step2 agent가 다시 확인했다. 이번 회귀가 재생성한 phase43 poll-error와 phase45 recent-work 기존 캡처 두 변경만 복원했다. 로그 trailing whitespace를 정리하고 JSON 유효성/SHA와 verification 로컬 링크 0누락을 확인했다.

상세 실행·실패/수정·검증 한계는 [verification.md](verification.md), 독립 설계 비교는 [analysis](../../03-analysis/desktop-sales-flow.analysis.md), 완료 보고는 [report](../../04-report/features/desktop-sales-flow.report.md)에 있다. 독립 gap-detector와 report-generator의 완료 상태·최종 문서를 확인했다. U1~8/S1~2 10/10·API 계약 3/3·SC1~6 6/6이며 대상 범위의 가중 일치율 100%다. 두 문서의 로컬 링크 누락 0을 담당자 실행 기록으로 확인했다. step2 검증/보고 연결을 완료하며 phase 전체 상태·커밋/초안 PR은 root가 마무리한다.

## 한계·운영 상태

OS 늦은 실패/읽음 늦은 성공은 공통 current guard의 정적 대조이며 별도 runtime 조합이 아니다. 모든 오류/이탈 조합의 곱이나 이미 시작된 POST/OS/저장의 취소를 주장하지 않는다. SQL은 isolated PGlite이며 pg_cron/pg_net 마이그레이션0004 제외다. 실제 운영 세션·고객 문서 정확도·Groq·메일·OS 브라우저/실기기 설치는 실행하지 않았다.

운영 앱/설치 파일 0.1.1 유지, `사수 / sasu@getsasu.com` 도메인/DNS/Resend SMTP 보류. 커밋·푸시·배포·설치 게시·main 병합은 수행하지 않았고 root에게 인계한다.
