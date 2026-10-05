# app-domain-migration (2026-10-05)

요청: 운영 웹 주소를 getsasu.com으로 PDCA 진행. 설계: `docs/02-design/features/app-domain-migration.design.md`(C 실용형).

| 노드 | 작업 | 점수 | 티어 | 실행 |
|---|---|---|---|---|
| N0 | step0 url-resolver | 3 | balanced | sonnet 서브에이전트 |
| N1 | step1 legacy-redirect | 3 | balanced | sonnet 서브에이전트 |
| N2 | step2 auth-confirm | 4→security floor | powerful | opus 서브에이전트 |
| N3 | step3 verification | 3 | balanced | sonnet 서브에이전트 |
| N4 | 최종 리뷰·analyze | 5 | powerful | 메인 직접 |
| N5 | 운영 전환 T1~T12 | 7 | powerful | 메인 직접, 단계마다 승인 |

게이트: G1 PASS · G2 PASS · G3 PASS · G4 PASS(50%, 초과분 근거: security floor·최종 리뷰 오버라이드·D3=2 배포) · G5 PASS(N5 requires_approval).
