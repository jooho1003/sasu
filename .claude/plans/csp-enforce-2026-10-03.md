# CSP 강제 전환 검증 (csp-enforce) — 2026-10-03

요청: V14 CSP 강제 전환 "지금 해줘". 심사 기간(~10/5) 이후로 미루자는 추천 대신 지금 진행한다.

## 승인된 결정

| # | 결정 |
|---|---|
| 1 | 로컬 강제 모드 검증과 운영 Report-Only 관찰을 먼저 한다. 운영 스위치와 병합은 결과를 보여 준 뒤 사용자 확인을 받는다 |
| 2 | 강제 모드에서 깨지는 Slack 설치 폼은 `form-action`에 Slack 주소를 더해 고친다. POST·origin·state 검사는 그대로 둔다 |

## 조사에서 나온 사실

- 정책은 `lib/security-headers.ts:24-38`에 있다. `proxy.ts:10-12`는 `SASU_CSP_ENFORCE==="true"`일 때만 강제 헤더를 보낸다. `report-uri`가 없어서 운영 위반을 모은 적이 없다.
- Slack 설치는 `POST /api/slack/oauth/start` → 303 `https://slack.com/oauth/v2/authorize` 순서로 진행된다.
  - Chromium으로 재현해 보니, 강제 모드에서는 `form-action 'self'`가 전송을 막아 이동하지 않았다.
  - Report-Only에서는 이동하고 위반만 남았다.
- 다른 폼은 `/auth/signout`뿐이고 같은 출처로 이동한다. 회고 커넥터 OAuth는 링크로 이동하므로 `form-action` 대상이 아니다.
- 영업 검토·기기 설정·용어집 화면은 같은 출처 fetch만 쓴다. 녹음 화면은 AudioWorklet·Worker·blob 오디오·Storage 업로드를 쓴다.
- CSP 위반을 감지하는 spec은 4개뿐이다. 녹음 화면과 영업·기기 화면에는 감지가 없다.
- 로컬 QA는 review-qa Supabase와 `SASU_VERIFY_BUILD=1`(`.next-verify`)을 쓴다. 메인 작업 폴더는 다른 세션이 쓰고 있어서 별도 worktree에서 진행한다.
- Docker 엔진은 10/2 13:55에 멈췄고, 10/3 00:07에 다시 시작해 복구했다. 쓰지 않는 전체 로컬 Supabase(`sasu`)는 메모리 때문에 정지했다.

## 노드

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 | 상태 |
|---|---|---|---|---|---|---|
| C1 | form-action Slack 추가(테스트 먼저), ADR-069·ARCHITECTURE 보완 | security | 0/1/1/1=3→floor | powerful | main | 완료 |
| C2 | 로컬 강제 모드 빌드·서버 | qa | 0/1/0/0=1→floor | balanced | main | 완료 |
| C3 | CSP 화면 순회 spec | qa | 1/0/1/1=3 | balanced | general-purpose·sonnet | 완료 |
| C4 | 강제 모드 E2E 실행·증거 복원 | qa | 0/1/0/1=2 | balanced | main | 완료 |
| C5 | 운영 Report-Only 관찰(읽기 전용) | qa | 0/0/0/0=0→floor | balanced | main | 완료 |
| R1 | 최종 리뷰 | review | 0/1/0/2=3→오버라이드 | powerful | main | 완료 |
| O1 | PR·Preview·병합(운영은 아직 Report-Only) | general | 0/1/2/1=4→오버라이드 | powerful | main, 승인 필요 | 완료(PR #31) |
| O2 | 운영 env 강제 → 재배포 → 운영 확인 → 기록 PR, 문제 시 즉시 되돌림 | security | 0/2/2/1=5 | powerful | main, 승인 필요 | 완료(운영 강제) |

## 게이트

G1 PASS · G2 PASS · G3 PASS(C1 security floor 승격) · G4 PASS(powerful 4/8=50%, C1 security floor·R1/O1 하드 오버라이드·O2 security+배포라 강등 불가) · G5 PASS(O1·O2 `requires_approval`, 실행 직전 결과와 함께 사용자 확인) → **PASS**
