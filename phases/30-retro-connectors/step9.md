# Step 9: provider-contract-hardening

## 목적

현재 앱·워커가 구현한 회고 연결 제공자와 Supabase의 직접 RPC 허용 목록을 일치시킨다. 외부 서비스 연동을 새로 켜지 않으며, 인증 계약이 확인되지 않은 제공자는 계속 막는다.

## 변경

- `supabase/migrations/0051_retro_provider_contract.sql`
  - `begin_retro_connection()`의 허용 목록에서 `channel_talk`, `greenhouse`, `lever`, `workable`, `meta`를 제거한다.
  - UI를 우회한 직접 RPC가 워커에서 파싱할 수 없는 연결 상태를 만들지 못하게 한다.
- `supabase/rollback/0051_retro_provider_contract_down.sql`
  - 0050의 허용 목록을 복원한다. 저장된 자격 증명·활동은 삭제하지 않는다.
- `scripts/verify-retro-connections-sql.mjs`
  - 미구현 제공자 5개가 `invalid_connection`으로 거절되는 격리 SQL 검사를 추가한다.

## 검증

- PGlite 격리 보안 하니스: 237개 통과, 권한 조합 2,016건.
- 제공자 단위 테스트: 2개 파일, 13개 통과.
- 운영 DB migration push·배포·외부 제공자 호출은 실행하지 않았다.

## 상태

완료. phase 30 전체는 실제 제공자 sandbox·법률·운영 게이트 때문에 계속 `blocked`다.
