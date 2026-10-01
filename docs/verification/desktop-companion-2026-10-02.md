# 데스크톱 동반 앱 — Step 11 실행 기록

실행일: 2026-10-02 KST

## 통과

- `npm --prefix desktop run lint` — 통과
- `npm --prefix desktop test` — 5 파일, 22 테스트 통과
- `npm --prefix desktop run build` — 통과
- `npm --prefix desktop run dist` — `desktop/release/사수 Setup 0.1.0.exe` 생성, `--publish never`로 게시 없음

## 실패: L3 로컬 Electron 전체 흐름

- QA 서버: `node scripts/review-qa.mjs setup` 통과 후 `node scripts/review-qa.mjs start`를 분리 프로세스로 실행했고 `http://127.0.0.1:3011` 응답을 확인했다.
- 실행: `SASU_DESKTOP_E2E=1 npm --prefix desktop run e2e -- full-flow.spec.ts`
- 결과: Electron 프로세스는 시작했지만 Playwright `_electron.launch()`가 창 핸드셰이크를 완료하지 못해 120초 뒤 시간 초과했다.
- 재현: 기존 `smoke.spec.ts`의 첫 Electron 시작도 같은 방식으로 30초 시간 초과했다. 따라서 Step 11의 updater/패키징 변경 뒤 Electron 시작 회귀가 남아 있어 L3·L4와 후속 AC를 실행하지 않았다.
- 정리: 이 step에서 시작한 QA 서버·Electron·Playwright 프로세스를 종료했다.

## 설계 §11.2 비교 목록

Electron 시작 회귀로 L3 검증이 중단되어 13개 비교 항목은 모두 대기다. Step 11은 오류 상태이며, 시작 회귀를 고친 뒤 처음부터 실행해야 한다.

## 사람·운영 항목 (실행하지 않음)

- 깨끗한 Windows 사용자 계정에서 설치→로그인→첫 답 5분 녹화
- 공개 배포 저장소 생성·첫 게시·자동 업데이트 1회 실제 적용
- 운영 `auth.sessions` 삭제 권한, 0069 적용, SMTP, 6자리 코드 메일 템플릿
