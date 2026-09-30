# 웹 회의 녹음 설계 검증·재설계 — 2026-09-25

"설계 검증 해주고 미흡한 설계는 다시 해줘."
대상은 `docs/planning/웹회의_녹음_설계.md`(phase 23 상세 설계)다. step0 기록, step1 note, CSP 요약에 "녹음 시작 전 영속 세션 생성 계약 미정"이 차단점으로 남아 있었다. 이번 플랜은 문서만 바꿨다. 구현·migration 적용·배포·커밋은 하지 않았다.

## 검증 결과 → 처리

결함은 16건이다(차단 2, 높음 4, 중간 7, 낮음 3). 근거가 되는 코드 줄은 [검증 기록](../../docs/verification/recording-session-design-2026-09-25/README.md)에 있다.

| 결함 | 처리 |
|---|---|
| B1 녹음 세션 생성 시점 없음 → 키 발급이 항상 404 | ADR-070 결정 1·2: 녹음 시작 때 `review_recordings` 세션을 만든다 |
| B2 `review_original_available`이 `original_path`를 요구 → 구간 원본이 모두 거부됨 | 결정 3·6: 원본 가용성을 형식별로 판정하고 영향 목록을 보강한다 |
| H1 새 ID 재전송과 키 바인딩이 모순 | 결정 4: 같은 ID에서 attempt를 올려 다시 받는다 |
| H2 ADR-058과 충돌하는 서명 URL 재생 | 결정 6: 구간 번호가 붙은 단회 접근권 |
| H3 클라이언트가 할 수 없는 해시 확인 재시도 | 결정 4: 409는 업로드된 것으로 보고 서버 검증이 판정한다 |
| H4 segment 기준 경계 처리가 ACC-01을 만족하지 못함 | 결정 7: 단어 타임스탬프로 판정 |
| M1~M7 전사 창 이중 저장·방치 정리·완료 원자성·녹음자 참여자 누락·스위치 off·문서 현행화·SEC 번호 충돌 | 결정 5·8, 상세 설계 갱신, 번호 대응표 |
| L1~L3 CSP·Worklet 검증 공백·마이크 옵션 차이·키 회전 | step2 검증 항목, 결정 2(키 버전) |

## 노드 (v2)

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 | 상태 |
|---|---|---|---|---|---|---|
| E1 | 자료 검토 SQL·API·워커 사실 조사 | explore | 1/1/0/0=2 | balanced | Explore (sonnet) | 완료 |
| E2 | 브라우저 녹음 코드·CSP·오디오 계약 사실 조사 | explore | 1/1/0/0=2 | balanced | Explore (sonnet) | 완료 |
| R0 | 설계 검증·검증 기록 | review | 2/2/0/2=6 | powerful | main (위임 금지) | 완료 |
| D0 | PRD 1.17 → ADR-070 → ARCHITECTURE §6-5 | security | 2/2/1/2=7 | powerful | main (위임 금지) | 완료 |
| D1 | 상세 설계·step1·step2 | general | 1/2/1/2=6 | powerful | main (위임 금지) | 완료 |
| W0 | ADR-069 제목, phase README·index.json 문구 | mechanical | 0/1/0/0=1 | fast | worker (haiku) | 완료 |
| R1 | 최종 리뷰 | review | 2/2/0/2=6 | powerful | main (위임 금지) | 완료 |

## 게이트 (v2, R0 뒤 재통과)

- G1 완전성: PASS
- G2 오버라이드: PASS. 보안 계약(D0)은 security, 아키텍처(D1)·검증(R0)·최종 리뷰(R1)는 powerful이며 위임하지 않았다.
- G3 클램프: PASS
- G4 비용: PASS. powerful 비율은 4/7 = 57%다. 네 노드 모두 하드 오버라이드이자 never_delegate다. phase step 명세를 설계 노드에 넣은 것은 grounded-answer-selection D0 선례를 따랐다.
- G5 안전: PASS. D3=2 노드가 없다.

결과: **PASS**

## 동시 작업

09:20~09:54에 다른 작업(Codex로 추정)이 step0 후속, step1-A 순수 모듈, 상세 설계 §5.1.1, `ReviewRecordingStart`·키 버전 회전 코드를 만들었다. 이 플랜은 그 파일들을 수정하지 않았다. 설계의 필드 이름은 그 코드에 맞췄다.

## 사용자 확인이 필요한 결정

1. ADR-070 결정 5: 전사 창 WAV를 저장하지 않는다. ADR-056에서 감수했던 116MB를 57.6MB로 줄인다.
2. ADR-070 결정 8: 조직 녹음 스위치를 끄면 진행 중인 녹음도 저장할 수 없다.
3. 기존 파일 업로드의 `uploading` 방치 정리는 이번 범위 밖에 둔다.
