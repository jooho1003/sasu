# Step 5 실행 기록

- 목록 GET에 `original_layout`, `recording_enabled`를 추가했다. 스위치는 세션 클라이언트의 `review_org_settings` RPC로 읽고 오류·빈 값은 false로 처리한다. 목록은 계속 200을 돌려준다.
- 팀장 목록의 녹음 링크는 스위치가 켜졌을 때만 표시한다. `audio_segments` 자료 배지는 `회의 녹음`이다. 녹음 페이지도 동의한 팀장 확인 뒤 같은 RPC를 읽고 꺼짐 안내를 표시한다. 기존 서버·SQL 권한 검사는 유지했다. `lib/contracts.ts`에는 목록 응답 스키마가 없고 `ReviewedMaterial.original_layout`은 이미 선언돼 있다.
- TDD: 신규 목록 route 테스트 4개가 구현 전 실패, 구현 뒤 통과. `npx vitest run tests/reviews-list-route.test.ts tests/review-detail-route.test.ts tests/contracts.test.ts`: 37 통과. `npm run e2e:review-controls`: 22 통과. `npm run lint`: 성공(기존 wording 경고 79개, blocking 0). 검증 빌드: Next 16.3.4 컴파일·TypeScript·정적 38페이지 성공. `npm run test -- --maxWorkers=2 --testTimeout=15000`: 150파일 1663 통과.
- 코드 관계: `docs/verification/recording-ux-2026-09-29/graft-s5-{before,after}.txt`에 수동 grep 결과와 Graft 미실행 범위를 기록했다. Archify 대상 아님.
- 남은 확인: 실제 로그인 조직 off/on 화면은 step 8 범위. Graft 도구 부재로 phase 완료 판정은 보류한다.
