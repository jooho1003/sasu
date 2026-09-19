# 개발 회고 자동화 — 2026-09-19

사용자 요청(9/19): 하루 활동(크롬·대화 세션·메모리/CLAUDE.md 변경·처리된 것)을 자동으로 모아 회고를 만들고, 노션·블로그로 내보내며, 사수 안에서 사람×날짜×주제로 훑어본다. 설계 문서 `docs/planning/개발_회고_자동화_설계.md`, ADR-063, PRD 1.15 §3-6·§8·§8-1, ARCHITECTURE §6-4(불변식 23~26). 실행 계약 `phases/27-daily-retro/`. **설계 §0의 사용자 결정 7개가 확정되기 전에는 S0을 시작하지 않는다.** 9/20 제출본은 건드리지 않는다.

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| D0 | 설계·상위 문서·플랜·step 파일 | general | 2/2/1/2=7 | powerful | main (아키텍처, 위임 금지) — 완료 |
| U0 | 설계 §0 사용자 결정 7개 확정 → 설계·ADR "결정"으로 갱신 | general | 2/1/0/2=5 | powerful | main + **사용자** (`requires_approval`) |
| S0 | retro-schema — `0046_daily_retro.sql`·RLS·RPC·마스킹·롤백·하니스 | security | 0/1/1/1=3 | powerful(floor) | codex sol/xhigh |
| S1 | retro-contracts-lib — 계약·verify·export·파서 6종 (TDD) | general | 0/1/1/1=3 | balanced | codex terra/medium |
| S2 | retro-collector — `scripts/retro-collect.ts` 배선·설정·Chrome 복사본·setup-guide §15 | general | 1/1/0/1=3 | balanced | codex terra/medium |
| S3 | retro-draft-job — 파이프라인·LlmPurpose·JobKind·청크/병합·스윕·DM | general | 0/1/1/1=3 | balanced | codex terra/medium |
| S4 | retro-api — 라우트 6개·읽기 시점 2분 방어 | general | 0/1/0/1=2 | balanced | codex terra/medium |
| S5 | retro-ui — 타임라인·상세·설정 절·내비 | general | 1/1/0/1=3 | balanced | codex terra/medium |
| S6 | retro-demo-export — 데모 시드·`/demo/retros`·Markdown 내보내기 UI | general | 0/1/0/1=2 | balanced | codex terra/medium |
| S7 | retro-verification — 단위·하니스·빌드·E2E·수집기 dry-run 기록 → blocked | general | 0/1/1/1=3 | balanced | codex terra/medium |
| O1 | 운영 DB 적용·플래그·배포 | security | 1/2/2/2=7 | powerful | main + 사용자 승인 (`requires_approval`) — 9/20 이후 |

## 게이트

- G1 완전성: PASS — 11개 노드 모두 domain·4축·tier·agent·모델 있음
- G2 오버라이드: PASS — 아키텍처(D0)·모호한 판단(U0)·보안(S0·O1)은 powerful. S0은 새 RLS·RPC라 security
- G3 클램프: PASS — security floor 적용(S0·O1). general 노드는 모두 2~3점 balanced, D2≥1이라 terra
- G4 비용: powerful 4/11(36%) > 30%. 근거: D0(설계, 완료)·U0(사용자 결정 자체)·S0(RLS·RPC — `self` 소유 판정이 새 정책이라 실수 한 줄이 유출)·O1(운영 반영). 넷 다 강등 불가 → PASS(근거 첨부)
- G5 안전: PASS — D3=2인 O1과 결정 대기인 U0에 `requires_approval: true`. S0~S7은 QA DB·로컬만

결과: **PASS**
