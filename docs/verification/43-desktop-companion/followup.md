# Step 13 — 데스크톱 검수 이월 보완

- 실행일: 2026-10-02 (KST)
- 범위: 기존 설계 §11.4, 2차 분석의 G2~G4. 운영 변경·설치 게시 없음.
- 설계: [desktop-companion.design.md](../../02-design/features/desktop-companion.design.md), [step 13](../../../phases/43-desktop-companion/step13.md)

## 변경과 코드 관계

| 대상 | 변경 | 실행 근거 |
|---|---|---|
| G2 열람 기록 누락 | renderer가 ID만 `settings.markSeen`으로 전달한다. 본체 SettingsService의 단일 큐가 최신 파일을 읽고 ID를 추가한다. 설정·위치 변경·로그아웃 삭제도 같은 큐다. 중복 제거·최근 500건·저장 실패 후 큐 복구를 유지한다 | 설정 서비스 7개 단위 사례, IPC 입력/창 검사, 실제 Electron 암호화 파일·동시 저장·위치·reload |
| G3 폴링 오류 | 첫/후속 조회 오류를 잡아 안내하고 종료한다. 2초 조회·독립 120초 deadline. 새 질문·탭 이동·로그아웃 화면 전환에서 취소하며 늦은 결과를 무시한다. 재진입한 pending 답은 중단/기록 안내를 표시한다 | core 폴링 8개 추가 사례, 오류 문구 5개 사례, Electron 오류·탭 이동·재진입·완료 답 열람 |
| G4 기기 이름 | renderer는 부서 ID만 전달한다. 본체 hostname(60자 이내)을 E02와 앱 정보에 같이 사용한다 | IPC handler 4개 사례 + 실제 Electron preload→IPC→ApiClient→합성 HTTP 수신 본문과 앱 정보 비교 |

설정의 경로는 `App → preload → IPC → SettingsService → EncryptedFile`이다. `window:movePet`과 AuthService의 로컬 설정 삭제도 동일 SettingsService를 사용한다. 기존 서버 E02, Bearer/RLS, 업무 job, 인용 판정은 그대로 따른다. 질문 원문을 설정 파일에 추가하지 않는다.

## 실행 기록

| 명령 | 결과 |
|---|---|
| `npm --prefix desktop test -- --reporter=dot` | PASS · 10 files / 56 tests (기존 32 + 보완 24) |
| `npm --prefix desktop run lint` | PASS · TypeScript·ESLint 오류 0 |
| `npm --prefix desktop run build` | PASS · E2E beforeAll에서 실행. main 73.97kB, preload 3.90kB, renderer 684.60kB |
| `npm --prefix desktop run e2e -- --grep 'desktop followup'` | PASS · 최종 3/3, 8.4초. 원 로그 `.vercel/desktop-followup-e2e.log` |
| `node scripts/verify-device-links-sql.mjs` | PASS · 8/8, rollback=true, isolated PGlite |
| `npm run lint` | PASS · 오류 0. 기존 ESLint 경고 2·문구 경고 84(차단 0) |
| `npm run build` | PASS · Next.js 16.3.4 Turbopack. 컴파일 3.8분, TypeScript 통과, 정적 페이지 49/49 |
| `npm run test -- --reporter=dot` | PASS · 183 files / 1,834 tests |
| `git diff --check` | PASS |

Electron은 실제 본체·preload·renderer·DPAPI 파일을 실행했다. 첫 두 사례는 업무 응답을 합성 IPC로 제공하고, 세 번째는 127.0.0.1 합성 Auth/HTTP 서버에 실제 요청을 보낸다. 실제 Supabase 인증/DB 전체 흐름·운영 SMTP를 재검증한 결과로 보지 않는다. 테스트 서버·Electron은 finally/afterAll에서 종료했다. E2E 산출물은 합성 서버 주소로 빌드된 로컬 QA용이다. 이번 step에서 새 운영용 설치 파일을 만들지 않았다.

[오류 안내 화면](screenshots/desktop-followup-poll-error.png)을 직접 확인했다. 내부 채널·Error·network 코드는 화면에 없고, 조회가 멈췄다는 안내와 기록에서 확인하라는 문구가 보인다.

## 실패와 보완

1. TDD 빨강: SettingsService 미생성·startAnswerPolling 미구현으로 suite 1개/사례 7개가 실패했다. 구현 뒤 통과했다. 이어 오류 메시지 모듈 미생성과 미완료 조회의 120초 종료 실패를 확인하고 구현했다.
2. 첫 Electron 실행은 첫 사례의 45초 제한을 넘었다(두 번째는 통과). 빌드와 첫 앱 실행을 포함하는 suite의 제한을 90초로 명시했다. 최종 같은 사례는 1.0초였다.
3. 화면 캡처에서 IPC 오류 포장이 사용자 안내에 남는 것을 발견했다. 오류 문구를 순수 helper로 옮겨 포장을 제거하고, 진행 표시를 종료했다.
4. gap-detector 정적 대조가 탭 재진입 시 남는 무기한 진행 표시와 실제 hostname 전송 검증 누락을 발견했다. 중단 안내와 재진입 assert, 실제 Electron HTTP 캡처 사례를 추가했다.
5. 새 IPC mock의 인자 타입 추론과 deadline의 prefer-const로 desktop lint가 실패했다. mock 시그니처·const를 수정하고 통과했다.
6. 세 번째 E2E의 합성 JWT signature가 base64url 길이 조건을 어겨 SDK 세션 저장이 실패했다. 설치된 auth-js의 decodeJWT 계약에 맞춰 fixture를 수정했다. 해당 사례 단독 통과 뒤 전체 3건을 재실행해 통과했다.

## 개발 도구 결과

- **Graft:** MCP와 PATH CLI가 없었다. 기존 로컬 0.19.0 CLI를 실행했으나 tree-sitter-kotlin 네이티브 모듈의 `ERR_DLOPEN_FAILED`(유효한 Win32 앱 아님)로 실패했다. Docker Desktop을 숨김 실행했지만 default와 desktop-linux 엔진 파이프 모두 사용할 수 없었다. 새 전후 그래프는 **미확보**다. 위 코드 관계는 실제 파일/호출부를 읽어 확인한 것으로 Graft 산출물이 아니다.
- **Archify 3.0.1:** 기존 로컬 설치를 사용했다. 첫 render의 위치 라벨 겹침을 수정한 뒤 deliver·자동 browser-check가 통과했다. [명세](desktop-followup-flow.json), [delivery](desktop-followup-flow.delivery.json), [브라우저 기록](desktop-followup-flow.browser-check.json). 1440×900·1600×1000·1920×1080·2048×1320, diagnostics 0, 넘침 없음. HTML은 `.vercel/desktop-followup-flow.html`에 있다. 자동 브라우저 검사이며 별도의 도표 시각 검수는 수행하지 않았다.
- **React 스킬 검토:** 타이머 cleanup, 늦은 응답 무시, 오래된 settings closure 제거, sending 중 제출 차단, renderer 네트워크/Node 미노출을 확인했다.

## 판정과 남은 범위

step 13의 G2~G4 **3/3 충족**. 구조·기능·IPC 계약·합성 런타임 대조 모두 일치한다. 전체 기능의 마지막 일치율은 2차 분석 **93.6%**, Plan 성공 조건은 **7/9**를 유지한다. 이번 소범위 분석으로 전체 점수를 다시 산정하지 않는다.

step 12 및 전체 phase는 사람 실측·운영 승인 대기로 **blocked**다. 깨끗한 Windows의 5분 설치 녹화, 게시 후 업데이트 1회, 운영 auth.sessions 권한·0069·SMTP·메일 템플릿·배포 저장소가 남아 있다. Docker 미가용으로 실제 로컬 Supabase 기반 기존 5개 전체 흐름은 이번에 재실행하지 않았다. 기존 step 12의 실측 기록은 보존한다.

실패한 첫 시도의 `sasu-desktop-followup-tU8K6F` 임시 폴더 수동 정리는 명령 승인 정책의 `blocked by policy`로 거부됐다. 빈 폴더에 한정한 비재귀 삭제도 거부되어 그대로 두었다. 해당 이름을 사용하는 Electron 프로세스는 최종 조회에서 0개였다.
