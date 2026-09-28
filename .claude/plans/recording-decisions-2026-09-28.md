# 녹음 설계 결정 확정·문서 보정 — 2026-09-28

"설계 확인하고 내가 결정해야 하는 거 알려줘" → "너가 고칠건 해주고. 1~6 승인할게."

## 승인된 결정

| # | 결정 | 처리 |
|---|---|---|
| 1 | ADR-069 결정 5: 전사 창 WAV 미저장 | 확정 기록 |
| 2 | ADR-069 결정 8: 스위치 off는 진행 중 녹음 저장도 차단(24시간 안 재개 시 복구 가능) | 확정 기록 |
| 3 | 기존 파일 업로드 `uploading` 방치 정리는 범위 밖, 후속 과제 | 확정·후속 등록 |
| 4 | 브랜치 묶음 커밋 + PR(병합·배포 별도), Codex step2 종료 뒤 | 대기(아래 사실 때문에 번호 재배정 선행) |
| 5 | anon `can_see` 회수 운영 적용 | 이미 적용됨: origin/main `0057_revoke_can_see_anon`, 운영 실측 anon=false·authenticated=true. 로컬 0055의 트리거 함수 2개 회수만 미적용(직접 호출은 원래 실패, 실해 없음) → 재번호 migration과 함께 |
| 6 | 녹음 migration 운영 적용은 step2·실기기 게이트 뒤 | 확정. 단 재번호 전에는 적용 불가 |

## 조사에서 나온 사실

- origin/main이 로컬 main(009fcc8)보다 17커밋 앞선다(9/27~28 ASK 수정, PR #6~#12).
- **migration 번호 충돌.** 운영 0055~0057 = `answer_topic_item_search`·`answer_topic_active_sources`·`revoke_can_see_anon`. 로컬 미커밋 0055~0057 = `private_visibility_functions`·`review_recording_sessions`·`review_recording_segments`. 운영에 `review_recordings`가 없다. `supabase migration list`는 버전만 비교해 전부 일치로 보여 준다. 이대로 `db push`하면 녹음 migration을 적용된 것으로 보고 건너뛴다.
- **ADR 번호 충돌.** origin/main ADR-068(ASK 지시 대상, 9/27) ↔ 로컬 미커밋 ADR-068(CSP)·ADR-069(녹음).
- 겹치는 파일: `docs/ADR.md`, `docs/PRD.md`, `lib/contracts.ts`, `scripts/verify-security-sql.mjs`.
- Codex가 같은 작업 트리에서 step2(녹음 화면)를 진행 중이다(`meeting-recorder.tsx` 등, 18:5x 수정).
- 9/28 첫 보고의 "사전 검사를 세션 전에 한다" 해석은 틀렸다. step2 명세와 Codex 코드는 "세션 생성 → 키 → 사전 검사, 실패하면 즉시 폐기"다. 설계 문서만 이 계약을 빠뜨렸다.

## 노드

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 | 상태 |
|---|---|---|---|---|---|---|
| F0 | 운영 DB·git 원격 사실 조사(읽기 전용) | explore | 1/1/0/0=2 | balanced | main(운영 자격 증명) | 완료 |
| A1 | 설계 §4.1·§6·§9 실패 시 즉시 폐기 계약 | general | 1/1/0/2=4→아키텍처 | powerful | main | 완료 |
| D1 | 결정 기록·PRD API 표·위험 수용·후속 등록 | general | 0/1/0/1=2 | balanced | main(문안 작성, 기계 편집 아님) | 완료 |
| R1 | 최종 리뷰 | review | 2/2/0/2=6 | powerful | main | 완료 |
| M1 | 번호 재배정(migration 0058~0060, ADR 069·070) | mechanical | 0/2/1/0=3 | balanced | worker(sonnet) | 완료 |
| C1 | origin/main 위 재정렬·커밋·PR | general | 1/2/2/1=6 | powerful | main, 승인됨(결정 4) | 완료(PR, 병합 안 함) |
| V1 | 재정렬 뒤 SQL·단위·lint·build | qa | 0/1/0/1=2 | balanced | claude(sonnet) + main(SQL 하니스) | 완료 |

## 게이트

G1 PASS · G2 PASS · G3 PASS · G4 PASS(powerful 3/7=43%: A1·R1 오버라이드, C1 외부 발신) · G5 PASS(C1 승인 부착, 운영 DB 쓰기 없음) → **PASS**
