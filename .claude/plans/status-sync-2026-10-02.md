# 운영 반영 상태 기록 정리 (status-sync) — 2026-10-02

요청: "blocked 된거 중 사람이 꼭 필요한거 빼고는 다 된거지? 운영반영 해줘."

## 승인된 결정

| # | 결정 | 처리 |
|---|---|---|
| 1 | 운영에 새로 보낼 코드·DB·스위치 변경이 없으므로, 이미 운영에 나간 phase의 낡은 상태 기록만 고친다. 문서만 바뀌는 PR이며 병합 시 운영 재배포 1회 | 이 플랜 |
| 2 | V14 CSP 강제 전환은 넣지 않고 사용자 결정을 따로 받는다 | 보류 |

## 조사에서 나온 사실

- 운영 DB는 0001~0069가 모두 적용돼 있다(`db push --dry-run`: up to date).
- 운영 웹은 main 최신 `51d8cc6`이고, 열린 PR·미병합 원격 브랜치는 없다.
- 워커는 매분 정상이다(HTTP 200). 9/30 이후 실패는 10/1 `notion_poll` 1건(`notion_api_failed`)뿐이다.
- phase 32·31: 9/23 운영 반영(`dpl_2KmDkF49HAxHXpki58VPG2sz611c`). 그런데 상위 index에는 "운영 승인 대기"로 남아 있다.
- phase 27: 9/20에 0037~0051을 적용하고 `SASU_RETRO_ENABLED=true`로 켰다. 그런데 setup-guide §15에는 "운영 기본 false"로 남아 있다.
- phase 14: step 1의 배포·E2E·401 확인은 이미 했다. 남은 것은 실제 Slack 질문과 화면 캡처다(사람).
- phase 41·42: PR #24가 10/1에 자동 배포됐고, 0068은 10/2 20:33에 적용됐다. 그런데 문서에는 "운영 미반영"으로 남아 있다.
- phase 23·33: 9/30 운영 반영(녹음 스위치 꺼짐). 그런데 phase 23 README와 recording-ux 보고서에는 "미반영"으로 남아 있다.
- `.env.example`의 CSP 설명이 ADR-068을 가리키지만, CSP 결정은 ADR-069다.

## 노드

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 | 상태 |
|---|---|---|---|---|---|---|
| S1 | 고칠 문구·근거 확정 | general | 0/1/0/1=2 | balanced | main | 완료 |
| S2 | 상태 문서 10개 파일 수정 | mechanical | 0/1/0/0=1 | fast | worker·haiku | 완료 |
| S3 | JSON 파싱·diff·문구 검사 | mechanical | 0/1/0/0=1 | fast | worker·haiku | 완료(문구 검사는 .ts/.tsx만 대상이라 해당 없음) |
| R1 | 최종 리뷰 | review | 0/1/0/2=3→오버라이드 | powerful | main | 완료 |
| O1 | 커밋·PR·Preview·병합(운영 재배포)·점검 | general | 0/1/2/1=4→오버라이드 | powerful | main, 승인 필요 | 진행(이 PR) |

## 게이트

G1 PASS · G2 PASS(R1·O1은 최종 리뷰·머지 승인 오버라이드로 powerful·메인) · G3 PASS · G4 PASS(powerful 2/5=40%, 둘 다 하드 오버라이드라 강등 불가) · G5 PASS(O1 `requires_approval`, 사용자 "운영반영 해줘"로 승인, 범위는 문서만 바뀌는 재배포) → **PASS**

## 보류

- **V14 CSP 강제 전환:** 사용자 결정을 기다린다. `report-uri`가 없어 실제 위반이 모이지 않았다. 영업 검토·기기 설정 화면은 어느 모드에서도 CSP 검증 기록이 없다. 심사 기간(~10/5) 중이다.
