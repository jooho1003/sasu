# 회고 연결 제공자 계약 보정 — 2026-09-20

## 결과

앱과 워커가 구현한 17개 제공자와 달리 `begin_retro_connection()`의 직접 RPC 허용 목록에는 아직 구현하지 않은 5개 제공자가 남아 있었다. migration `0051`에서 직접 연결 시작을 현재 어댑터 목록으로 제한했다. 채널톡·Greenhouse·Lever·Workable·Meta의 외부 인증/API를 추측해 구현하지 않았다.

## 실행 기록

| 검사 | 결과 |
|---|---|
| 제공자 단위 테스트 | 2개 파일·13개 통과 |
| `node scripts/verify-security-sql.mjs <임시 PGlite 경로>` | 237개 통과·실패 0·권한 조합 2,016건 |
| `git diff --check` | 통과 |

SQL 하니스의 새 회귀 검사는 미구현 제공자 5개가 인증된 사용자의 직접 RPC에서도 `invalid_connection`으로 거절되는지 확인한다. 운영 Supabase에는 push하지 않았다.

## 남은 범위

phase 30 step 4~8의 외부 제공자 sandbox, 실제 모델 한도, 사람 판정, VoIP 법률 자문, 운영 반영은 기존 설계 게이트를 유지한다.
