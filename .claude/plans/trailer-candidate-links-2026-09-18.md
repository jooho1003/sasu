# 예고편 지원자별 링크 — 2026-09-18

사용자 결정(9/18): 지원자마다 다른 URL 발급 · 제출·채점 포함 · 이메일 저장 · 7일 만료·여러 번 열람. 설계 `docs/planning/예고편_지원자링크_설계.md`, ADR-062, PRD 1.14 §3-2·§8-1, 불변식 20·21 개정 완료. 실행 계약은 `phases/26-trailer-candidate-links` step 0~7(Codex).

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| D0 | 설계·문서·step 파일 | general | 2/2/1/2=7 | powerful | main (아키텍처, 위임 금지) — 완료 |
| S0 | invite-schema | security | 0/1/1/1=3 | powerful(floor) | codex sol/xhigh |
| S1 | invite-lib | general | 0/0/0/1=1 | balanced | codex terra |
| S2 | lead-invites | frontend | 0/1/0/1=2 | balanced | codex terra |
| S3 | candidate-page | security | 0/2/1/1=4 | powerful(floor) | codex sol/xhigh |
| S4 | candidate-submit-score | security | 0/2/1/1=4 | powerful(floor) | codex sol/xhigh |
| S5 | purge-withdraw | general | 0/1/0/1=2 | balanced | codex terra |
| S6 | demo-invite-mock | frontend | 0/1/0/1=2 | balanced | codex terra |
| S7 | invite-verification | qa | 0/1/1/1=3 | balanced | codex terra → blocked |
| O1 | 운영 적용·조직 개시 | security | 1/2/2/2=7 | powerful | main + 사용자 승인 |

## 게이트
- G1 완전성: PASS
- G2 오버라이드: PASS — 아키텍처(D0)·보안(S0·S3·S4·O1)은 powerful
- G3 클램프: PASS — security floor 적용, S1은 general 1점이지만 다중 파일 쓰기라 balanced/terra
- G4 비용: powerful 5/10(50%) > 30%. 근거: S0 anon 실행 RPC·권한 회수 / S3 비로그인 공개 표면 / S4 anon 요청이 DB 쓰기·job으로 이어지는 유일 경로 / D0·O1 하드 오버라이드. 모두 보안 floor라 강등 불가 → PASS(근거 첨부)
- G5 안전: PASS — D3=2인 O1에 `requires_approval: true`. 법률 자문 전 실제 조직 개시 금지

결과: **PASS**
