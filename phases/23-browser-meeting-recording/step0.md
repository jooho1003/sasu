# Step 0: 수집·복구 기술 검증

상태: 일부 구현·합성 입력 검증. 실제 마이크/Meet/Zoom V01~V06 미충족. [실행 기록](../../docs/verification/browser-meeting-recording/step0.md). 원천은 PRD §3-4·§8, ADR-056, 상세 설계 §3~§4·§10.

2026-09-25 후속: 입력 단절·워커 무응답·암호화 저장 사전 검사와 복구 회귀는 [후속 명세](step0-capture-recovery-20260925.md)와 [실행 기록](../../docs/verification/recording-capture-2026-09-25/README.md)을 따른다. 합성 검증만으로 실제 기기 완료를 표시하지 않는다.

## 읽을 파일

- `components/ask-s4.tsx`, `components/reviewed-materials.tsx`
- `lib/adapters/review-audio.ts`, `tests/adapters/review-audio.test.ts`(실제 테스트 경로 검색)
- `lib/contracts.ts`, `docs/AI-DEVELOPMENT.md`
- 구현할 Next.js client/static 경계에 해당하는 `node_modules/next/dist/docs/` 가이드

## 구현과 검증

1. Graft 코드 관계·Archify 실행 흐름 확인 또는 도구 부재 기록. 순수 로직(리샘플·혼합 이득·체크포인트·manifest·상태 전이)은 `lib/recording/*.ts`에 테스트를 먼저 작성한다. AudioWorklet 프로세서·IndexedDB·MediaStream 어댑터는 `lib/recording/browser/*`에 두고, 먼저 ARCHITECTURE §8 표와 `scripts/hooks/tdd-guard.sh` 허용 목록에 그 경로를 추가한다. `public/`에 `.js`를 두지 않는다.
2. Windows Chrome/Edge에서 실제 마이크, Meet 브라우저 탭, Zoom 데스크톱의 공유 음성을 확보하고 각 입력이 들리는지 확인한다. 화면 영상은 저장하지 않는다.
3. Web Audio 혼합·샘플 기준 시간·PCM 리샘플·1초 checkpoint·5초 backlog 중단을 구현한다. 압축 Blob을 독립 원본으로 간주하지 않는다.
4. 권한 거절/트랙 없음/장치 분리, 정지·재개, 새로고침/프로세스 종료·IDB 복구, 두 탭, 절전·quota 오류를 시험한다.
5. 30분 합성 입력으로 시작/끝·경계 구간·메모리 사용·상한 종료를 확인한다. 실제 환경에서 지원되지 않는 모드는 문서와 UI 상태로 제한한다.

## 완료 기록

`docs/verification/browser-meeting-recording/step0.md`에 테스트 명령·OS/브라우저 버전·소리 선택 대상·실제 재생 확인·실패 범위를 남긴다. 설계 V01~V06에 대한 실제 결과가 없으면 step을 완료로 표시하지 않는다. 서버 업로드/LLM 연동은 이 step의 완료 조건이 아니다.
