# 운영 배포·Windows 설치 확인 — 2026-10-02

사용자 요청 “운영 배포하고 설치도 해서 확인해봐”에 따라 운영 반영·설치 파일 게시·현재 PC 설치를 진행했다. 추가로 Resend 사용과 운영 이메일 코드를 8자리에서 승인된 설계의 6자리로 변경하는 승인을 받았다. 원천 범위는 PRD §3-8·§11, ARCHITECTURE §6-12, ADR-082와 기존 desktop-companion plan/design이다. 새 기능 설계는 없다. bkit deploy와 Vercel deployments-cicd·vercel-cli·marketplace 절차를 적용했다.

## 반영 대상과 원천

- 운영 웹: https://sasu-alpha.vercel.app
- PR #27 병합 `51d8cc6`, 운영 배포 `dpl_HF6LJMuCcPDuBprxcNwHVdjJeCnt` Ready. step 13·14를 포함하며 웹 API·DB 코드 변경은 없다.
- DB 프로젝트 `fzpnidoyhejrmhymggpp`: 0001~0069 적용, `auth.sessions` SELECT·DELETE 권한, `device_links`와 companion 함수 확인. 새 migration을 실행하지 않았다. [사전 확인](production-preflight.json).
- 배포 전용 공개 저장소: https://github.com/jooho1003/sasu-desktop-releases . 공개 파일은 README·설치 파일·블록맵·latest.yml이다.
- 0.1.0의 앱 코드는 `96a8b7f`와 같다. 0.1.1은 `483547a`: 버전과 설치 파일 이름 `sasu-desktop-setup-${version}.${ext}`만 바꿨다. 서버·SDK·권한·인용 규칙은 같다.

## 웹·워커 확인

운영 guest E2E **5/5**(2.4분): 1440px·390px 완주, 실제 부서 차단·잘못된 서명 거절, 열람 전후 LLM·DB 쓰기 증가 0. 실행 로그는 [production-guest.txt](production-guest.txt)다. 22:27 KST의 지난 10분 워커 확인은 cron succeeded 20건, HTTP 200 19건·status null 1건이었다. null 응답의 원인을 이 기록에서 단정하지 않는다. [DB 후검사](production-postflight.json).

## 인증 설정

운영 Supabase에서 Magic link or OTP 메일에 `{{ .Token }}`을 추가하고 웹의 `{{ .ConfirmationURL }}` 링크를 유지했다. 제목은 “사수 로그인 코드”. 사용자 승인 뒤 OTP 길이를 8→6으로 저장하고 다시 열어 값 6을 확인했다. 만료 시간·다른 인증 옵션은 바꾸지 않았다. [6자리 설정](screenshots/production-otp-six-digits.jpg), [템플릿](screenshots/production-otp-template.jpg).

Resend는 Vercel Marketplace messaging 검색으로 찾았고, CLI에서 Free(0.00) 요금제와 필수 소유 도메인 항목을 확인했다. 사용자는 아직 사수용 도메인이 없다고 답했다. 따라서 Resend 리소스·SMTP 연결·DNS 변경을 수행하지 않았고 기존 발송 설정을 유지했다. `getsasu.com`·`usesasu.com`·`sasuapp.com`은 확인 시 Verisign RDAP 404였으며 구매 화면에서 최종 확인해야 한다. 발신 도메인 등록·DNS 인증과 실제 메일 수신 확인이 남아 있다.

## 설치 파일과 현재 PC 실행

운영 공개 URL·anon 키만 주입해 다시 빌드했다. QA 주소·synthetic-public-key·리포 문서·env 파일·지정 서버 비밀값이 ASAR에 없고 SDK 하위 패키지가 존재하는지 확인했다. Electron 패키지 실행에서 `isPackaged=true`, safeStorage 암호화 가능, 로그인 화면과 정상 IPC를 확인했다. [0.1.0 감사](artifact-0.1.0.json), [0.1.1 감사](artifact-0.1.1.json).

| 항목 | 실측 |
|---|---|
| 운영 0.1.0 설치 파일 | 114,135,528바이트, SHA-256 `2a267fac23bec75dd3ef9b49b088bc448cd40abfde9a605f68dd733ba2c8343a` |
| 운영 0.1.1 설치 파일 | 114,135,507바이트, SHA-256 `5db825645d0e8877423b02f364c3543e83b1576558a3cb78f1df9e6a4e081664` |
| 현재 PC | Windows build 26200, 64비트, 현재 사용자 계정 |
| 설치 경로 | `%LOCALAPPDATA%\Programs\사수\사수.exe` |
| 설치 시간 | 22:14:22~22:14:39 KST, **16.94초**, exit 0 |
| 설치된 초기 버전 | 0.1.0.0 |
| 코드 서명 | `NotSigned` |

설치된 실행 파일을 Playwright Electron으로 열고 운영 테스트 계정의 일회용 6자리 코드 인증 → 동의한 부서 연결 → 운영 inbox 수신을 확인했다. Auth Admin은 테스트 코드 생성에만 썼고 앱의 인증·기기 API 호출은 일반 SDK/IPC·Bearer 세션 경로를 통과했다. 테스트 코드를 이메일로 보내거나 메일함에서 읽지 않았으며 `emailDeliveryVerified=false`다. [설치 기록](install-0.1.0.json), [운영 앱 확인](installed-production-flow.json).

앱 UI에서 질문을 보냈다. 새 답변 행 생성 시각 22:18:18 KST를 DB에서 확인했고, 22:18:29 KST에 `refused`·인용 0건 응답과 거절 안내를 확인했다. 첫 요청부터 처리까지 29.73초. 현재 PC의 설치 시작부터 이 응답까지 약 4분 8초였지만, 메일 수신·새 Windows 사용자·전체 화면 녹화를 포함하지 않으므로 **SC7 완료로 세지 않는다**. 인용이 있는 정상 답·권한 동등성은 기존 격리 QA 기록을 따르며 이번 운영 시험은 거절 사례다. 세션 파일의 이메일·access_token 평문 부재도 확인했다.

## 자동 업데이트

공개 v0.1.0·v0.1.1의 실제 설치 파일과 업데이트 피드를 사용했다. 최초 시험에서 22:49:29 KST에 공개 0.1.1 설치 파일을 내려받았고, 종료 뒤 설치된 실행 파일·앱의 버전 0.1.1과 최신 버전 안내를 확인했다. 마지막 로그아웃의 화면 전환이 파일 삭제보다 먼저 일어나 시험이 삭제 완료 전에 검사한 차이를 확인했다.

0.1.0을 다시 설치해 같은 흐름을 재검증했다. 두 번째 실행은 이미 SHA-512 검증된 캐시 파일을 사용했다. 23:00 KST에 앱 종료 시 설치 → 0.1.1 실행 → 인증 세션 복원 → 최신 버전 확인 → 정상 로그아웃 → session.bin·settings.bin·outbox.bin 삭제를 확인했다. 로그아웃 서비스의 완료 Promise를 기다린 뒤 검사했다. **SC8 실제 업데이트 1회 충족**이며, 시험 코드에서 버전 표시를 바꾸거나 테스트 피드를 쓰지 않았다. [실행 결과](installed-update.json), [다운로드 완료 화면](screenshots/installed-update-ready.png), [적용 화면](screenshots/installed-update-applied.png), [설치된 파일 최종 확인](installed-final.json).

## 검증 범위와 남은 게이트

- 최초 패키지는 공용 node_modules 정션의 하위 SDK 경로 수집 오류로 실행에 실패해 게시하지 않았다. 전용 폴더에 `npm ci`한 패키지가 실행 검사를 통과했다. 버전 변경 후 의존성 수집 지연도 전용 `npm ci` 뒤 다시 빌드해 해결했으며 상세 원인을 단정하지 않는다.
- 설치는 현재 사용자에 대한 NSIS `/S` 실행이다. 신규 Windows 계정 설치 화면·SmartScreen 체험·5분 전체 녹화가 아니다.
- 실제 메일 발송은 발신 도메인 등록·Resend/DNS/SMTP 연결 이후에 확인한다. SMTP를 완료했다고 표시하지 않는다.
- Graft의 새 그래프와 OS 트레이 메뉴 클릭은 확보하지 않았다. 구조와 앱 코드가 바뀌지 않았으며 기존 Archify 세션·보관 흐름과 step 13·14 코드/실행 기록을 참조한다.
- root unit 1,834·desktop unit 76·합성 Electron 7·양쪽 lint/build는 step 13·14 기록, 이번 변경의 검증은 운영 guest 5·배포 패키지 실행·현재 PC 설치·운영 인증/질문·실제 업데이트다.

전체 마지막 정적 분석 93.6%를 유지한다. Plan SC는 **8/9**이며, SC7 신규 Windows 설치·메일 수신·5분 전체 녹화와 Resend/SMTP 연결은 남아 있다. 운영 웹·DB·설치 파일은 반영됐지만 phase 전체를 완료로 표시하지 않는다.
