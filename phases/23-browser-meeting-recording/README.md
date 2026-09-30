# Phase 23 — 웹 직접 회의 녹음

상태: **step4-A·step0~3·step4-B1~B8 로컬 구현·검증 진행 / 실기기·제공사·정량 실측·운영 게이트 미충족 / 이번 변경 운영 미반영**. 로컬 완료와 전체 완료의 차이는 [검증 연결](../../docs/verification/browser-meeting-recording/README.md)에 기록한다.

2026-09-29 step4-B6~B8: 문서 요약의 검증 후 병합 1회, 부서 용어집(0064·화면·Whisper/요약 연결), 정량 측정 계산기와 실측 입력 검사를 구현했다. 격리 SQL 280건·로컬 DB 0064 적용·단위 회귀·녹음 브라우저 21건(기존 장기 1 skip)·검토 화면 29건·격리 제품/데모 E2E 9건을 확인했다. V20 실측값은 없다. [병합](../../docs/verification/browser-meeting-recording/accuracy-step4b6.md) · [용어집](../../docs/verification/browser-meeting-recording/accuracy-step4b7.md) · [측정 준비](../../docs/verification/browser-meeting-recording/accuracy-step4b8.md) · [제품 E2E](../../docs/verification/browser-meeting-recording/product-e2e-20260929.md).

2026-09-29 step4-B5: 답변·문서·카드·원장의 녹음 인용을 발행 구간으로 연결하고 낮은 신뢰·경계 배지를 표시한다. RLS로 검토 자료가 보이지 않거나 발행 뒤 수정·원본 삭제 시 기존 원문 링크를 유지한다. 1,688개 단위 테스트·lint/build·브라우저 실험실 1개 통과. [세부 step](step4b5-citation-location.md) · [실행 기록](../../docs/verification/browser-meeting-recording/accuracy-step4b5.md).

2026-09-29 step4-B4: 낮은 신뢰·경계 구간 표시와 다음 확인 필요 구간 이동·확정 전 방문을 구현했다. Chrome 실험실 28개·단위 1,679개·lint/build를 통과했다. 0063 로컬 적용 뒤 실제 Storage·DB·Groq 두 창 전사도 통과했다. [세부 step](step4b4-attention-review.md) · [실행 기록](../../docs/verification/browser-meeting-recording/accuracy-step4b4.md).

2026-09-29 step4-B3: 녹음 창의 순차 claim, 마스킹 section·마지막 단어 끝 숫자 저장, 다음 창 재예약, 대기 sweep 예외, 재추출 초기화를 구현했다. 격리 SQL 278개·단위 1,679개·lint/build·실제 Groq 합성 2창(호출 합계 2,152ms)을 확인했다. 0063은 운영 DB에 적용하지 않았다. [세부 step](step4b3-transcription-storage.md) · [실행 기록](../../docs/verification/browser-meeting-recording/accuracy-step4b3.md).

2026-09-29 step4-B2: 창별 단어 소유·경계 중복 제거·원본 시각·신뢰도·마스킹 순수 변환을 TDD로 구현했다. 제품 워커와 DB 저장은 연결하지 않았다. [세부 step](step4b2-transcription-window.md) · [실행 기록](../../docs/verification/browser-meeting-recording/accuracy-step4b2.md).

2026-09-29 step4-B1: Groq 전사 요청에 선택형 시각 메타데이터 계약을 추가했다. ASK 기본 요청은 유지하고, 합성 회의 음성의 실제 Groq 응답에서 segment 4개·word 42개를 확인했다. 경계 중복 제거·신뢰도 저장·용어집·병합·검토 화면·정량 평가는 후속 4-B다. [세부 step](step4b1-transcription-metadata.md) · [실행 기록](../../docs/verification/browser-meeting-recording/accuracy-step4b1.md).

2026-09-28 step2 일부: 녹음 진입·5초 메모리 테스트·세션/키/저장소 사전 확인·캡처·로컬 복구·구간 저장/검증 대기 화면과 기존 검토의 구간 재생/재시도를 연결했다. 합성 브라우저 녹음·복구 및 구간 검토 검사를 통과했지만 실기기·실서버·정확도·CSP·수집 메타데이터 게이트는 남아 있다. [step2 기록](../../docs/verification/browser-meeting-recording/step2.md).

2026-09-25 step1-B·1-C 서버: 녹음 세션(0059)의 검증 기록을 마감하고, 저장(manifest v1 → 자료·구간 행) → 녹음자만의 구간 업로드 → finalize → 서버 검증(불일치는 같은 ID의 새 attempt) → 전 구간 검증 때 한 번만 전사 창 예약 → 전사 창 메모리 조립 → 구간 번호 단회 접근권 → 폐기·만료·취소·철회 파기를 구현했다(0060). 격리 SQL 277·돌연변이 6/6·단위 1,592·lint/build, 실제 로컬 Supabase Storage 18개 통과(LLM 0). 운영 DB 적용·녹음 화면·실제 기기 게이트는 남아 있다. [step1 기록](../../docs/verification/browser-meeting-recording/step1.md) · [step1-C 명세](step1c-segment-verification.md) · [step 요약](step1c-segment-verification.summary.md).

2026-09-25 설계 보완: 녹음 시작 전 영속 세션 계약이 없던 결함을 ADR-070로 해소했다(상세 설계 §5.0~§5.3, step1·step2 명세 갱신). 녹음 시작 때 서버 녹음 세션을 먼저 만들고, 키·저장·구간 업로드·검증·폐기·만료를 그 상태로 판정한다. 구간은 같은 ID에서 다시 올리고, 전사 창은 따로 저장하지 않는다. 설계 문서만 바꿨으며 구현·운영 반영은 없다. [설계 검증 기록](../../docs/verification/recording-session-design-2026-09-25/README.md).

2026-09-25 step0 후속: PCM 수신 단절·실행 공백·워커 무응답 감지와 암호화 저장 사전 검사를 구현했다. 합성 입력 브라우저 검사 15개와 별도 3분 실시간 새로고침 복구 1개를 통과했다. 실제 기기 게이트와 step1 이후 순서는 유지한다. [실행 기록](../../docs/verification/recording-capture-2026-09-25/README.md) · [step 명세](step0-capture-recovery-20260925.md).

2026-09-24 CSP 후속: 사용자 승인에 따라 PRD·ADR-069을 갱신하고 공통 HTML을 동적 렌더링으로 전환했다. 요청·응답·script nonce 일치와 Report-Only/강제 모드 브라우저 검증, 로그인 원본 재생·게스트 회귀를 확인했다. 브라우저 Zod eval 시도를 없애고 모바일 개인정보 본문 잘림도 보완했다. 기본 Report-Only, 운영 1일 관찰·승인과 V14 전체 완료 게이트는 유지한다. [실행 기록](../../docs/verification/csp-rendering-2026-09-24/README.md) · [step 요약](step4a-csp-20260924.summary.md).

2026-09-24: step4-A의 V18을 실제 로컬 Storage·로그인 화면에서 검증했다. 만료 원본·변환 파일 파기, 전사·수정 이력·확정 근거·요약 보존, 재생·재추출 차단을 확인했다. 0058는 비로그인의 `can_see` 직접 실행 권한과 내부 트리거 API 권한을 회수한다. SQL 245·권한 조합 2,016·전체 단위 1,399·lint/build 통과. 제공사 확인·CSP 강제·운영 반영과 녹음 선행 조건은 유지한다. [실행 기록](../../docs/verification/review-retention-2026-09-24/README.md) · [step 요약](step4a-20260924.summary.md).

2026-09-20: SEC-06 기반으로 로컬 체크포인트를 AES-GCM 암호문으로 교체하고, 서버 HKDF 키 파생·세션/RLS 검증 RPC·키 라우트를 구현했다. 실제 입력은 5초 메모리 시험만 허용하며 음성 바이트를 저장·전송하지 않는다. Chrome 마이크 권한 응답과 SQL 실실행은 아직 대기 중이다. [step0 실행 기록](../../docs/verification/browser-meeting-recording/step0.md).

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
