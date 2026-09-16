# 심사위원 데모 운영 검증 — 2026-09-17

- 제출 URL: `https://sasu-alpha.vercel.app/demo`
- Production deployment: `dpl_6wEmtuAvSxCHh1gVjYWyhhchJj2T` (`READY`)
- Vercel SSO protection: 해제 확인(`ssoProtection: null`). 별도 Vercel 로그인 없이 공개 접근한다.
- 자동 접근: 새 브라우저에서 `/demo` → 전용 합성 계정 세션 → `/demo`로 복귀한다. 세션 쿠키는 HttpOnly다.
- 권한: 온새미로 데모 조직 네 부서의 `lead`, 데모 조직의 `org_admin`. 실제 파일럿·QA 조직은 사용하지 않는다.
- 기능 지도: 대시보드, 결정 카드, 원장, 묻기, 음성·자료 검토, 문서 어시스턴트, 문서 평가, 기록 보존, 부서 세팅, 조직 관리, 채용 예고편 11개 경로가 모두 200이다.
- 안전 체험: 카드 결정, 원장 직접 기록, 자유·음성 질문, 파일 검토·근거 확정은 브라우저 상태에서만 동작한다.
- 예시 파일: 합성 VTT·MD·CSV·JSON·TXT 5개가 배포물에 포함된다. 자료 검토에서 추천 파일을 한 번 눌러 동의 확인 → 전사·추출 → 편집 → 근거 확정까지 완주하며, 각 원본도 직접 내려받을 수 있다.
- 보존 자료: 데모 네 부서 모두 유료·365일 보존 설정, 동의한 Slack 사용자 연결, 최근 내보내기 이력이 준비되어 있다(`retention_settings=4`, `retention_exports=4`, `mapped_members=4`).
- 앱 쓰기 차단: reviewer 세션의 same-origin 비-GET 요청은 proxy가 `403 demo_read_only`로 거부한다.
- DB 우회 차단: reviewer access token으로 `admin_create_department` SECURITY DEFINER RPC를 직접 호출해도 PostgreSQL trigger가 `42501 demo_read_only`로 거부한다.
- 무부작용: 네 부서 대시보드·원장·묻기 열람 전후 `llm_calls`, `jobs`, `items`, `answers`, `decisions`, `citations` 행 수가 동일하다.
- 모바일: Chromium 390×844에서 기능 지도 가로 넘침 없음.

실행 기록:

- `npm run lint` — 통과
- `npm run build` — 통과(Next.js 16.3.4)
- `npm run test` — 83 files, 1,035 tests 통과
- `npm run check:demo-release -- https://sasu-alpha.vercel.app` — 계정 연결 + 11개 기능 200
- `E2E_BASE_URL=https://sasu-alpha.vercel.app npx playwright test tests/e2e/demo-reviewer.spec.ts --project=chromium` — 4 tests, 자동 로그인·전체 기능·앱/DB 쓰기 차단·예시 파일 5개·검토 완주·390px 통과
- `E2E_BASE_URL=https://sasu-alpha.vercel.app npx playwright test tests/e2e/guest.spec.ts --project=chromium --grep "열람 전후"` — AI/DB 증가 0 통과
