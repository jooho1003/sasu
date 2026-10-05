# Step 2: Windows 릴리스 반영·업데이트 검증

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-09·DC-12~16, §8, §11
- `docs/ARCHITECTURE.md` §6-12
- `docs/02-design/features/desktop-companion.design.md`
- `docs/02-design/features/desktop-question-followup.design.md`
- `docs/02-design/features/desktop-recent-work.design.md`
- `docs/02-design/features/desktop-decision-flow.design.md`
- `docs/02-design/features/desktop-sales-flow.design.md`
- `docs/02-design/features/desktop-upload-recovery.design.md`
- `docs/verification/43-desktop-companion/production-install.md`
- phase 44~48의 검증 기록과 완료 요약

## 작업

사용자의 테스트·반영·다음 step 연속 실행 지시에 따라 기존 승인 기능을 검증하고 공개 Windows 0.1.2에 반영한다. PR #30 → #33 → #34 → #35의 의존 관계를 보존한다. 현재 main의 CSP 변경도 유지한다. 자료 업로드 보완은 phase 48의 별도 설계·테스트를 따른다.

전용 패키징 디렉터리의 실제 의존성으로 운영 공개 URL·anon 키만 주입한다. ASAR의 비밀값·QA 설정·내부 문서 부재, 실제 의존성, 설치 파일 SHA-256/SHA-512와 latest.yml 일치를 확인한다. 검증한 설치 파일·blockmap·latest.yml만 공개 배포 저장소에 게시한다.

현재 PC의 0.1.1에서 공개 0.1.2 다운로드·종료 시 설치·새 실행·기존 세션 복원·로그아웃 파일 삭제를 확인한다. 초기 QA 인증과 업데이트 중 세션 복원 검증은 분리한다. 실제 메일 수신·신규 Windows 전체 녹화는 별도 사람 게이트이며 완료로 처리하지 않는다. DNS/Resend SMTP는 사용자 보류를 유지한다.

## 검증 명령

```powershell
npm run lint
npm run build
npm run test
node scripts/verify-security-sql.mjs
npm --prefix desktop run lint
npm --prefix desktop run build
npm --prefix desktop run test
npm --prefix desktop run e2e -- followup.spec.ts
npm --prefix desktop run e2e -- upload-recovery.spec.ts
git diff --check
```

운영 guest Playwright 회귀, 패키지 감사·실행, 실제 공개 업데이트 결과와 스크린샷을 `docs/verification/desktop-release-2026-10-04/`에 연결한다. 새 마이그레이션·서버 권한·모델 호출 경로를 추가하지 않는다. Graft/Archify 실제 결과와 미확보 범위를 각 기능 검증 문서에 남긴다.

## 완료 판정

실행 기록을 확인한 뒤 step과 phase 44~48의 설치 파일 반영 상태를 갱신한다. 공개 게시와 실제 업데이트 검증을 구분한다. phase 43 step 12의 메일·신규 Windows 사람 게이트는 유지한다.
