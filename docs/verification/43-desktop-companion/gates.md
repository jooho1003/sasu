# 데스크톱 동반 앱 Step 0 게이트

- 일시: 2026-10-01 (KST)
- 범위: 로컬 QA Supabase만 사용했다. 운영 DB·운영 배포·마이그레이션은 변경하지 않았다.
- 설계: [desktop-companion.design.md](../../02-design/features/desktop-companion.design.md) §1.2·§7(S2)·§10·§11.3

## 실행

```powershell
node scripts/review-qa.mjs setup
node scripts/verify-companion-gates.mjs
```

`setup`은 `.vercel/review-qa`의 로컬 Supabase와 합성 QA 계정만 준비했다.

## G1 — 해제 시 `auth.sessions` 삭제 권한

**PASS.** `auth.sessions`의 소유자는 `supabase_auth_admin`이었고, 로컬 `postgres` 역할의 DELETE 권한은 참이었다. 검증 스크립트는 생성한 OTP 세션을 대상으로, `auth.uid()`와 같은 `user_id` 조건을 둔 임시 SECURITY DEFINER 함수의 DELETE를 트랜잭션 안에서 실행한 뒤 롤백했다.

## G2 — 6자리 코드 로그인과 세션 무효화

**FAIL.** 관리자 전용 `generateLink()`에서 받은 `email_otp`로 anon `verifyOtp()` 로그인은 성공했고 access token의 `session_id`는 `auth.sessions.id`와 일치했다. 그러나 해당 행을 삭제한 뒤 anon 클라이언트의 `getUser(token)`은 설계가 요구한 `session_not_found` 오류를 반환하지 않았다. 관찰값은 `error.code = null`, `data.user = null`이었다.

`shouldCreateUser: false` 미가입 이메일 거부 검사는 G2의 세션 무효화 조건이 실패한 즉시 중단 규칙에 따라 실행하지 않았다.

## 판정

Step 0은 **blocked**다. `auth.sessions` 행 삭제만으로 다음 요청에서 설계 계약의 401/session_not_found를 보장하는지 확인되지 않았다. 설계 §7 S2의 대안인 “해제된 연결의 다음 요청에서 admin signOut” 채택 여부는 사용자 결정이 필요하다.

## 코드 관계·구조 확인

Graft와 Archify는 실행하지 않았다. G2가 실패하면 다른 해결책을 선택하지 않고 즉시 중단하라는 step 지시를 따랐다. 따라서 기기 연결 → 요청 → 해제 흐름의 도구 산출물은 이 step에 없다.
