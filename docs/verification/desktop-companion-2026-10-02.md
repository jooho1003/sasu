# 데스크톱 동반 앱 — 로컬 릴리스 검증

실행일: 2026-10-02 KST. 로컬 QA만 사용했으며 운영 DB·메일·GitHub 릴리스는 변경하지 않았다.

## 통과한 로컬 검증

- `npm --prefix desktop run lint` — 통과.
- `npm --prefix desktop test` — 6 파일, 27 테스트 통과.
- `npm --prefix desktop run build` — 통과.
- `npm --prefix desktop run dist` — `--publish never`로 Windows NSIS 설치 파일 `desktop/release/사수 Setup 0.1.0.exe`(114,125,224 bytes)를 생성했다. `latest.yml` SHA-512(base64)는 `KrUuGShgkaGmUq6UXaBuk829+u6ACrD5JwqYO3S7GGRvIBJHzaRHSKGRIQYF65B/r8WWbA55qX4KOjXbBt7Zjw==`와 일치했다. 공개 게시 없음.
- `npm --prefix desktop run e2e -- tests/e2e/full-flow.spec.ts` — 코드 로그인·부서 연결·원문 근거·결정 연타 1건·웹 해제 뒤 다음 요청 로그인 화면·세션 오프라인 질문 보관·연결 복구 전송을 통과했다.
- `node scripts/verify-device-links-sql.mjs` — 8/8 통과.
- `node scripts/verify-security-sql.mjs` — 316개 검증, 권한 조합 2,016건 통과.
- `node scripts/verify-companion-api.mjs` — 답변 근거 일치 2건, member의 leads_only 인용 0건, 해제 경로 9개, 결정 1건, 실패 0건.

## L3·L4 실행 결과

- L3: Playwright `_electron` 전체 흐름에서 해제 직후 다음 앱 요청은 `session_invalid`으로 로그인 화면으로 전환됐다. 카드 결정은 같은 `request_id`에 1건만 저장됐다.
- L4(로컬): SQL로 새 담당 카드 두 건을 넣어 실측했다. 첫 카드 T0→펫 T1 29,607ms, T0→알림 T2 29,616ms; 둘째 카드 T1 29,483ms, T2 29,483ms로 모두 60초 이하였다. E2E는 펫 클릭으로 패널이 열림도 검증한다. 전송 대기 질문은 `outbox.bin`에만 암호화 저장되고, 앱 userData 전체의 평문 검사와 E2E stdout/stderr 로그의 `Select-String` 검사에서 테스트 질문 0건, 전송 뒤 파일 삭제를 확인했다.
- 웹/앱 인용 가시성: `verify-companion-api.mjs`의 `answerParity: 2`, `memberLeadsOnlyCitations: 0` 결과를 사용했다.

## 설계 §11.2 대조

1. `0069_device_links.sql` — `verify-device-links-sql.mjs`.
2. 장치 링크 8개 사례 — 같은 하니스.
3. Bearer·공용 컨텍스트 — `verify-companion-api.mjs`.
4. 공용 lib 회귀 — 기존 API 검증.
5. E01~E13 — `verify-companion-api.mjs`.
6. E14~E16/W06 — `verify-companion-api.mjs`.
7. 웹 기기 해제 — `desktop/tests/e2e/full-flow.spec.ts`.
8. 루트 설정 — `npm --prefix desktop run lint`.
9. 앱 본체·IPC·알림 — Electron E2E.
10. core TDD — `npm --prefix desktop test`.
11. U01~U14 — Electron E2E 5개.
12. 업데이트·설치 설정 — `desktop/electron-builder.yml`, `desktop/src/main/updater.ts`, `npm --prefix desktop run dist`.
13. L1~L4 기록 — 이 문서.

## 사람·운영 대기

- 깨끗한 Windows 사용자 계정에서 설치 → 로그인 → 첫 답 5분 이내 화면 녹화.
- 배포 전용 공개 저장소 생성, 첫 게시, 자동 업데이트 1회 실제 적용.
- 운영 `auth.sessions` 삭제 권한, migration 0069 적용, SMTP 전환, 6자리 코드 메일 템플릿.
