# Step 0 결과 — 녹음 문구·상태 순수 함수 (도구 검증 대기)

`lib/recording/recorder-copy.ts`에 오류 코드·중단 사유·세션 상태의 표시 문구와 화면 단계, 시작 전 조건, 최근 소리 판정, 만료 시각, 탭 제목 함수를 추가했다. `tests/recording/recorder-copy.test.ts`를 먼저 작성하고 모듈이 없어서 실패하는 것을 확인한 뒤 구현했다. 서버의 오류 코드와 `MeetingRecorder.recover()` 분기, 화면 컴포넌트는 바꾸지 않았다.

실행 기록: `npx vitest run tests/recording/recorder-copy.test.ts` 35개 통과. `npm run lint` 통과(기존 문구 경고 79건, 차단 0건). `SASU_VERIFY_BUILD=1`에서 `npm run build` 통과(Next.js 16.3.4, TypeScript·38개 정적 페이지 생성 통과); 뒤에 `next-env.d.ts`를 복원했다. `npm run test -- --maxWorkers=2 --testTimeout=15000` 149파일·1,659개 통과. 신규 함수 호출은 아직 테스트뿐이며 화면 연결은 step 1~3 범위다.

코드 관계: [구현 전](../../docs/verification/recording-ux-2026-09-29/graft-s0-before.txt) · [구현 후](../../docs/verification/recording-ux-2026-09-29/graft-s0-after.txt). Graft CLI가 없고 Docker default·desktop-linux 엔진 소켓 연결에 실패해 이번 step의 Graft 전후 그래프는 없다. 실제 파일 검색 범위와 누락된 그래프를 각각 적었다. `docs/AI-DEVELOPMENT.md` §2에 따라 필수 도구 결과가 없으므로 step 완료로 판정하지 않았다. 순수 모듈 추가라 Archify 대상은 아니다. bkit의 Do→Check 절차로 명세·구현·테스트를 대조했고, bkit MCP 서버는 이번 Codex 세션에 노출되지 않아 별도 상태 도구 호출 기록은 없다.

다음 step은 `MeetingRecorder`의 시작 동작을 ADR-071 순서로 합친다. 현재 화면에 새 문구는 아직 표시되지 않는다. 운영 반영은 하지 않았다.
