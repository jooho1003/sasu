# Step 10: desktop-release-verify

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-12·§8-1 데스크톱 행·§11 "데스크톱 동반 앱" 행(판정 기준 전체)
- `docs/ARCHITECTURE.md` §6-12 불변식 46~50, §8
- `docs/ADR.md` ADR-082 결정 9·10
- `docs/02-design/features/desktop-companion.design.md` §7(S8)·§8(L1~L4)·§11.2(비교 목록 13개)
- step 0~9의 기록: `docs/verification/43-desktop-companion/*.md`, `phases/43-desktop-companion/index.json` summary
- `desktop/` 전체, `scripts/verify-companion-{gates,auth,api}.mjs`

## 작업

1. 배포 설정(게시는 하지 않는다):
   - `desktop/electron-builder.yml`: `appId`, `productName: 사수`, Windows `nsis`(사용자별 설치, 바로가기), 산출물 `desktop/release/`, `publish: github`(소유자 `jooho1003`, 저장소 `sasu-desktop-releases`, `releaseType: release`). 스크립트는 `--publish never`만 쓴다.
   - `desktop/src/main/updater.ts`: 패키지 빌드에서만 켠다. 백그라운드 다운로드 → 종료 시 설치, 설정 탭에 상태 표시. 사전 배포판 받지 않음. 업데이트 로그에도 원문 없음.
   - `npm --prefix desktop run dist`로 설치 파일을 만든다.
2. L3 전체 흐름(`desktop/tests/e2e/full-flow.spec.ts`, 로컬 QA): 코드 로그인 → 부서 → 시드 답 열기(인용) → 카드 결정·연타 1건 → **웹 설정에서 이 기기 해제 → 앱이 다음 요청에서 로그인 화면** → 다시 로그인 → 네트워크 끊김(`session.enableNetworkEmulation({offline:true})`)에서 질문 → "연결되면 보낼게요" → 연결 복구 → 전송 → 끊김 보관 파일 삭제.
3. L4 로컬 실측(PRD §11 행), `docs/verification/desktop-companion-YYYY-MM-DD.md`에 시각·명령·결과로 기록:
   - 새 담당 카드 시드 시각 → 펫 "확인 필요"·Windows 알림 시각, 차이 60초 이하.
   - 같은 질문의 웹·앱 인용 가시성 동일(lead·member) — `verify-companion-api.mjs` 결과 인용.
   - 앱 `userData` 폴더와 앱 로그 전체에서 테스트 질문 문자열 평문 0건(`Select-String`).
   - 해제 직후 다음 요청 401.
4. 설계 대비 확인: design §11.2 비교 목록 13개 각각의 파일·명령 근거를 기록에 적는다.
5. **사람만 할 수 있는 항목**은 실행하지 말고 기록에 "대기"로 적는다:
   - 깨끗한 Windows 사용자 계정에서 설치 → 로그인 → 첫 답 5분 안(화면 녹화).
   - 배포 전용 공개 저장소 생성·첫 게시·자동 업데이트 1회 실제 적용.
   - 운영: `auth.sessions` 삭제 권한 확인, 마이그레이션 적용, 메일 SMTP 전환, 6자리 코드 템플릿.
6. 1~4가 통과하면 `"status": "blocked"`, `"blocked_reason": "사람 실측·운영 승인 대기: 5분 설치 녹화, 배포 저장소·업데이트 1회, 운영 auth.sessions 권한·0069 적용·SMTP·메일 템플릿 (기록: docs/verification/desktop-companion-YYYY-MM-DD.md)"`로 멈춘다.

## Acceptance Criteria

```powershell
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix desktop run build
npm --prefix desktop run dist
npm --prefix desktop run e2e
node scripts/verify-device-links-sql.mjs
node scripts/verify-security-sql.mjs
node scripts/verify-companion-api.mjs
npm run lint
npm run build
npm run test
node scripts/review-qa.mjs guest-test
git diff --check
```

## 검증 절차

1. AC 실행.
2. 기록 문서에 PRD §11 행의 항목별 결과(통과·대기)를 빠짐없이 적는다.
3. `phases/43-desktop-companion/index.json` step 10을 위 6의 `blocked`로 갱신한다(로컬 검증이 실패하면 `error`).

## 금지사항

- 설치 파일을 게시하거나 GitHub 저장소를 만들지 마라. 이유: 외부 공개 작업이라 운영 반영 승인 뒤에 사람이 한다(ADR-082 결정 9).
- 운영 DB·운영 Supabase 설정·메일 템플릿을 바꾸지 마라. 이유: 불변식 22·PRD §3-8 운영 반영 전제.
- 사람 실측 항목을 추정치로 채우지 마라. 이유: PRD §11 — 실행 기록만 완료 근거다.
- 설치 파일(`desktop/release/`)을 커밋하지 마라. 이유: 큰 바이너리이며 게시 경로가 따로 있다.
