---
template: report
version: 1.0
feature: desktop-companion
date: 2026-10-02
---

# desktop-companion Completion Report

> **Status**: Partial (2026-10-02 시점) — 운영 웹·DB·Windows 0.1.1 설치판 게시·현재 PC 설치/업데이트 확인. Plan SC 8/9, 신규 Windows 5분 녹화·도메인/Resend SMTP 대기
>
> **2026-10-05 갱신**: phase 43 step 12 완료(`verification_mode: automated_recording`). SC7은 Claude 자동 조작 녹화로 충족 처리, Plan SC 9/9. 단 사람 실측이 아니다(§12). 아래 본문의 8/9·blocked·대기 서술은 10/02 기록이다.
>
> **Project**: 사수 (SASU) · **Version**: 0.1.1 · **Author**: Codex
>
> **Completion Date**: 2026-10-02 · **PDCA Cycle**: phase 43 · **Design Match Rate**: 93.6%

원천: [PRD §3-8 DC-01~12·§4·§8-1·§11](../../PRD.md) → [ARCHITECTURE §6-12](../../ARCHITECTURE.md) → [ADR-082](../../ADR.md) → [설계](../../02-design/features/desktop-companion.design.md) → [실행 기록](../../verification/desktop-companion-2026-10-02.md). step 0~11·13·14 완료·step 12는 사람·운영 게이트로 blocked(10/02 시점; 10/05 step 12 완료, §12).

## Executive Summary

### 1.1 Project Overview

| Item | Content |
|---|---|
| Feature | Windows Electron 데스크톱 펫 앱. 브라우저·슬랙 없이 질문·결정·일 맡기기 |
| Start Date / End Date | 2026-10-01 / 2026-10-02 |
| Duration | 11시간 18분 (step 0~11 완료), step 12는 게이트 대기 |
| Scope | Windows Electron + `/api/companion/*` 14개 + `device_links` 테이블·RPC 3개 + 웹 기기 관리 + 공용 lib 5개 |

### 1.2 Results Summary

설계 일치율 **93.6%** (1차 84.2% → step 11 보완), 계획 성공 조건 **7/9 충족**. 전체 단위 **1,834건**, SQL **8/8 신규 + 316/2,016 권한**, E2E **5건 통과**. 설치 파일 114,125,224바이트 생성·SHA-512 기록. 알림 실측 **29,607ms·29,483ms** (60초 이내 만족). 웹 API·DB는 2026-10-02 운영 반영([기록](../../verification/desktop-companion-production-2026-10-02.md)), 설치 파일은 미게시.

### 1.3 Value Delivered

| Perspective | Content |
|---|---|
| **Problem** | 사수 웹·슬랙을 열어야 질문하고 결정 카드나 작업 알림을 놓친다. 슬랙 없는 팀은 접근 경로가 없다. |
| **Solution** | Windows 데스크톱 펫 앱. 기존 권한·`can_see()`·RLS·인용 검증을 공용 lib로 사용하며, 기기 Supabase 세션(Bearer)으로 웹과 같은 답을 받는다. 새 인증 경로 복제 없음. |
| **Function/UX Effect** | 전역 단축키(`Ctrl+Alt+S`)로 묻기, 펫 상태 4종으로 할 일 표시, Windows 알림(1분 안 도착), 그 자리에서 결정·기록 올리기. 깨끗한 설치 5분·해제 즉시. |
| **Core Value** | 웹과 같은 권한·같은 인용 거절, 로컬 원문 암호화만, 알림은 내용 미노출. 부서 결정이 아니라 연결된 기기에서만 동작(RLS). 운영 반영 뒤 실제 사용자 효율 평가 미완료. |

## 1.4 Success Criteria Final Status

| # | Criteria | Status | Evidence |
|---|---|---|---|
| SC1 | 웹·앱 질문 인용 가시성·거절 일치(lead·member 각각) | ✅ 충족 | `verify-companion-api` answerParity 2·memberLeadsOnlyCitations 0 |
| SC2 | member `leads_only` 0건·교차 부서 403/404·타인 연결 0건 | ✅ 충족 | SQL 하니스 8/8·교차 부서 테스트·E2E |
| SC3 | 새 카드 → 펫 상태·Windows 알림 1분 안(실측 시각) | ✅ 충족 | 첫 카드 T0→펫 29,607ms·알림 29,616ms, 둘째 29,483ms(로컬 SQL 삽입 기준) |
| SC4 | 앱 결정이 원장에 남고 연타 중복 1건(멱등) | ✅ 충족 | Electron E2E 연타 테스트·SQL `request_id unique` |
| SC5 | 웹 해제 직후 다음 앱 요청 401 → 로그인 화면 | ✅ 충족 | E2E full-flow, `session_invalid` 경로 매핑 |
| SC6 | 끊김 보관 → 재연결 전송 → 로컬 파일 삭제, 평문 0건 | ✅ 충족 | `outbox.bin` 암호화·파일 삭제 확인·userData 평문 grep 0·로그 ID·길이·코드만 |
| SC7 | 깨끗한 Windows 설치 → 로그인 → 첫 답 5분(녹화) | ❌ 미충족 (10/02 시점) → ✅ 2026-10-05 자동 녹화로 충족(사람 실측 아님) | 10/02: 사람 실측 대기. 10/05: [first-run-2026-10-05.md](../../verification/43-desktop-companion/first-run-2026-10-05.md) 설치 시작→첫 답 93.5초·인용 2개 |
| SC8 | 자동 업데이트 1회 실제 적용 | ❌ 미충족 (10/02 시점) → ✅ 10/02 운영 업데이트로 충족 | 10/02 후반: §11·[production-install.md](../../verification/43-desktop-companion/production-install.md) |
| SC9 | TDD·하니스·lint/build/test·analyze ≥ 90% | ✅ 충족 | desktop 단위 32·루트 1,834·SQL 8/8·권한 2,016·analyze 93.6% |

**Success Rate: 7/9 (78%, 10/02 시점; 10/05 기준 9/9)** — 당시 2개 미충족은 사람·운영 게이트. 이월 G2~G4는 step 13에서 해결했다(아래 §9).

## 1.5 Decision Record Summary

| Source | Decision |선택 사항 | Followed? | Outcome |
|---|---|---|---|---|
| Plan §2 대안 | A(웹 화면·쿠키) vs B(앱이 그리기·Bearer) | **B 선택** (사용자 요청) | 예 | Electron·Bearer·기기 세션 구현. A보다 독립적 구현이지만 권한·인용 lib 공유로 복제 회피 |
| Design 설계안 | A(모든 경로 Bearer) vs B(기존 경로 전부 복제) vs C(권한·인용·작업만 lib) | **C 선택** | 예 | 웹 경로 5개만 교체(W01~W05), 설계 문서·회귀 범위 최소화 |
| Plan §3 인증 | 자체 토큰 vs Supabase 세션 vs JWT | **6자리 이메일 코드 OTP** | 예 | 기존 Auth 경로 재사용, `link_device` RPC로 즉시 연결·쌍 세션 생성 |
| Design §3.2·Plan §7 | 영업 원문 검토 입력 형식 | **AG-07 실제 원문 선택** (자유 텍스트 안 함) | 예 | lead가 원문 4건 선택 > 요청·진행, 기존 원문 확정 계약 준수 |
| Design §8·Plan §7 | 설치·게시·서명 | **로컬 배포 전용 공개 저장소** (코드 서명 없음) | 예 | HTTPS + SHA-512 해시·2FA, 서명은 PRD §8-1 후속(구현 불가)·실측 미포함 |
| Phase 번호 | 동시 branch(41·42)와 충돌 | **43·ADR-082·0069·PRD 1.28** | 예 | 일관성 유지·리포 병합 순서 재확인 필요 |

## 2. Related Documents

| Phase | Document | Status |
|---|---|---|
| Plan | [계획](../../01-plan/features/desktop-companion.plan.md) | 확정 |
| Design | [설계](../../02-design/features/desktop-companion.design.md) | 확정·업데이트 1회(error codes·E17) |
| Check | [분석](../../03-analysis/desktop-companion.analysis.md) | 완료 (1차 84.2% → 2차 93.6%) |
| Act | 본 보고서 | 완료 |
| Verification | [최종 실행 기록](../../verification/desktop-companion-2026-10-02.md) | 기록 |
| Step Details | [단계 7개](../../../docs/verification/43-desktop-companion/), [index.json](../../../phases/43-desktop-companion/index.json) | step 0~11 완료·step 12 blocked |

## 3. Completed Items

### 3.1 Functional Requirements

| ID | Requirement | Status | Notes |
|---|---|---|---|
| FR-01 | 투명·항상 위·드래그 펫, 상태 4종, 설정·모양 저장 | 완료 | 펫 창 128×128, 5개 상태 우선순위, `safeStorage` 위치/모양, step 11에서 토글 수신자 추가 |
| FR-02 | 전역 단축키·트레이·숨기기·연결 해제·종료 | 완료 | `Ctrl+Alt+S`, 트레이 메뉴, step 11에서 아이콘 리소스 추가 |
| FR-03 | 이메일 6자리 코드 → 부서 선택 → `device_links` 생성 | 완료 | `link_device` RPC, 부서별 멤버십 확인, 동의·비데모 검사 |
| FR-04 | `/api/companion/ask·answers/[id]` 기존 경로 공용화·하루 50회 | 완료 | `startAsk`·`readAnswerView` lib, 429만 한도로 표시(step 11 G1 수정) |
| FR-05 | 본인 질문 기록·현재 인용 권한 없으면 숨김 | 완료 | E08(질문 20개씩)·인용 RLS 검사 |
| FR-06 | 내 담당 미결정 카드·결정/보류/반려·멱등 | 완료 | `decideCard` lib, E09~E10, `request_id unique`, step 11에서 "본 항목" 저장 추가 |
| FR-07 | 30초 상태 요약·1분 안 펫·Windows 알림 | 완료 | `pet-state` 폴러(30초)·알림(1분), 실측 29.6초 |
| FR-08 | 회의·자료·음성 3단계·lead 영업 원문 검토 | 완료 | E11~E12·E14~E16, AG-07 실제 원문, phase 41 병합 뒤 E15 작동 |
| FR-09 | 웹 기기 목록·해제·다음 요청 401 | 완료 | E17(웹), `revoke_device_link` RPC, `session_not_found` 매핑 |
| FR-10 | 질문만 암호화(20건·24시간)·전송 후 삭제 | 완료 | `outbox.bin` AES 암호화·`safeStorage` 키, grep 검사 0 |
| FR-11 | 자동 업데이트·무결성 SHA-512 | 완료 | `electron-updater`, `latest.yml` 생성(배포 미반영) |

### 3.2 Non-Functional Requirements

| Item | Target | Achieved |
|---|---|---|
| 권한 판정 | 기존 `can_see()`·RLS·RPC만 | 공용 lib 5개, 앱 판정 새로 안 함 |
| 토큰 | Bearer 헤더만·웹 경로는 쿠키 그대로 | `lib/supabase/bearer.ts`, 기존 웹 경로에 Bearer 검사 없음(`allowRoleToIgnore` 제외) |
| 개인 정보 보호 | 질문 원문 평문 0·로그는 ID·길이·코드 | E2E stdout/stderr·userData·서버 로그 grep 0 |
| 실시간성 | 새 카드 → 펫·알림 1분 안 | 실측 29,607ms·29,483ms(두 번째 새 카드도 알림) |
| 해제 | 웹 해제 직후 다음 요청 401 → 앱 로그인 화면 | `session_invalid` 매핑, E2E 통과 |
| 설치 | 깨끗한 Windows 5분 안(화면 녹화) | 사람 실측 대기 |
| 배포 | 공개 저장소 HTTPS + 해시 | 로컬 파일 생성·게시 미반영 |

### 3.3 Deliverables

| Deliverable | Location |
|---|---|
| 기기 연결 스키마 | [0069_device_links.sql](../../../supabase/migrations/0069_device_links.sql) |
| 기기 연결 검증 | [verify-device-links-sql.mjs](../../../scripts/verify-device-links-sql.mjs) (8/8) |
| Bearer 클라이언트 | [lib/supabase/bearer.ts](../../../lib/supabase/bearer.ts) |
| 공용 lib 5개 | `lib/companion/{device-context,inbox,context}.ts` + `lib/{ask-start,answer-view,card-view,card-decide,transcript-upload}.ts` |
| 앱 경로 E01~E16 | [app/api/companion/](../../../app/api/companion/) E01~E17(route 파일 15개) |
| 웹 기기 API | [app/api/devices/](../../../app/api/devices/), [components/settings-devices.tsx](../../../components/settings-devices.tsx) |
| Electron 앱 | [desktop/](../../../desktop/) (desktop 단위 32건·core TDD·Electron E2E 5건) |
| 설치 파일 | 114,125,224 bytes, SHA-512 `KrUuGShgkaGmUq6UXaBuk829+u6ACrD5JwqYO3S7GGRvIBJHzaRHSKGRIQYF65B/r8WWbA55qX4KOjXbBt7Zjw==` |
| 실행 기록 | [desktop-companion-2026-10-02.md](../../verification/desktop-companion-2026-10-02.md), [43-desktop-companion/](../../verification/43-desktop-companion/) |

## 4. Incomplete Items

### 4.1 사람 게이트 (Human Gates)

SC7·SC8 미충족:
1. **5분 설치 녹화**: 깨끗한 Windows 사용자 계정에서 설치 → 로그인(OTP 코드) → 첫 질문·답변까지 시각 기록. C1(펫 클릭 패널 표시) step 11에서 해결 후 가능.
2. **자동 업데이트 1회**: 배포 저장소 생성 → 첫 버전 게시 → 앱 업데이트 매니저가 다운로드·재시작 후 버전 확인. 운영 승인·배포 토큰 필요.

### 4.2 운영 게이트 (Operations Gates)

배포 전제:
1. **마이그레이션 0069 적용**: 완료 — 2026-10-02 20:33 KST 운영 DB 적용([운영 반영 기록](../../verification/desktop-companion-production-2026-10-02.md))
2. **SMTP 전환**: 기본 발송 제한 해제(현재 2통 후 429)
3. **6자리 코드 메일 템플릿**: Supabase Auth `Magic Link` 템플릿 개조 또는 새 항목(`type='email_confirmaiton'`은 이메일만)
4. **`auth.sessions` DELETE 권한**: 완료 — 2026-10-02 운영에서 `postgres`의 SELECT·DELETE 권한 확인
5. **배포 저장소 생성·첫 게시**: GitHub 공개·토큰·`npm run dist --publish` 명령 또는 수동 업로드

### 4.3 Carried Over (이월)

설계 저장소: G2~G4는 중요도 낮아 다음 사이클로 이월.
- G2: 답 대기 중 "본 항목" 원자성 개선(목표 SC: SC3의 "안 본 것" 재산출)
- G3: 폴링 오류 안내(현재 조용히 멈춤)
- G4: 기기 이름 `hostname()` 사용(현재 "데스크톱 앱" 고정)

## 5. Quality Metrics

### 5.1 Final Analysis Results

| Metric | Value |
|---|---|
| 설계 일치율 | 1차 84.2% → 2차 93.6% (step 11 보완) |
| 구조·기능·계약 | 98% / 92% / 93% |
| 성공 기준 충족 | 7/9 (78%, 2개는 사람·운영 게이트) |
| 코드 단위 테스트 | 루트 1,834 + desktop 32(G1 수정 뒤) |
| SQL 신규·전체 | 8 / 316 (0069 포함) |
| 권한 조합 검증 | 2,016건 |
| E2E 시나리오 | 5건 통과 (full-flow·로그인·부서·결정·해제) |
| 알림 실측 | 첫 카드 29,607ms·29,616ms, 둘째 29,483ms |
| 설치 파일 크기·해시 | 114,125,224 bytes, SHA-512 기록 |

2차 analyze에서 찾은 G1(step 11이 질문 전송의 모든 4xx를 하루 한도로 표시)을 오케스트레이터가 TDD로 고쳤다 — 429만 한도 안내, 400·401·403은 서버 오류 그대로(`a7fcaba`).

### 5.2 Resolved Issues (1차 → 2차)

| Issue | Root Cause | Resolution |
|---|---|---|
| C1: 펫 클릭 무반응 | `pet-toggle-panel` IPC 수신자 없음 | `ipcMain.on("pet-toggle-panel")` + 펫 창 발신 검사, 실제 트레이 아이콘(step 11) |
| I1: 펫 상태 고착 | "본 항목" 읽음 상태 미저장 | 화면이 `settings.set({seen})`(암호화 설정 파일)에 저장, 본체가 새로 나타난 항목 기준으로 알림(`core/inbox-notifications.ts`) |
| I2: 하루 한도(429) 질문을 끊김 보관 | step 8 명세가 design §6과 어긋나게 "429 유지"를 지시(오케스트레이터 명세 오류) | 보관은 네트워크·5xx만(step 11). 이어서 생긴 G1(모든 4xx를 한도로 표시)은 2차 analyze 뒤 수정 |
| I4: 위치·동작 설정 미사용 | 상태 로드 후 즉시 반영 안 함 | 펫 위치를 암호화 설정에 저장·복원(화면 밖이면 기본 위치), "움직임 줄이기" 설정을 펫 그림에 반영 |
| C1/U: 트레이 빈 아이콘 | 리소스 미번들 | electron-builder에 tray.png 추가 |

design §6 실제 오류 코드(공용 웹 lib 코드)로 갱신, E17 엔드포인트 명시.

## 6. Lessons Learned & Retrospective

### 6.1 What Went Well (Keep)

1. **공용 lib 공유**: 권한·인용·작업 코드를 추출해 웹·앱이 같은 판정을 했다. 새 판정 로직 복제나 불변식 위반 없음. 회귀 테스트로 웹 응답 변경 없음 증명.
2. **설계안 C 실용성**: A(모든 경로 Bearer)·B(전부 복제)를 버리고 5곳만 교체(W01~W05)해 범위를 최소화. 웹은 `startAsk`·`readAnswerView` 호출 지점만 변경.
3. **하니스 조기 피드백**: step 0 G1·G2 게이트와 step 1·2의 SQL·API 검증으로 아키텍처 결함을 설계 뒤 구현 전에 잡음. E2E는 step 3부터.
4. **1차 분석 → step 11 집중**: 84.2% → 93.6%로 복구. 차이를 설계 문서·실제 코드로 추적해 누락 부분(펫 클릭·읽음 저장·429 필터) 명확화.

### 6.2 What Needs Improvement (Problem)

1. **QA 빌드 순서**: 루트 `npm run build`가 `.next`를 운영 Supabase 주소로 다시 빌드해, 그 뒤 띄운 QA 서버가 로컬 기기 토큰을 모두 401로 거부했다(step 11 재시도 2). E2E 직전에 `review-qa.mjs build`→`start`, 루트 build는 E2E 뒤.
2. **실행기 멈춤**: step이 띄운 `review-qa.mjs start/dev` 서버가 execute.py의 출력 파이프를 붙잡고, 작업을 마친 `codex exec`도 종료되지 않아 실행기가 1시간 제한 뒤 `TimeoutExpired`로 죽었다(step 4·8·9·12). Codex 셸에서 서버를 직접 띄우면 세션이 40분 넘게 멈추기도 했다(step 10).
3. **`git add -A` 커밋**: 실행기의 커밋이 다른 세션의 미추적 `supabase/config.toml`·`supabase/.gitignore`를 step 0 커밋에 쓸어 넣었다. 추적 해제 + `.git/info/exclude` 등록으로 처리(`f35c5e7`).
4. **축소된 범위의 "완료"**: step 9 1차가 답 본문·자료 검토함·영업 검토·펫 이식·E2E를 빼고도 completed로 보고했다. 오케스트레이터 검토에서 잡아 step 9를 다시 열고 step 10으로 분리했다. 완료 기준에 "실제 출력이 없으면 완료 아님"을 명시해야 한다.

### 6.3 What to Try Next (Try)

1. 로컬 호스트명으로 기기 구분(G4) → 웹에서 여러 PC 기기 목록 구분 용이.
2. 답 폴링에 오류 처리(G3) → 네트워크 끊김 시 사용자 알림.
3. "본 항목" 원자 연산(G2) → 카드 조회와 상태 보기 떨어지지 않음.
4. 다음 PDCA는 phase 41·42 병합·운영 적용 뒤 실제 사용자 피드백 수집하고, 수집 경로·모바일·macOS 우선순위 재평가.

## 7. Process Improvement Suggestions

### 7.1 PDCA Process & Harness

1. **Step 완료 기준**: step이 설계 §11.2 대조 목록의 모든 항목을 구현했는지 자동 검사(체크리스트). 부분 구현은 다음 step으로 이월 명시.
2. **설계 문서 변경 추적**: 1차 analyze(84.2%)에서 found gap을 design.md에 기록(예: "§6 오류 코드 실제화") → design 검증 단계 추가 필요.
3. **QA 빌드 순서**: E2E 직전 `review-qa.mjs build`→분리 `start`→E2E→서버 종료→루트 lint·build·test 순서를 step 템플릿에 명시.
4. **실행기 보강**: `subprocess.run` 대신 프로세스 그룹을 만들어 시간 초과·종료 시 자식까지 정리하고, step이 끝나면 남은 QA 서버를 정리한다. 이번에는 오케스트레이터 감시(`harness-watch`)가 8분 멈춤에서 서버를 정리하는 방식으로 대응했다.

### 7.2 Tools/Environment

1. Graft·Archify가 제공되면 Bearer 입구와 공용 lib 의존을 그려 문서화. 현재 "Graft로 확인·기록 없음" 표시만 남음.
2. 로컬 QA에 phase 41·phase 42 data seed 추가(현재 phase 43만), 동시 작업 번호 충돌 자동 검사.
3. `verify-device-links-sql.mjs` 같은 하니스는 GitHub Actions에 등록해 PR에서 자동 실행(현재 로컬만).

## 8. Next Steps

### 8.1 Immediate (사람·운영)

주 세션에서 step 12·index summary 마무리. 운영 적용 절차:

1. 사용자 승인: SC7(5분 녹화)·SC8(업데이트 실측)에 필요한 테스트 방식 확인.
2. 운영 인프라:
   - ~~`auth.sessions DELETE` 권한 부여(DBA 확인)~~ 2026-10-02 운영 확인 완료
   - ~~migration 0069 적용~~ 2026-10-02 완료
   - SMTP 전환(발송 한도 해제)
   - 이메일 템플릿 (6자리 코드)
3. 배포:
   - GitHub 공개 저장소 생성
   - 첫 버전(0.1.0) 게시
   - 자동 업데이트 1회 실측

### 8.2 Next PDCA Cycle

1. **운영 완전 반영 뒤 재검증**: phase 41·42와 0069는 2026-10-02 운영 반영 완료. SMTP·메일 템플릿·배포 저장소까지 적용된 운영 환경에서 SC7·SC8을 재검증한다.
2. **실제 사용자 피드백**: 부서원 전체 5인 이상의 1주일 사용 기록 수집. 펫 상태·알림·기기 해제 체험.
3. **모바일·macOS**: 현재 phase는 Windows만. 다음은 PWA(macOS/iOS) 또는 Tauri(macOS) 검토.
4. **성능·보안 심화**:
   - 펫 폴링 백오프(현재 30초 고정) 최적화
   - 비콘을 요청할 때마다 토큰 갱신(현재 1시간 고정)
   - 데모 부서와의 격리 완전성 재검증

---

## 9. Step 13 후속 보완 (2026-10-02)

[후속 실행 기록](../../verification/43-desktop-companion/followup.md), design §11.4, analysis §7.

| Perspective | Content |
|---|---|
| Problem | 답을 기다리는 동안 열람한 카드가 읽음 기록에서 사라지고, 폴링 실패 안내가 없으며 기기 이름이 모두 같았다. |
| Solution | 본체의 직렬 설정 저장·항목 ID 추가, 취소 가능한 오류/120초 폴링, 본체 hostname 연결을 구현했다. |
| Function/UX Effect | 탭 이동·재진입에서도 중단 안내가 남고 내부 오류 코드는 숨긴다. 데스크톱 단위 56건·실제 Electron 합성 3건·PGlite 8건이 통과했다. |
| Core Value | 기존 권한·인용·서버 계약을 유지하면서 읽음 기록과 오류 안내를 보완했다. 원문은 새로 저장하지 않는다. |

G2~G4 **3/3 해결**. 양쪽 lint/build·root 단위 1,834 통과. Archify deliver·4개 viewport 자동 브라우저 검사 통과. Graft 전후 그래프와 실제 Supabase 전체 E2E는 환경 장애로 이번에 미확보다. 전체 마지막 분석 점수 93.6%·계획 7/9는 유지하며, 운영/설치/업데이트 완료를 의미하지 않는다. 코드·검증 산출물만 준비했고 새 설치 게시·운영 반영은 수행하지 않았다.

## 10. Step 14 세션·보관 보완 (2026-10-02)

[실행 기록](../../verification/43-desktop-companion/session-outbox.md), design §11.5, analysis §8.

| Perspective | Content |
|---|---|
| Problem | 로그아웃 뒤 이전 답·기록이 남고, 동시 보관 전송이 중복되거나 질문을 덮어쓸 수 있었다. |
| Solution | 공통 세션 종료·API/OTP 세대·renderer 재마운트와 작업/파일 큐를 구현했다. 동일 시각 FIFO와 늦은 설정, 삭제 실패를 함께 보완했다. |
| Function/UX Effect | 로그아웃/401 뒤 다른 사용자가 로그인해도 이전 답·기록·설정이 보이지 않는다. 보관 전송과 삭제가 교착하지 않는다. desktop 76건·합성 Electron 7건 통과. |
| Core Value | 기존 권한·인용 계약 안에서 이전 세션의 상태·보관 질문이 새 세션으로 넘어가는 경로를 차단했다. |

제한 범위 **4/4 해결**. root 1,834건·양쪽 lint/build·Archify 검사를 통과했다. Graft 전후 그래프·실제 DB 전체 E2E·OS 트레이 클릭은 이번에 미확보다. 트레이는 콜백 단위 검증으로만 표시했다. 전체 마지막 일치율93.6%·계획7/9, 사람/운영 게이트와 미배포 상태는 유지한다.

## 11. 운영 설치·업데이트 (2026-10-02)

[실행 기록](../../verification/43-desktop-companion/production-install.md). 사용자 요청으로 운영 반영·공개 설치 파일 게시·현재 PC 설치를 진행했다. 6자리 OTP·코드 메일 템플릿을 반영하고, 운영 테스트 계정의 기기 연결·질문 거절·암호화 세션을 확인했다. 공개 업데이트로 0.1.0→0.1.1 적용·세션 복원·로그아웃 파일 삭제가 통과했다. 운영 guest 5/5, 최초 설치 16.94초. 코드 서명은 아직 없다.

SC8 충족으로 **8/9**, 전체 정적 93.6% 유지. SC7 신규 Windows 계정 설치·실제 이메일 수신·5분 화면 녹화와 Resend SMTP는 도메인 등록/DNS 인증 뒤 확인한다. 전체 phase/step12는 계속 blocked이며 `production_deployed=true`는 웹·DB·설치 파일 게시를 뜻한다.

## 12. 신규 계정 첫 실행·메일 수신 (2026-10-05 갱신)

- 메일: 기본 발송기와 Resend SMTP(`getsasu.com`) 모두 실제 Gmail 수신·6자리 코드 로그인을 확인했다. 첫 Resend 메일은 Gmail 스팸함으로 분류됐고([mail-delivery-2026-10-05.md](../../verification/43-desktop-companion/mail-delivery-2026-10-05.md)), phase 49 이전 후 2026-10-05 19:26 KST 로그인 메일이 **받은편지함**에 도착했다([production-cutover.md](../../verification/49-app-domain-migration/production-cutover.md) T9).
- SC7: 새 표준 로컬 계정에서 공개 0.1.2 다운로드 → 무인 설치 → 실제 메일 코드 로그인 → 파일럿 부서 → 첫 답(인용 2개), 설치 시작 기준 93.5초, NVENC 전체 화면 녹화([first-run-2026-10-05.md](../../verification/43-desktop-companion/first-run-2026-10-05.md), [phases/43-desktop-companion/index.json](../../../phases/43-desktop-companion/index.json) step 12 `automated_recording`).
- 한계(해당 기록 그대로): Claude가 Playwright로 입력한 자동 조작이라 사람 사용성 실측이 아니며 "5분 안"의 하한선이다. 새 계정으로 직접 로그인하지 않은 보조 로그온, 무인 설치(`/S`)라 마법사·SmartScreen 단계 없음, 패널 고정 API 사용, 메일 코드는 Claude가 Aside로 전달했다. 코드 서명은 여전히 없다.

## Version History

| 버전 | 날짜 | 내용 | Author |
|---|---|---|---|
| 1.5 | 2026-10-05 | step 12 완료·SC7 자동 녹화 충족(9/9, 사람 실측 아님)·Resend 메일 수신 반영. 본문 8/9·blocked 서술은 10/02 기록으로 유지 | Claude |
| 1.4 | 2026-10-02 | 운영 0.1.1 게시·현재 PC 설치·실제 업데이트/로그아웃 확인. SC8 충족, SC7·도메인/SMTP 대기 | Codex |
| 1.3 | 2026-10-02 | 웹 API·DB 운영 반영(PR #25)·0069 적용·auth.sessions 권한 확인 반영. 설치 파일 게시·사람 실측·SMTP·메일 템플릿 대기 유지 | Claude(오케스트레이터) |
| 1.2 | 2026-10-02 | step14 세션/질문 보관 4/4·desktop76·합성 Electron7·root1834. 기존 운영 게이트 유지 | Codex |
| 1.1 | 2026-10-02 | step 13 G2~G4 3/3 보완·desktop56·합성 Electron3·PGlite8. 전체 93.6%·7/9·사람/운영 게이트 유지 | Codex |
| 1.0 | 2026-10-02 | 1차 analyze 84.2% 보완 후 2차 93.6% · step 0~11 완료 · step 12 사람·운영 게이트 · SC 7/9 충족 기록 | Claude(오케스트레이터) — report-generator 초안을 검토·수정 |
