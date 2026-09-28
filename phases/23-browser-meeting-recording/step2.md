# Step 2: 녹음부터 검토·확정까지

상태: 기능 구현·로컬 제품 검증 완료, 실기기 범위·운영 반영 게이트 미완료. 실행 결과와 남은 게이트는 `docs/verification/browser-meeting-recording/step2.md`를 따른다. 원천은 상세 설계 §2·§4~§6·V01~V10·V21, ADR-070.

## 작업

- `/d/[dept]/reviews/record`와 `회의 녹음` 진입, 녹음 방식·참석자 동의(녹음자 자동 포함)·테스트·입력별 미터·일시정지·종료를 구현한다.
- 시작 순서: 클라이언트 UUID → `POST /recordings`(서버 세션) → `POST /recordings/[id]/key` → 저장소 사전 검사(`prepareRecordingStore`) → 캡처. 한 단계라도 실패하면 녹음을 시작하지 않는다. 사전 검사에 실패하면 세션을 폐기한다. 실제 입력은 이 순서를 거친 세션에서만 IndexedDB에 저장한다.
- 초기 공개 범위는 새 녹음만 부서장 전용. 녹음 중 부서/입력 변경을 잠그고 녹음 종료·로컬 저장·서버 저장 완료 상태를 구분한다.
- 복구: `GET /recordings`의 서버 세션과 로컬 기록을 맞춰 본다. 세션이 `active`·`saving`이면 키를 다시 받아 복호화한다. 거부(끝 상태·만료)되면 로컬 자료를 지운다. 로컬 자료가 없는 서버 세션에는 폐기 버튼을 준다. 한도 초과 안내에서도 같은 목록을 보여 준다.
- 저장: `save`(manifest v1) → 발급 경로로 구간 업로드(409 Duplicate는 업로드됨) → `finalize` → 상태 확인. 다시 올릴 구간은 같은 녹음 ID의 새 attempt 경로로 올린다. 세션이 `completed`가 되면 로컬 자료를 지우고 기존 ReviewDetail로 이동한다.
- 구간 원본 재생은 구간 번호로 원본 API를 호출해 현재·다음 구간만 받아 Web Audio로 끊김 없이 잇는다. seek·WAV 결합 내려받기·서버 재추출을 지원한다. `audio_segments`에서는 `ReviewDetail.retry()`의 클라이언트 구간 재생성·`parts/` 업로드를 쓰지 않는다. 기존 단일 파일의 재생·저장 편집본·버전 충돌 처리는 보존한다.
- Next 프로덕션 빌드에서 AudioWorklet(`new URL(..., import.meta.url)`)·모듈 Worker 번들 로딩과 CSP Report-Only/강제 두 모드의 위반 0을 확인한다. 녹음 실험실(Vite, CSP 없음) 결과로 대신하지 않는다.
- 마이크 처리 옵션(AEC·NS·AGC)을 입력 방식별로 정하고 기록한다. 현재 온라인 회의는 AEC·NS·AGC, 마이크 단독은 AEC·NS를 요청하며 실제 기기 동작 검증이 남았다.
- 실제 Groq 전사 → 수정·확정 → 기존 인용 요약/분류 경로까지 합성 음성으로 완주한다. 원장 직접 자동 생성 금지.
- 모바일/키보드·화면 이탈·네트워크 단절·오류 회복을 테스트한다. 실제 브라우저 지원 결과에 맞춰 모드를 공개한다.
- 로컬 체크포인트를 step1의 키로 AES-GCM 암호화하고(키는 메모리만) 복구 시 키 재발급 → 복호화 순서를 지킨다. 프로필 파일에서 평문 PCM 패턴이 0건임을 확인한다(V15).
- 수집 강화(§12): wake lock, `devicechange`·트랙 `ended`/`mute` 처리, 공유 선택 힌트, 회의 출처·건강 카운트·`continues_recording_id` 메타데이터, `.m4a`/`.mp4(audio)` 파일 허용. 입력별 음량 프로파일과 클리핑 비율을 `capture_metadata`에 남긴다(§11.1). 회의 출처와 이어서 녹음 연결은 세션 시작 때 고정한다.
- 조직 관리자 녹음 스위치를 끌 때 진행 중 녹음 건수를 경고하고, 끈 뒤에는 녹음 화면이 시작·저장을 막는 것을 확인한다(V19).

## 완료 기록

`docs/verification/browser-meeting-recording/step2.md`에 실제 원본/전사 경계·인용·실패·복구 결과와 UI 캡처를 남긴다. `npm run lint`, `npm run build`, `npm run test` 및 신규 녹음/기존 검토 E2E를 실행한다. API fixture-only 테스트와 실제 DB/Storage/Groq 결과를 구분한다.
