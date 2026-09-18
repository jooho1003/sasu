# Step 7: invite-verification

phase 전체 검증 기록을 만들고, **조직 개시는 사람 판정으로 남긴 채 `blocked`로 멈춘다.**

## 읽어야 할 파일

- `/docs/PRD.md` §11 검증표 · §8-1 "조직별 개시" 행 · `/docs/ADR.md` ADR-062·ADR-047 · `/docs/ARCHITECTURE.md` 불변식 22
- `/docs/setup-guide.md` §10(사람 판정 게이트) · `/docs/submission-checklist.md`
- `docs/verification/trailer-assessment.md`·`trailer-publish.md`(기록 형식) · `phases/12-trailer-assessment/step4.md`(검증 step 형식)
- step 0~6의 완료 요약과 산출물

## 작업

1. 전체 회귀: 단위·SQL 하니스 2개·빌드·E2E A(플래그 off 상태의 기존 예고편·데모·게스트 스펙 전부).
2. E2E B(QA 조직): 플래그 off로 배포된 프리뷰 또는 로컬 프로덕션 서버 + QA DB에 `00NN` 적용 → `SASU_TRAILER_INVITES_ENABLED=true`, QA 조직만 `trailer_assessment_enabled=true`(운영 스크립트) → step 2·4·5 B 케이스 실행 → 다시 off.
3. 권한·누출 점검(실행 기록으로): anon이 `trailer_invites` select 0행 · 데모 조직 발급 거부 · `/t/i/<token>` 응답 본문에 `dept_id`·`org_id`·`trailer_id` 문자열 없음 · 서버 로그에 이메일·토큰·이유 원문 없음(로그 캡처 grep) · 지원자 페이지 로드 시 쿠키 0·storage 0 · `/t/[slug]` 기존 응답과 문구 불변(스냅샷 diff).
4. `docs/verification/trailer-invites.md`: 실행 커맨드·결과·캡처(부서장 발급 표 1440px, 지원자 동의 화면 390px, 지원자 제출 탭). 실행하지 않은 항목은 "미실행"으로 적는다.
5. `phases/26-trailer-candidate-links/index.json`의 이 step을 `blocked`로 두고 사유를 적는다: **"조직 개시(`orgs.trailer_assessment_enabled`)는 법률 자문·처리방침 게시 확인 후 사용자 승인으로만. 운영 DB 적용·플래그 on·배포는 이 step 범위 밖."**

## Acceptance Criteria

```bash
npm run lint && npx tsc --noEmit && npm run test && npm run build
node scripts/verify-trailer-invites-sql.mjs "D:/바이브코딩/.sasu-qa-db"
node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"
npx playwright test --config playwright.trailer.config.ts          # A 통과
E2E_TRAILER_INVITES=1 npx playwright test tests/e2e/trailer-invite-page.spec.ts tests/e2e/trailer-invites.spec.ts --config playwright.trailer.config.ts   # QA 조직에서만
```

## 금지사항

- 운영 DB에 마이그레이션을 적용하거나 운영 조직의 플래그를 켜지 마라. 이유: ADR-047·ADR-062 2항 — 사람 판정.
- 검증하지 않은 항목을 통과로 적지 마라. 이유: 완료 판정은 실행 기록이다(AGENTS.md).
