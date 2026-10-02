# 데스크톱 동반 앱(펫) — 2026-10-01

사용자 결정(10/1): GPT dots·ChatGPT 펫 벤치마킹, 목적 3개(바로 질문·결정 놓치지 않기·일 맡기기) 모두, 부서원 전체, Windows 먼저, B(독립 화면+기기 토큰), 설계안 C, 이메일 6자리 코드, 영업 원문 검토(AG-07), 배포 전용 공개 GitHub 저장소. 원천 PRD §3-8·ADR-082·ARCHITECTURE §6-12, 설계 `docs/02-design/features/desktop-companion.design.md`, 실행 `phases/43-desktop-companion`.

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
| S9b | desktop-work (S9에서 분리, 2026-10-02) | frontend | 0/1/0/1=2 | balanced | codex terra/medium |
| S9c | desktop-fixes (1차 analyze 보완, 2026-10-02) | frontend | 0/1/0/1=2 | balanced | codex terra/medium |
| S10 | desktop-release-verify (step 12) | qa | 0/1/1/1=3 | balanced | codex terra/medium → blocked(사람 실측) |
| R1 | 최종 리뷰·`/pdca analyze`·report | review | 1/2/1/2=6 | powerful | main (최종 리뷰, 위임 금지) |
| O1 | 운영 반영 | security | 1/2/2/2=7 | powerful | main + 사용자 승인 |
| S13 | desktop-followup (step 13, G2~G4 이월 보완) | security | 0/1/1/1=3 | powerful(floor) | 현재 Codex 주 세션 직접 수행. 향후 하네스는 sol/xhigh |

## 게이트
- G1 완전성: PASS — 13개 노드 모두 domain·4축·tier·agent·모델·의존·산출물.
- G2 오버라이드: PASS — 아키텍처(D0)·최종 리뷰(R1)·보안·인증(S1·S2·S6·S8·O1)이 powerful.
- G3 클램프: PASS — security floor로 S1·S2(3점)·S6·S8(4점) 승격. S4·S5는 권한 코드를 "옮기기만" 하므로 general로 두되, 인용·결정·동의 필터 변경 금지를 step 금지사항에 박았다. ceiling 위반 없음.
- G4 비용: powerful 7/15(47%, 2026-10-02 S9b·S9c 추가 후) > 30%. 근거 — D0 아키텍처(오버라이드) / S1 `auth.sessions` 삭제·SECURITY DEFINER RPC / S2 새 인증 입구(Bearer) / S6 새 공격면 9개 경로 / S8 토큰 저장·Electron 샌드박스 / R1 최종 리뷰(오버라이드) / O1 운영 마이그레이션·외부 공개(D3=2). 모두 하드 오버라이드 또는 security floor라 강등 불가. → PASS(근거 기록).
- G5 안전: PASS — D3=2인 O1에 `requires_approval: true`. S10은 게시·운영 변경을 금지하고 사람 실측 대기로 멈춘다.

결과: **PASS**

### Step 13 후속 계약 기록 (2026-10-02)

기존 승인 설계 §11.4와 step 13의 보완을 실행했다. G1 필드 완전성 PASS, G2/G3 암호화 상태·IPC security floor PASS, G4 powerful 8/17(47.1%, plan.json 실계수) — 기존 7개 오버라이드에 S13의 저장/IPC 경계 근거 추가로 PASS, G5 로컬 편집/테스트만 수행하고 O1 승인 게이트 유지로 PASS. 최종 리뷰는 주 세션이 수행했다. `codex_model`은 하네스 재실행 배정 값이며 이번 실행에서 현재 세션 모델을 바꾸거나 별도 `codex exec`를 호출하지 않았다.

결과: desktop 단위56·합성 Electron3·PGlite8·root1834·lint/build 통과. Graft 미확보·Archify 자동검사 결과와 실패/재시도는 `docs/verification/43-desktop-companion/followup.md`에 있다. step 12 및 O1은 계속 대기다.

## 실행 메모
- 실행 전 이 브랜치(`docs/desktop-companion-plan-20261001`)를 커밋해야 한다. 문서(PRD 1.28·ADR-082·§6-12)가 가드레일로 주입된다.
- phase 41(ADR-080·0068·PRD 1.26)·phase 42(ADR-081·PRD 1.27)이 다른 브랜치에서 진행 중이다. 병합 순서에 따라 PRD 버전 줄·`phases/index.json`·ADR 끝부분이 충돌할 수 있다. 번호는 병합 때 재확인한다.
- 로컬 QA는 기존 `node scripts/review-qa.mjs` 환경(본 작업 트리의 `.vercel/review-qa`)을 쓴다.

Step14: S14(1/1/1/1=4, security floor powerful), S13 뒤 기존 설계 세션 종료·FIFO 회귀를 현재 세션에서 수행. 실제 nodes 기준 powerful 9/18(50%). 운영 반영 없음.

O1 진행(2026-10-02, 사용자 승인): 운영 `auth.sessions` 권한 확인·0068/0069 적용·웹 배포 완료(PR #25, `docs/verification/desktop-companion-production-2026-10-02.md`). SMTP·메일 템플릿·배포 저장소·첫 게시·5분 설치 녹화가 남아 O1은 partial이다.
