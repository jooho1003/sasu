# Phase 23 — 웹 직접 회의 녹음

상태: **step4-A·step0 일부 구현 및 로컬 검증 / 완료 게이트 미충족 / 운영 미반영**.

재시작 후 추가 검증: Docker 복구 확인, 실제 로컬 Storage 8개 체크와 로그인 웹 접근 E2E 1개 통과. 아래의 Docker 차단은 해소됐다. 실제 원본 자동 파기·제공사/CSP·녹음 구현 게이트는 계속 남아 있다.

2026-09-18: 원본 접근권·접근 기록·분당 제한·조직 설정·원본 보존/파기를 구현했다. 단위 1,091개, 격리 SQL 173개+권한 행렬 2,016개, 컴포넌트 브라우저 8개, lint·build 통과. 실제 Storage 통합은 Docker 엔진 불응 및 재시작 액세스 거부로 미검증이다. [실행·인계 기록](../../docs/verification/browser-meeting-recording/access-controls-2026-09-18.md).

2026-09-17 실행 기록: [step4-A](../../docs/verification/browser-meeting-recording/step4a.md), [step0](../../docs/verification/browser-meeting-recording/step0.md). 녹음은 합성 입력 검증 화면에만 연결했다. 실제 마이크·화면 소리는 암호화·세션 키 발급 및 선행 자료 보호 작업 후 검증한다.

원천: [PRD §3-4·§8](../../docs/PRD.md), [ADR-056](../../docs/ADR.md), [상세 설계](../../docs/planning/웹회의_녹음_설계.md).

| 단계 | 결과 | 선행 조건 |
|---|---|---|
| step4-A | 기존 자료 보호: 제공사 확인·보안 헤더·접근 기록·조직 스위치·원본 보존 기간 (ADR-057·058) | 없음. **step0보다 먼저** 실행한다 |
| step0 | 브라우저 수집·PCM 복구 기술 검증 | 지원 환경 실제 실행 가능 |
| step1 | 구간 원본·RLS·검증/파기 작업·로컬 체크포인트 키 발급 | step0 실제 녹음/복구 통과, step4-A의 `org_settings` |
| step2 | 녹음 화면·원본 재생·기존 전사 검토 연결·수집 강화(§12) | step1 데이터/RLS 통과 |
| step4-B | 전사 신뢰도·용어집·요약 병합·정확률 측정 | step2 실제 기능 완주 |
| step3 | 데모 합성 음성·무전송 녹음·회귀·인계 | step2·step4-B 완주 |

Meet·Zoom 계정 자동 수집은 다음 phase에서 별도 OAuth/이벤트·권한 검증과 함께 수행한다. 이 phase에서 서비스 설치나 봇을 만들지 않는다. 구현 전후 Graft·Archify 이용 가능성을 확인하고 결과가 없으면 수동 확인 범위·미충족 게이트를 검증 기록에 명시한다.
