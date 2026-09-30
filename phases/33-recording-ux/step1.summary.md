# Step 1 결과 — 한 번의 클릭으로 녹음 시작 (도구·설계 검증 대기)

`MeetingRecorder`의 `prepare()`·`begin()`을 `start()`로 합쳤다. 조건 검사 뒤 첫 `await`에서 입력을 선택하고, 서버 세션 → 키 1회 → 암호화 저장소 사전 검사 → 캡처 순서로 진행한다. 입력 선택 취소에는 세션 요청이 없고, 세션 생성 실패에는 트랙을 멈춘다. 키·사전 검사·시작 실패에는 트랙을 멈추고 생성된 세션을 폐기한다. 시작 중에는 `녹음 준비 중`을 알리고 양식 입력을 잠근다. 복구와 마이크 재선택의 키 확인은 유지했다. 서버·SQL·migration은 수정하지 않았다.

실행 기록(2026-09-29):

- `npm run e2e:review-controls`: 기존 16개 통과. 이후 저장소 사전 검사 실패 사례를 추가해 단독 1개 통과했다. 키 거부·준비 중 양식 잠금 사례와 정상 시작·복구 사례도 최종 변경 뒤 각각 단독 통과했다. 첫 사전 검사 테스트는 두 Vite 서버를 동시에 띄웠을 때 녹음 양식이 렌더되지 않아 실패했고, 단독 재실행에서 통과했다. 동시 실행이 원인이었는지는 확인하지 못했다.
- `npm run e2e:recording`: 20개 통과, 기존 3분 실시간 시험 1개 skip.
- `npm run lint`: 통과, 기존 문구 경고 79건·차단 0건.
- `SASU_VERIFY_BUILD=1`에서 `npm run build`: 첫 시도는 타이머 콜백의 nullable `control` 타입 오류로 실패. 상수 `activeControl`로 고친 뒤 Next.js 16.3.4 컴파일·TypeScript·38개 정적 페이지 생성 통과. `next-env.d.ts` 복원.
- `npm run test -- --maxWorkers=2 --testTimeout=15000`: 149파일·1,659개 통과. 마지막 테스트 편집 뒤 `npx tsc --noEmit` 통과.
- [녹음 중 화면 캡처](../../docs/verification/recording-ux-2026-09-29/s1-recording-synthetic.png)를 열어 확인했다. 이는 합성 입력의 로컬 UI 검증이며 실기기·실서비스 검증은 아니다. 실제 DB·Storage·Groq 제품 E2E는 명세대로 step 8 범위다.

코드 관계는 [구현 전](../../docs/verification/recording-ux-2026-09-29/graft-s1-before.txt)·[구현 후](../../docs/verification/recording-ux-2026-09-29/graft-s1-after.txt)에 수동 확인 범위와 Graft 누락을 적었다. 호출 순서는 바뀌었으나 구성 요소 경계는 그대로다. phase 계획은 Archify 불필요로 판단했지만 AGENTS.md의 실행 흐름 시각화 지침에 따른 새 Archify 결과는 없다. 이 세션에 bkit MCP 도구가 없으며 `docs/02-design/features/recording-ux.design.md`도 아직 없어 bkit 설계 대비 분석을 수행하지 못했다. `docs/AI-DEVELOPMENT.md`의 완료 판정 조건에 따라 이 step은 `blocked`로 기록한다.

기존 작업 트리의 다른 변경은 보존했다. 커밋·배포·운영 DB 적용은 하지 않았다.
