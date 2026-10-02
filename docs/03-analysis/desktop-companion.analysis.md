---
template: analysis
version: 1.0
feature: desktop-companion
date: 2026-10-02
---

# desktop-companion Analysis

원천: [design](../02-design/features/desktop-companion.design.md) §11.2 비교 목록, [plan](../01-plan/features/desktop-companion.plan.md) §5·§6, [PRD §3-8·§11](../PRD.md), [ARCHITECTURE §6-12](../ARCHITECTURE.md), [ADR-082](../ADR.md). 실행 기록: [desktop-companion-2026-10-02](../verification/desktop-companion-2026-10-02.md), `docs/verification/43-desktop-companion/`.

## Context Anchor

| WHY | WHO | RISK | SUCCESS | SCOPE |
|---|---|---|---|---|
| 브라우저·슬랙 없이 묻기·결정·일 맡기기 | 부서원 전체 | 새 인증 경로 권한 누수·해제 지연, 로컬 원문 잔존 | 웹과 같은 답 · 알림 1분 · 펫에서 결정 · 설치·로그인 5분/해제 즉시 | Electron 앱 + `/api/companion/*` + `device_links` |

## 1. 결과 (1차, 2026-10-02 08시)

| 축 | 점수 | 근거 |
|---|---|---|
| Structural | 95 | 설계 파일·경로·웹 교체 전부 존재. 설계 밖 `GET /api/companion/members` 1개 |
| Functional | 78 | 펫 클릭 무반응, 트레이 빈 아이콘, "본 항목" 미저장, 위치 미저장, 동작 줄이기 설정 미사용, 알림 시각 미측정 |
| Contract | 85 | 경로·본문 일치. 오류 코드가 design §6과 다름, 429 보관이 §6과 다름, 펫 클릭 IPC 수신자 없음 |
| **Overall (정적)** | **84.2%** | 0.2×95 + 0.4×78 + 0.4×85 — **90% 미만 → 보완 step 추가** |

실행 근거: 루트 lint·test 1834·build, desktop lint·test 24·build, 훅 테스트, SQL 하니스 8/8·316+2016, `verify-companion-api` 실패 0, Electron E2E 5건, 설치 파일 `사수 Setup 0.1.0.exe`(약 114MB)·`latest.yml` 생성.

## 2. 비교 목록 (design §11.2)

| # | 항목 | 판정 |
|---|---|---|
| 1 | 0069 표·RLS·RPC·권한 | 일치 (리뷰 중 `auth.users FOR UPDATE` → advisory lock, `184176a`) |
| 2 | 하니스 등록·8개 사례 | 일치 |
| 3 | Bearer·기기 컨텍스트·inbox | 일치 |
| 4 | 공용 lib 5개 + W01~W05 | 일치 (권한·인용 로직 중복 없음) |
| 5 | E01~E13 | 일치 |
| 6 | E14~E16 + W06 | 일치 |
| 7 | W07·W08 웹 연결 기기 | 일치 |
| 8 | 루트 설정 4곳 | 일치 |
| 9 | 앱 본체 | **부분** — 펫 클릭 IPC 수신자 없음, 트레이 빈 아이콘 |
| 10 | core TDD 3개 | 일치 |
| 11 | 화면 U01~U14 | **부분** — U01·U02·U03·U04·U11·U12·U14 |
| 12 | 업데이트·설치 설정 | 부분 — 산출물 해시 미기록 |
| 13 | L1~L4 기록 | 부분 — L4(알림 1분 실측) 없음 |

## 3. Plan §6 Success Criteria

| 기준 | 판정 |
|---|---|
| 웹·앱 인용 가시성·거절 일치 | ✅ (`answerParity 2`, member `leads_only` 0) |
| member `leads_only` 0·교차 부서 403/404·타인 연결 0 | ✅ |
| 새 카드 → 펫·알림 1분 (실측) | ❌ 실측 없음, "본 항목" 미저장으로 두 번째 카드 알림 누락 가능 |
| 앱 결정 원장·연타 1건 | ✅ |
| 웹 해제 → 다음 요청 401 → 로그인 화면 | ✅ |
| 끊김 보관→전송→삭제, 평문 0 | ⚠️ 파일 검사는 있음, 로그 검사 기록 없음, 429 보관(§6 위반) |
| 깨끗한 Windows 5분 설치(녹화) | ❌ 사람 실측 대기 (C1 해결 선행) |
| 자동 업데이트 1회 | ❌ 사람·운영 승인 대기 |
| TDD·하니스·lint/build/test·analyze ≥ 90% | ⚠️ analyze 84% |

4 충족 · 2 부분 · 3 미충족.

## 4. 보안 (불변식 46~50, design §7 S1~S10)

위반 없음 — `app/api/companion/**`·`lib/companion/**`·desktop에 service role 0, Bearer import는 companion 경로로 ESLint 제한, renderer에 fetch·Supabase·`dangerouslySetInnerHTML` 0, `safeStorage` 없으면 저장 거부, 알림은 종류·건수만, 로그는 ID·길이·코드. 보완 권고(Minor): IPC 발신 창 검사, 설치 빌드에서 `SASU_DISABLE_UPDATER` 무시, 시작 실패 로그 코드 고정. 운영 게이트(S2 운영 권한·S8 실제 업데이트)는 미확인.

## 5. 차이 목록과 조치

| 등급 | ID | 내용 | 조치 |
|---|---|---|---|
| Critical | C1 | 펫 클릭 → `pet-toggle-panel`을 받는 `ipcMain` 없음, 패널 시작 시 숨김, 트레이 빈 아이콘 → 첫 사용자가 패널을 열 수 없음 | step 11 `desktop-fixes` |
| Critical | C2 | 알림 1분·5분 설치·업데이트 1회 미측정 | 알림 1분은 step 12 로컬 실측, 나머지는 사람 |
| Important | I1 | "본 항목" 미저장 → 펫 상태 고착·알림 누락 | step 11 |
| Important | I2 | 하루 한도(429)를 끊김 보관(design §6 위반 — step 8 명세 오류) | step 11 |
| Important | I3 | 오류 코드가 design §6 표와 다름(공용 웹 lib 코드 사용) | design §6을 실제 코드로 갱신(웹 동작 변경 없음) |
| Important | I4 | 펫 위치 미저장, 동작 줄이기 설정 미사용 | step 11 |
| Important | I5 | 운영 게이트 | O1 사용자 승인 |
| Minor | — | 트레이 라벨 갱신, 펫 색 즉시 반영, 설정의 단축키·기기 이름·실제 버전, 답 대기 120초 상한, 업데이트 주기 확인, 완료 알림 문구 종류별, IPC 발신 창 검사, `panel-blurred` 죽은 코드, `/api/companion/members` design 반영 | step 11 (설계 문서 반영은 오케스트레이터) |

결정(2026-10-02, 오케스트레이터): 차이가 desktop 여러 모듈에 걸쳐 있어 `/pdca iterate` 대신 하네스 step으로 보완한다. phase 43에 step 11 `desktop-fixes`를 추가하고 출시 검증을 step 12로 옮겨 다시 실행한 뒤 재분석한다.

## 6. 2차 결과 (2026-10-02 10시 — step 11 `desktop-fixes`·step 12 재검증 뒤)

| 축 | 1차 | 2차 | 근거 |
|---|---|---|---|
| Structural | 95 | 98 | 트레이 리소스 번들, E17 문서화, 죽은 코드 제거 |
| Functional | 78 | 92 | C1·I1·I2·I4·Minor 전부 닫힘 |
| Contract | 85 | 93 | §6 표가 실제 코드와 일치 |
| **Overall (정적)** | 84.2% | **93.6%** | 0.2×98 + 0.4×92 + 0.4×93 — **90% 통과** |

실행 근거(step 12 기록): 알림 실측 첫 카드 T0→펫 29,607ms·알림 29,616ms, 둘째 카드 29,483ms(60초 이하, 둘째 카드도 알림) · 펫 클릭 → 패널 표시 E2E · `userData`·로그 평문 0건 · 설치 파일 114,125,224바이트와 `latest.yml` SHA-512 · Electron E2E 5건 · SQL 8/8·316+2016 · `verify-companion-api` 실패 0.

2차에서 새로 찾은 것과 처리:

| ID | 등급 | 내용 | 처리 |
|---|---|---|---|
| G1 | Important | step 11이 질문 전송의 모든 4xx를 "하루 한도"로 표시(400·401·403 오인) | **고침** — 429만 한도 안내, 나머지는 서버 오류 그대로. TDD `desktop/src/main/__tests__/outbox-service.test.ts` 5건(빨강 3건 확인 뒤 초록), desktop 테스트 32건·lint·build 통과 |
| G5 | Minor | §6 표에 `source_too_large`(422) 누락 | **고침** — design §6 |
| G2 | Minor | 답 대기 중 2초마다 `seen`을 보낼 때 시작 시점 값으로 덮어써 카드 열람 기록이 빠질 수 있음 | 이월 — 본체에 "본 항목 하나 추가" 원자 연산 |
| G3 | Minor | 답 대기 폴링에 오류 처리 없음(네트워크 오류 시 조용히 멈춤) | 이월 — 오류 안내 |
| G4 | Minor | 연결 기기 이름이 "데스크톱 앱"으로 고정(웹 목록에서 구분 어려움), 설정은 `hostname()` 표시 | 이월 — 연결 시 `hostname()` 사용 |

Plan §6 Success Criteria (2차): 웹·앱 인용 일치 ✅ · 권한 경계 ✅ · 알림 1분 ✅(로컬 실측) · 결정 1건 ✅ · 해제 401 ✅ · 끊김 보관·평문 0 ✅ · 5분 설치 녹화 ❌(사람) · 업데이트 1회 ❌(사람·운영) · analyze ≥ 90% ✅ — **7/9 충족, 남은 2개는 사람·운영 게이트.**

## 7. Step 13 후속 분석 (2026-10-02)

비교 범위는 design §11.4 G2~G4다. [실행 기록](../verification/43-desktop-companion/followup.md). 기존 PRD 범위·원천 결정·서버 API·권한 판정과 일치한다.

| 차이 | 구조·기능·계약 | 실행 | 판정 |
|---|---|---|---|
| G2 | SettingsService 단일 큐, 읽음 ID 추가 IPC, 위치·삭제 공유, renderer 전체 목록 교체 거부 | 동시 저장·재시작 파일·암호화·발신 창 검증 | 해결 |
| G3 | 조회 오류 안내/종료, 2초·독립 120초 deadline, 새 질문/화면 종료 취소, 늦은 결과 무시, 재진입 중단 표시 | 단위 오류·timeout·취소 + Electron 안내·이동·재진입 | 해결 |
| G4 | 본체 hostname 60자, 부서 ID 전용 IPC, 서버 E02 그대로 | 실제 Electron E02 HTTP 수신 본문과 app:info 일치 | 해결 |

이번 비교 목록 **3/3(100%)**. scoped Structural/Functional/Contract/Runtime 100이며 skill 가중식도 100이다. 전체 기능 마지막 정적 점수 **93.6%**, Plan SC **7/9**는 별도 지표로 유지한다. 전 기능에 대한 새 3차 점수로 표시하지 않는다.

실행: desktop 단위 **56**, Electron 합성 **3**, PGlite 기기 연결 **8**, root 단위 **1,834**, 양쪽 lint·build 통과. gap-detector가 찾은 재진입 진행 표시와 실제 hostname 검증 누락을 수정한 뒤 재대조에서 추가 결함이 없었다. 최종 판정은 주 세션의 코드·실행 결과 검토다. Graft 새 그래프와 실제 Supabase 기반 전체 E2E는 Docker/네이티브 장애로 미확보다. Archify deliver·자동 브라우저 검사 통과.

사람 설치·업데이트·운영 승인 게이트가 남아 있어 전체 phase의 blocked 상태는 유지한다.

## 8. Step 14 세션·보관 후속 분석 (2026-10-02)

비교 범위는 design §11.5다. [실행 기록](../verification/43-desktop-companion/session-outbox.md). 기존 PRD DC-04·10·11과 설계 §6·7을 구현하며 서버/RLS·인용·운영 설정을 바꾸지 않았다.

| 항목 | 구조·기능·계약 | 실행 | 판정 |
|---|---|---|---|
| 세션 종료 | 설정/트레이/현재 401의 공통 종료, renderer 재마운트, 연결·펫·핀·알림 기준 초기화. 늦은 설정 반영 차단. 삭제 실패 재확인 후 로그인 | Electron 설정/401→다른 JWT 사용자 재로그인·이전 답/기록/설정 없음, Auth/트레이/설정 단위 | 해결 |
| 늦은 응답 | API 세대+abort, 이전 성공/401/본문 폐기, OTP 늦은 완료 삭제, 연결 대기 현재 401 처리 | API·OTP TDD + Electron 부서 연결 대기 401 | 해결 |
| 질문 보관 | 작업 큐/파일 큐 분리·종료 무효화·동률 FIFO·401 삭제 교착 방지 | 동시 flush/오프라인 send·삭제 중 응답·파일 오류 단위, 실제 Electron 2건 암호화 보관/종료 삭제 | 해결 |
| 재시도 제한 | network/timeout/5xx만 보관, invalid_response/4xx 재시도 없음 | 직접/보관 invalid_response TDD + Electron POST 1회/보관 0건 | 해결 |

목록 **4/4 해결**. 이 제한 범위의 Structural/Functional/Contract/Runtime 각 100%, 가중식 100%다. Runtime은 위 단위·합성 HTTP Electron 사례에 한정하며 실제 운영 DB·SMTP·OS 트레이 클릭·설치·게시 업데이트를 포함하지 않는다. 전체 기능 마지막 정적 **93.6%**·계획 **7/9**는 유지한다.

desktop 단위 **76/76**, 합성 Electron **7/7**, root **1,834/1,834**, 양쪽 lint/build, diff check 통과. gap-detector가 지적한 OTP/현재 401·동률 FIFO·늦은 설정 차이를 TDD와 실행 검증으로 보완한 뒤 재대조에서 추가 차이가 없었다. Archify 9/9·4 viewport 자동 검사 통과. Graft 전후 그래프와 실제 DB 전체 E2E는 이번에 미확보이며 기록에서 범위를 명시한다. 주 세션이 최종 코드·실행 기록을 판정했다. step14 완료, step12·전체 phase blocked 유지.

## 9. 운영 설치·업데이트 확인 (2026-10-02)

[운영 설치 기록](../verification/43-desktop-companion/production-install.md)에 실제 공개 설치 파일과 현재 PC 실행·DB 확인을 연결했다. 운영 guest 5/5, 패키지 safeStorage·정상 IPC, 6자리 테스트 코드 인증·부서 연결·inbox·새 질문의 근거 없음 거절을 확인했다. 이메일 수신은 시험하지 않았다.

SC8은 공개 0.1.0→0.1.1 업데이트 다운로드·종료 시 설치·새 버전 실행·세션 복원·정상 로그아웃과 로컬 파일 삭제로 충족했다. **Plan SC 8/9**. SC7 신규 Windows 설치·메일 수신·5분 전체 녹화와 발신 도메인/Resend SMTP 연결은 남아 있다. 마지막 전체 정적 점수 93.6%를 유지하며 전 기능 재분석의 새 점수로 계산하지 않는다. phase/step12 blocked 유지, 운영 웹·DB·설치 파일은 게시됨.
