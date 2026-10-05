# 운영 로그인 코드 메일 실제 수신 확인 — 2026-10-05

사용자 요청: 남은 일을 진행하고, Aside 브라우저에 연결된 메일함으로 메일 확인을 직접 처리한다. 먼저 기존 발송 설정(Supabase 기본 발송기)으로 실제 수신을 확인했고, 이어서 사용자 승인으로 발신 도메인·Resend SMTP를 연결해 다시 확인했다. 신규 Windows 계정 5분 전체 녹화는 이 기록으로 완료 처리하지 않는다.

## 대상

- 계정: 운영에 가입된 실제 사용자 1명(`tjr***@gmail.com`, 파일럿 부서 lead, 동의 완료). 시드 QA 계정은 `@example.com`이라 수신할 수 없어 쓰지 않았다.
- 메일함: Aside 브라우저 Profile 0에 로그인된 같은 주소의 Gmail(`/mail/u/0`). Aside google-gmail 스킬의 동기화 API는 이 계정에서 HTTP 400을 내서 Gmail 화면을 열어 accessibility snapshot으로 읽었다.
- 발송 경로: 첫 확인은 운영 Supabase Auth 기본 발송기(사용자 지정 SMTP 없음), 재확인은 Resend SMTP.

## 실행 — 기본 발송기

| 단계 | 결과 |
|---|---|
| 코드 요청 | 공개 anon key로 `POST /auth/v1/otp`, `create_user: false`(데스크톱 앱과 같은 요청 형태). 2026-10-05T06:41:32Z, HTTP 200 |
| 수신 | 같은 분(오후 3:41 KST)에 받은편지함 도착. 발신 `Supabase Auth <noreply@mail.app.supabase.io>`, 제목 **사수 로그인 코드**, 본문 "사수 로그인 데스크톱 앱에 아래 로그인 코드를 입력해 주세요." + 6자리 코드 1개 + 웹 로그인 안내 |
| 코드 검증 | 받은 코드로 `POST /auth/v1/verify`(type email) HTTP 200, 같은 사용자 세션 발급. 확인용 세션은 즉시 `logout?scope=local` HTTP 204로 폐기 |

코드 값과 토큰은 출력·저장하지 않았다. 코드는 Aside 세션 디렉터리의 임시 파일로만 넘겨 검증 직후 삭제했다. 질문·모델 호출·DB 쓰기는 없다. 인증 이벤트(로그인·로그아웃) 1쌍만 남는다.

## Resend SMTP 전환 뒤 재확인 (같은 날)

사용자 승인("Cloudflare에서 진행하자")으로 발신 도메인을 연결했다. 절차는 [setup-guide](../../setup-guide.md) 상단에 있다.

| 단계 | 결과 |
|---|---|
| 도메인 | `getsasu.com` Cloudflare Registrar 1년 $10.46·자동 갱신. 등록 직후 공개 DNS(Cloudflare·Google)에서 NS `pam/rex.ns.cloudflare.com` 확인 |
| DNS | `resend._domainkey` TXT(DKIM), `send`·`rsend` CNAME(DNS only, Resend 발송 경로), `_dmarc` TXT `v=DMARC1; p=none;`. 공개 DNS 조회로 4개 모두 확인. Resend의 Cloudflare 자동 설정은 DNS 권한 위임이라 쓰지 않았다 |
| Resend | 기존 계정에 도메인 추가(Tokyo `ap-northeast-1`), 상태 `verified`. 추적 서브도메인 없음 → 클릭·열람 추적 없음. 키는 `sasu-supabase-auth-smtp`, Sending access, 도메인 `getsasu.com`만 |
| Supabase | Auth → SMTP Settings 사용자 지정 SMTP 켬, `smtp.resend.com:465`, 사용자 `resend`, 발신 `사수 <sasu@getsasu.com>`, 사용자당 최소 간격 60초 유지. 새로고침 뒤 값 유지 확인. 키 값은 브라우저 세션 변수로만 옮기고 출력·저장하지 않았으며 입력 후 지웠다 |
| 발송 | 2026-10-05T07:24:07Z `POST /auth/v1/otp`(`create_user: false`) 200. Resend 발송 기록 `delivered` |
| 수신 | 같은 분(오후 4:24 KST) Gmail 도착. 발신 `사수 <sasu@getsasu.com>`, 메일 발송 도메인 `rsend.getsasu.com`, 서명 `getsasu.com`, TLS. **Gmail이 스팸함으로 분류**(사유 표시: "이전에 스팸으로 확인된 메일과 유사합니다") |
| 코드 검증 | 받은 코드로 `verify` 200·같은 사용자 세션 → 즉시 로그아웃 204 |
| 메일함 조치 | 이 메일함에서 해당 메일만 "스팸 해제" |

## 판정과 한계

- 운영 템플릿(제목·6자리 코드·데스크톱 안내 문구)으로 **실제 메일이 1분 안에 도착하고 그 코드로 로그인된다**는 것을 확인했다.
- 기본 발송기 확인(오후 3:41)은 사용자 본인 주소였고, 이 주소가 기본 발송기의 허용 대상(조직 팀 멤버)인지는 확인하지 않았다. 지금 운영 발송은 Resend SMTP다. 사용자 지정 SMTP 전환으로 Supabase 메일 한도는 시간당 30통이 됐다(대시보드 안내).
- **Resend 경유 메일은 인증(SPF·DKIM 정렬)을 통과했지만 Gmail 스팸함에 들어갔다.** 도메인을 등록한 지 1시간이 안 돼 평판이 없고, 본문의 웹 로그인 링크가 발신 도메인과 다른 `*.supabase.co` 주소인 것이 원인 후보다. 사용자가 받은편지함에서 메일을 못 찾을 수 있다. 후속 후보: (1) 템플릿 링크를 사수 도메인의 `token_hash` 확인 경로로 바꾸기(코드 변경 → PDCA 대상), (2) `getsasu.com`을 운영 웹으로 연결해 빈 도메인 상태 벗어나기, (3) 발송량이 쌓인 뒤 Gmail Postmaster Tools로 평판 확인. 이번에는 아무것도 바꾸지 않았다.
- 다른 메일 서비스(네이버·다음·Outlook)의 분류는 확인하지 않았다.

## 후속 조치 (같은 날, 사용자 "남은거 다 해줘")

- **빈 도메인 해소:** Cloudflare에 `@`·`www` A 레코드(`192.0.2.1`, 프록시 켬 — 리디렉션 전용 더미 주소)와 Single Redirect 규칙 "getsasu.com → sasu 운영 웹"(호스트가 `getsasu.com`·`www.getsasu.com`이면 `https://sasu-alpha.vercel.app` + 같은 경로로 302, 쿼리 유지)을 추가했다. `https://getsasu.com/`·`/login`·`https://www.getsasu.com/`·`http://getsasu.com/demo?x=1` 모두 302로 운영 웹의 같은 경로에 도착함을 확인했다. 규칙 배포 직후 첫 요청 1회는 522였고 재요청부터 정상이었다. 나중에 이 도메인에 사이트를 올릴 수 있도록 영구(301)가 아닌 임시(302) 리디렉션으로 두었다. Vercel 프로젝트 도메인은 바꾸지 않았다.
- **메일 링크 교체는 보류:** 템플릿의 웹 로그인 링크를 `{{ .SiteURL }}/auth/confirm?token_hash=…`로 바꾸려면 새 인증 경로(`verifyOtp` token_hash)를 추가해야 한다. 그래도 링크 도메인은 `sasu-alpha.vercel.app`(여러 사용자가 함께 쓰는 vercel.app)이라 발신 도메인 `getsasu.com`과 여전히 맞지 않는다. 발신·링크 도메인을 맞추려면 운영 웹을 `getsasu.com` 하위 도메인으로 옮겨야 한다. 이때 `NEXT_PUBLIC_APP_URL`, Supabase Site URL·redirect 허용 목록, Slack OAuth redirect, 0.1.2 설치 파일에 들어간 `SASU_APP_URL`(새 데스크톱 릴리스 필요)을 함께 바꿔야 한다. 인증·배포 경계를 넘는 이전이라 bkit PDCA plan/design과 사용자 결정 뒤에 진행한다. 이번에는 바꾸지 않았다.
- **Gmail Postmaster Tools:** 하루 발송량이 충분히 쌓여야 데이터가 나와서 지금 등록해도 볼 것이 없다. 발송량이 쌓인 뒤 등록한다.
- 수신 화면 스크린샷은 남기지 않았다. 목록·본문 미리보기에 코드가 그대로 보이기 때문이다.
- 신규 Windows 계정에서 설치→실제 메일 코드 로그인→첫 답 5분 전체 녹화는 사람이 새 Windows 계정에 로그인해 진행해야 하는 게이트로 남는다.
