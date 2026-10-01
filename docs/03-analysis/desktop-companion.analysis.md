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
