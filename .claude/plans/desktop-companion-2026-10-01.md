# 데스크톱 동반 앱(펫) — 2026-10-01

사용자 결정(10/1): GPT dots·ChatGPT 펫 벤치마킹, 목적 3개(바로 질문·결정 놓치지 않기·일 맡기기) 모두, 부서원 전체, Windows 먼저, B(독립 화면+기기 토큰), 설계안 C, 이메일 6자리 코드, 영업 원문 검토(AG-07), 배포 전용 공개 GitHub 저장소. 원천 PRD §3-8·ADR-081·ARCHITECTURE §6-11, 설계 `docs/02-design/features/desktop-companion.design.md`, 실행 `phases/42-desktop-companion`.

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| D0 | 계획·설계·문서·step 파일 | general | 2/2/1/2=7 | powerful | main (아키텍처, 위임 금지) — 완료 |
| S0 | setup-gates | general | 0/1/1/1=3 | balanced | codex terra/medium |
| S1 | device-links-schema | security | 0/1/1/1=3 | powerful(floor) | codex sol/xhigh |
| S2 | companion-auth | security | 0/1/1/1=3 | powerful(floor) | codex sol/xhigh |
| S3 | web-devices | frontend | 0/1/0/1=2 | balanced | codex terra/medium |
| S4 | shared-ask-answer | general | 0/1/1/1=3 | balanced | codex terra/medium |
| S5 | shared-card-transcript | general | 0/1/1/1=3 | balanced | codex terra/medium |
| S6 | companion-routes | security | 0/2/1/1=4 | powerful(floor) | codex sol/xhigh |
| S7 | companion-sales-review | general | 0/1/1/1=3 | balanced | codex terra/medium — phase 41 병합 전이면 blocked |
| S8 | desktop-core | security | 1/1/1/1=4 | powerful(floor) | codex sol/xhigh |
| S9 | desktop-ui | frontend | 1/1/0/1=3 | balanced | codex terra/medium |
| S10 | desktop-release-verify | qa | 0/1/1/1=3 | balanced | codex terra/medium → blocked(사람 실측) |
| R1 | 최종 리뷰·`/pdca analyze`·report | review | 1/2/1/2=6 | powerful | main (최종 리뷰, 위임 금지) |
| O1 | 운영 반영 | security | 1/2/2/2=7 | powerful | main + 사용자 승인 |

## 게이트
- G1 완전성: PASS — 13개 노드 모두 domain·4축·tier·agent·모델·의존·산출물.
- G2 오버라이드: PASS — 아키텍처(D0)·최종 리뷰(R1)·보안·인증(S1·S2·S6·S8·O1)이 powerful.
- G3 클램프: PASS — security floor로 S1·S2(3점)·S6·S8(4점) 승격. S4·S5는 권한 코드를 "옮기기만" 하므로 general로 두되, 인용·결정·동의 필터 변경 금지를 step 금지사항에 박았다. ceiling 위반 없음.
- G4 비용: powerful 7/13(54%) > 30%. 근거 — D0 아키텍처(오버라이드) / S1 `auth.sessions` 삭제·SECURITY DEFINER RPC / S2 새 인증 입구(Bearer) / S6 새 공격면 9개 경로 / S8 토큰 저장·Electron 샌드박스 / R1 최종 리뷰(오버라이드) / O1 운영 마이그레이션·외부 공개(D3=2). 모두 하드 오버라이드 또는 security floor라 강등 불가. → PASS(근거 기록).
- G5 안전: PASS — D3=2인 O1에 `requires_approval: true`. S10은 게시·운영 변경을 금지하고 사람 실측 대기로 멈춘다.

결과: **PASS**

## 실행 메모
- 실행 전 이 브랜치(`docs/desktop-companion-plan-20261001`)를 커밋해야 한다. 문서(PRD 1.27·ADR-081·§6-11)가 가드레일로 주입된다.
- phase 41(ADR-080·0068·PRD 1.26)이 다른 브랜치에서 진행 중이다. 병합 순서에 따라 PRD 버전 줄·`phases/index.json`·ADR 끝부분이 충돌할 수 있다. 번호는 병합 때 재확인한다.
- 로컬 QA는 기존 `node scripts/review-qa.mjs` 환경(본 작업 트리의 `.vercel/review-qa`)을 쓴다.
