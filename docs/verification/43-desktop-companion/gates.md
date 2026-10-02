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

**PASS.** 관리자 전용 `generateLink()`에서 받은 `email_otp`로 anon `verifyOtp()` 로그인은 성공했고 access token의 `session_id`는 `auth.sessions.id`와 일치했다. 세션 행 삭제 뒤 SDK `getUser(token)`은 `AuthSessionMissingError`와 사용자 없음으로 끝났고, 원 Auth API는 `403 session_not_found`, refresh token은 거부됐다. `signInWithOtp({ shouldCreateUser: false })`도 미가입 이메일을 거부했다.

## 판정

Step 0은 **completed**다. G1·G2 모두 설계 §7 S2의 로컬 게이트를 통과했다. 이후 step 1에서 `device_links`와 해제 RPC를 만들 때 이 세션 삭제 계약을 사용한다. 운영 권한 확인과 운영 DB 적용은 이 기록의 범위 밖이다.

## 코드 관계·구조 확인

Graft와 Archify 실행 파일은 이 환경에 없었다. 실제 파일 관계와 수동 Mermaid 대조는 [code-context.md](code-context.md)에 기록했다. Graft 그래프의 최신성 검사와 Archify 렌더·레이아웃 검사는 수행하지 못했다.
