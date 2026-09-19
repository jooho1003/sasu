# 부서별 회고 커넥터 — 2026-09-19

사용자 요청(9/19): 각 부서(디자인 피그마·댓글, 기획 문서 비교, 영업 통화 등)가 당일 회고를 쓸 수 있는 방향을 모두 조사해 설계. 조사 4건(`docs/planning/retro-connectors-research-2026-09-19/`) → 설계 `docs/planning/부서별_회고_커넥터_설계.md` → ADR-064, PRD 1.16 §3-6 RET-11~16·§8·§8-1, ARCHITECTURE §6-4 불변식 27~29 → `phases/30-retro-connectors/index.json`(step 파일은 착수 시). **phase 27 QA 통과와 설계 §0 사용자 결정 10개 확정 전에는 S0을 시작하지 않는다.** 9/20 제출본은 건드리지 않는다.

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| R0 | 1차 출처 조사 4건(디자인·기획 / 영업·CS / 개발·마케팅·인사 / 법령·정책) | general | 1/0/0/0=1 | fast→balanced(조사 폭) | sonnet 4 병렬 — 완료 |
| D0 | 설계·상위 문서·플랜·phase 등록 | general | 2/2/1/2=7 | powerful | main (아키텍처, 위임 금지) — 완료 |
| U0 | 설계 §0 사용자 결정 10개 확정 | general | 2/1/0/2=5 | powerful | main + **사용자** (`requires_approval`) |
| L0 | 법률 자문(통신사실확인자료·근로자 정보 공개·부서 공개의 제3자 제공 여부) | security | 2/1/2/2=7 | powerful | **사용자 외부 절차** (`requires_approval`) |
| S0 | preset-and-derived | general | 0/1/1/1=3 | balanced | codex terra/medium |
| S1 | connections-schema-oauth | security | 0/2/1/1=4 | powerful(floor) | codex sol/xhigh |
| S2 | pull-job-and-first-connectors | general | 1/1/1/1=4 | balanced | codex terra/medium |
| S3 | connections-ui | general | 1/1/0/1=3 | balanced | codex terra/medium |
| S4 | sales-cs-connectors | general | 1/1/0/1=3 | balanced | codex terra/medium |
| S5 | docs-dev-hr-connectors | general | 1/1/0/1=3 | balanced | codex terra/medium |
| S6 | marketing-snapshots | general | 0/1/0/1=2 | balanced | codex terra/medium |
| S7 | connectors-verification | general | 0/1/1/1=3 | balanced | codex terra/medium |
| S8 | voip-call-metadata | security | 1/1/1/2=5 | powerful | codex sol/xhigh — **L0 통과 전 blocked** |
| O1 | 운영 반영 | security | 1/2/2/2=7 | powerful | main + 사용자 승인 (`requires_approval`) |

## 게이트

- G1 완전성: PASS — 15개 노드 모두 채움
- G2 오버라이드: PASS — 아키텍처(D0)·모호(U0)·보안·법령(L0·S1·S8·O1) powerful
- G3 클램프: PASS — security floor(L0·S1·S8·O1). general은 2~4점 balanced, D2≥1 terra. R0은 조사 폭이 넓어 sonnet(balanced)로 올림
- G4 비용: powerful 6/15(40%) > 30%. 근거: D0(설계, 완료)·U0(사용자 결정)·L0(법률 자문, 사용자 절차)·S1(개인 토큰 저장·OAuth·RLS — 새 인증 경로)·S8(통신사실확인자료)·O1(운영). 여섯 다 강등 불가 → PASS(근거 첨부)
- G5 안전: PASS — D3=2인 L0·O1과 결정 대기 U0에 `requires_approval`, S8에 `requires_legal`

결과: **PASS**
