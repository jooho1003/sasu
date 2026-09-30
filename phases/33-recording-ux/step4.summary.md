# Step 4 결과 — 원본 플레이어 탐색 (Graft 검증 대기)

bkit [design](../../docs/02-design/features/recording-ux.design.md) S4와 [step4 명세](step4.md)에 따라 `RecordingSegmentPlayer`의 탐색 확정 시점을 바꿨다. 슬라이더 `onChange`는 표시 위치만 바꾼다. 재생 중 포인터를 놓거나 취소할 때 한 번, 키보드 탐색 키의 마지막 입력 300ms 뒤 한 번만 재생 위치를 옮긴다. 본문 구간의 `seekRequest`는 계속 즉시 이동한다. 이전 fetch는 `AbortController`로 중단하고 `AbortError`는 안내하지 않는다. 기존 현재·다음 2구간 미리 받기와 구간 번호 요청을 유지했다.

플레이어는 재생 버튼·슬라이더·현재/전체 시각을 한 줄에 두고, 내려받기 버튼을 아래에 둔다. 슬라이더에 `녹음 시각` 이름과 분·초 기반 `aria-valuetext`를 제공한다. 버튼 이름과 기존 안내 문구는 유지했다. 서버 route·분당 제한·SQL은 바꾸지 않았다.

검증 기록(2026-09-29):

- `npm run e2e:review-controls`: 22/22 통과. 포인터를 끄는 동안 신규 원본 요청 0건, 놓은 뒤 2건 이하, ArrowRight 10회 뒤 2건 이하. 기존 429 안내·섹션 탐색·다운로드·재시도 테스트도 통과.
- `npm run lint`: 통과, 기존 문구 경고 79건·차단 0건.
- `SASU_VERIFY_BUILD=1`에서 `npm run build`: Next.js 16.3.4 컴파일·TypeScript·38개 정적 페이지 생성 통과. `next-env.d.ts` 복원.
- `npm run test -- --maxWorkers=2 --testTimeout=15000`: 149파일·1,659개 통과.
- [1440px 캡처](../../docs/verification/recording-ux-2026-09-29/s4-player-1440.png)·[390px 캡처](../../docs/verification/recording-ux-2026-09-29/s4-player-390.png)를 열어 확인했다. 390px에서 버튼/슬라이더와 시각이 두 줄로 읽히며 가로 넘침은 없다.

[구현 전 관계](../../docs/verification/recording-ux-2026-09-29/graft-s4-before.txt)·[구현 후 관계](../../docs/verification/recording-ux-2026-09-29/graft-s4-after.txt)는 수동 검색이며 Graft 결과가 아니다. 로컬 실행 파일/MCP 도구와 Docker 엔진이 없어 필수 Graft 그래프를 만들지 못했다. `docs/AI-DEVELOPMENT.md`의 완료 규칙에 따라 상태는 `blocked`다. 다른 작업 트리 변경은 보존했고 커밋·배포는 하지 않았다.
