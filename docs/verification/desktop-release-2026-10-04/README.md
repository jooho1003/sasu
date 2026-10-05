# 데스크톱 후속 기능 반영 — 2026-10-04

사용자 요청: 테스트·반영할 항목을 반영하고 다음 step을 서브에이전트로 계속 실행·확인한다. 기존 메일/DNS/Resend SMTP 보류는 유지한다.

## 반영 범위와 진행 상태

PR #30(질문 이력) → #33(최근 맡긴 작업) → #34(결정함) → #35(영업 검토)를 검증하고 main에 순서대로 병합했다. main `81f10a9`를 릴리스 브랜치에 병합해 기존 CSP 운영 변경을 유지했다. Windows 설치 파일에 반영할 자료 업로드 보완은 phase 48의 기존 DC-09 복구 설계·별도 red/green을 따른다.

설계: [기존 동반 앱](../../02-design/features/desktop-companion.design.md), [질문](../../02-design/features/desktop-question-followup.design.md), [최근 작업](../../02-design/features/desktop-recent-work.design.md), [결정함](../../02-design/features/desktop-decision-flow.design.md), [영업](../../02-design/features/desktop-sales-flow.design.md), [자료 업로드](../../02-design/features/desktop-upload-recovery.design.md).

현재 기록은 릴리스 준비 중이다. 공개 Windows 0.1.2 게시·실제 업데이트는 아래 실행 결과가 채워지기 전에는 완료로 계산하지 않는다.

## 실행 검증

| 실행 | 결과 |
|---|---|
| 루트 lint | exit 0, ESLint 경고 2·문구 경고 84·blocking 0 |
| 루트 기본 Turbopack production build | exit 0, 컴파일·타입 검사·49개 정적 페이지 생성 |
| 루트 Vitest | 183 files / 1,834 PASS, exit 0 |
| 현재 CSP 대상 단위 | 7 PASS, exit 0 |
| isolated PGlite SQL | 316 PASS / failed 0, 권한 조합 2,016. pg_cron/pg_net의 0004는 제외 |
| 운영 guest Playwright | 5 PASS, exit 0. 1440/390px·실제 부서 접근 차단·잘못된 서명 거부·열람 전후 AI 호출/DB 행 증가 0 |
| desktop 단위 | 12 files / 78 PASS, lint/build exit 0 |
| phase 44~47 Electron 회귀 | 최초 39 PASS·준비/클릭 시간 초과 2건, 해당 2개 재검증 PASS. 고유 41개를 실행 간 검증 |
| 실제 development React/StrictMode | 영업 자료 시작 회귀 6 PASS. 위 production 41개와 합산하지 않음 |
| phase 48 자료 업로드 | production Electron 14 PASS, 실제 development React/StrictMode 3 PASS. desktop lint/build exit 0·단위 78 PASS. 실패·TLS 준비·클릭 시간 초과는 별도 기록 보존 |

[데스크톱 통합 상세·실패 기록](../44-desktop-question-followup/continuation-2026-10-04.md). 첫 두 시간 초과를 최초 전체 실행 성공으로 바꾸지 않는다. 가용 메모리 약 398MB 당시 발생했고, 부하가 줄어든 재검증에서 통과했다. 테스트 준비 대기만 5→30초로 맞췄으며 동작 assertion·클릭 제한은 유지했다.

루트 검증의 원시 기록은 이 디렉터리의 `root-{lint,build,test,csp-test}.txt`, `sql.txt`, `production-guest.txt`에 보존한다. [자료 업로드 검증](../48-desktop-upload-recovery/verification.md)은 별도 red/green·실제 개발 모드·오류 처리와 한계를 기록한다. 서버/API/DB/LLM 변경과 새 migration은 없다.

## 초기 설치 앱 확인

현재 PC의 실제 0.1.1 설치 앱에서 운영 QA 계정의 일회용 6자리 코드 인증 → 동의 부서 기기 연결 → 일반 Bearer inbox 요청을 확인했다. session.bin에 이메일/access_token 평문이 없음을 확인했다. 질문·모델 호출·이메일 발송은 하지 않았다. Auth Admin은 QA 코드 생성에만 썼고 앱의 인증/기기 요청은 기존 main/preload/SDK 경로를 사용했다.

업데이트 검증은 동일 격리 프로필의 세션만 사용하며 재로그인 fallback이 없다. [도구 준비와 실행 방법](tooling.md).

## 패키지·공개 게시·업데이트

최종 소스 검증 뒤 0.1.2 운영 설정으로 별도 빌드·ASAR 감사·패키지 실행·공개 게시·0.1.1→0.1.2 실제 업데이트를 진행하고 결과를 이 절에 기록한다.

## 남은 사람 게이트

phase 43 step 12의 실제 메일 수신·신규 Windows 계정 5분 전체 녹화는 별도다. DNS/Resend SMTP는 사용자 보류다. 현재 PC 업데이트 검증으로 이 게이트를 완료 처리하지 않는다. Graft native binding 실패와 자동 그래프 미확보, 실제 고객 자료·음성 의미 정확도는 기능별 검증 기록의 한계를 따른다.
