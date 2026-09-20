# 심사위원 데모 운영 검증 — 2026-09-20

제출 URL: `https://sasu-alpha.vercel.app/demo`

## 배포

- production deployment: `dpl_7swmVdV2qApDydCxHPPfnoTozrM1`
- 상태: `READY`
- alias: `https://sasu-alpha.vercel.app`
- 최근 1시간 Vercel 오류 로그: 없음

## 실행 결과

| 검사 | 결과 |
|---|---:|
| `npm run lint` | PASS — ESLint 오류 0, 문구 차단 0 |
| `npx tsc --noEmit` | PASS |
| `SASU_VERIFY_BUILD=1 npm run build` | PASS — Next.js 16.3.4 |
| `npm run test` | PASS — 133개 파일, 1,319개 테스트 |
| `check-demo-release https://sasu-alpha.vercel.app` | PASS — 11개 기능 경로 200 |
| `npm run audit:showcase` | PASS — 제출 데모 조직 4개 부서, 의심 표식 0건 |
| 심사위원 데모 브라우저 | PASS — 5/5 |
| 공개 워크스페이스 데모 브라우저 | PASS — 7/7 |
| 게스트 브라우저·권한·무쓰기·무AI | PASS — 5/5 |
| 접근 제어 회귀 브라우저 | PASS — 8/8 |

심사위원 흐름은 공개 데모 진입 → 기능 지도 → 대시보드 → 결정 카드 미리보기 → 결정 기록 미리보기 → 근거 기반 묻기 → 음성 동작 안내 → 예시 자료 검토·근거 확정 → 모바일 화면 순서로 실행했다. 데모 액션은 실제 DB에 저장하지 않는 경로로 확인했다.

## 판정 및 제한

- 제출용 데모 데이터는 `DEMO_ORG_ID` 기준으로 QA/E2E 표식이 없음을 확인했다.
- 개발 회고 데모는 운영 플래그가 꺼져 있어 관련 E2E 1건이 의도적으로 skipped 되었다. 기본 MVP 심사 흐름에는 포함하지 않는다.
- 이전 production 배포에서 오래된 기능 목록·심사 흐름이 실패했으나, 최신 배포 후 동일 스위트를 재실행해 전부 통과했다.
- 원문 질문·전사·비밀값은 이 기록에 저장하지 않는다.
