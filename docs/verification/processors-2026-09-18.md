# 제3자 처리·운영 DB 대시보드 실측 (2026-09-18)

[processors-2026-09-17.md](processors-2026-09-17.md)의 "실제 계정 설정 확인 미완료"를 잇는 기록. 로그인된 Chrome 세션에서 읽기 전용으로 확인했고 설정은 아무것도 바꾸지 않았다.

상태: **Groq 설정·Supabase 리전 확인 / Groq 키-조직 연결·Voyage 옵트아웃 미확인**

## Groq — Data Controls

- 조직 `Personal` / `Default Project`. Global ZDR **Enabled**("API specific settings are overriden"), Inference APIs ZDR **Enabled**, Batch·Fine-tuning 저장 Off.
- 캡처: [groq-data-controls.jpg](processors-2026-09-18/groq-data-controls.jpg)
- **미확인:** 이 조직의 API Keys 목록에는 `chemiforge` 1개만 있다. 운영 `GROQ_API_KEY`가 이 조직 소속인지는 확인하지 못했다. 다른 조직·계정의 키라면 위 설정은 사수 호출에 적용되지 않는다.

## Voyage — 옵트아웃

- `dashboard.voyageai.com`이 로그인 화면으로 넘어가 상태를 관측하지 못했다. 9/17과 동일하게 **미확인**.

## Supabase — 리전

- 조직 `jooho1003's Org`(Pro) / 프로젝트 `sasu`(`fzpnidoyhejrmhymggpp`) — **AWS ap-northeast-1 (도쿄)**.
- 캡처: [supabase-region.jpg](processors-2026-09-18/supabase-region.jpg)
- `lib/consent.ts`의 `리전 [확인 대기]`를 채울 근거다. 문구 변경은 하지 않았다.

## Supabase — Security Advisor (운영 DB)

오류 0 · 경고 77 · 제안 13.

- **비로그인(anon) 실행 가능한 SECURITY DEFINER 함수 11개.**
  - 의도된 공개: `demo_admin_answer_stats`·`demo_admin_members`·`demo_admin_overview`·`demo_admin_sources`·`demo_departments`·`is_demo_department`·`public_trailer`·`invite_preview`.
  - **의도와 다름:** `can_see(uuid, uuid, text)` — `0002_can_see_rls.sql:21-22`는 `revoke … from public` 후 `authenticated, service_role`에만 grant하지만, 운영에서는 anon이 실행할 수 있다. `public`에서 회수해도 Supabase 기본 권한이 anon에 직접 준 EXECUTE는 남는다(ADR-042와 같은 종류의 구멍, 함수판). 영향: UUID를 아는 비로그인 호출자가 "이 사용자가 이 부서 멤버/부서장인가"를 참/거짓으로 알아낼 수 있다.
  - 트리거 함수 `enqueue_decision_embedding()`·`guard_active_item_source()` — 직접 호출은 실패하므로 실해는 없으나 회수 구문이 없다.
- 로그인 사용자 실행 가능한 SECURITY DEFINER 함수 60여 개 — RPC 설계상 의도된 것. 함수 내부의 `auth.uid()` 검증은 `scripts/verify-security-sql.mjs`가 단언한다.
- `pg_net`·`vector` 확장이 `public` 스키마에 있음.
- Leaked Password Protection 꺼짐 — 로그인이 매직링크라 영향이 작다.
