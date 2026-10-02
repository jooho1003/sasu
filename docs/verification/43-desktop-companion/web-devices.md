# Step 3 — 웹 기기 연결 관리 검증

- 실행일: 2026-10-01 (KST)
- 범위: 활성 기기 목록, 본인 기기 해제, 데모 숨김, 설정 화면 배선

## 경로 확인

`app/(auth)/d/[dept]/settings/page.tsx`가 세션 클라이언트로 데모 부서와 데모 계정을 판정해 `SettingsS5`에 전달한다. 멤버 탭의 동의 패널 다음에 `SettingsDevices`가 렌더된다. 이 패널은 `GET /api/devices`로 본인 활성 연결만 읽고, 해제는 `DELETE /api/devices/[id]`에서 `revoke_device_link` RPC만 호출한다. 직접 `device_links` 변경 경로는 없다.

Graft 도구는 이 실행 환경에 없어서, 위 관계는 `rg`와 실제 파일 읽기로 확인했다. 구조 또는 실행 흐름 변경이 아닌 기존 설정 화면의 한 패널 추가라 Archify 시각화는 적용 대상이 아니다.

## 실행 결과

| 확인 | 결과 |
|---|---|
| `npx vitest run tests/devices-route.test.ts` | 통과: 1개 파일, 4개 테스트 |
| `npm run lint` | 통과: ESLint 및 문구 검사 |
| `npm run build` | 통과: `/api/devices`, `/api/devices/[id]` 포함 |
| `npm run test` | 통과: 175개 파일, 1,811개 테스트 |
| `node scripts/review-qa.mjs settings-devices-test` | 통과: 로컬 QA에서 본인 연결 2개 표시, 다른 사용자 0개, 1개 해제 뒤 1개 유지, 390px 가로 넘침 없음 |
| `node scripts/review-qa.mjs guest-test` | 통과: 5개 게스트 회귀 테스트 |
| `git diff --check` | 아래 최종 검사에서 통과 |

## 화면 기록

- 1440px: [web-devices-1440.png](web-devices-1440.png)
- 390px: [web-devices-390.png](web-devices-390.png)

## 경계 확인

- 쿠키 세션 클라이언트만 사용하며 service role은 요청 경로에 없다.
- `device_links`는 RLS로 본인 활성 행만 반환한다.
- 해제는 `revoke_device_link` RPC를 통해 세션 무효화와 함께 처리한다.
- 프록시의 데모 계정 쓰기 차단은 `DELETE /api/devices/[id]`에도 적용된다.
- 데모 부서와 데모 계정 모두에서 기기 패널을 렌더하지 않는다.
