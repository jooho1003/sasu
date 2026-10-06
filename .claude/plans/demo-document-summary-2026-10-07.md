# demo-document-summary — 실행 플랜 (2026-10-07)

요청: 데모와 노션 사수 가이드 갱신. 데모는 "문서 요약을 데모에 추가", 설계안 A(DB 데모 읽기 정책). 설계: `docs/02-design/features/demo-document-summary.design.md`.

| id | 작업 | tier | 모델 | 승인 |
|---|---|---|---|---|
| D1 | step 0 읽기 경로(anon 정책·검증 모듈·데모 로더) | powerful | opus | — |
| D2 | step 1 화면·공유 컴포넌트·시드·로컬 E2E | balanced | sonnet | — |
| D3 | 노션 가이드 갱신 | balanced | sonnet(초안)+main | 사용자 요청 |
| D4 | 운영 반영 migration → 재시드 → 병합 | powerful | main | 필요(미실행) |
| D5 | 최종 리뷰·analyze·report | powerful | main | — |

게이트: G1 PASS · G2 PASS · G3 PASS · G4 PASS(60%, 근거 기재) · G5 PASS.
