# Step 3 결과 — 녹음 흐름 안내 (Graft 검증 대기)

bkit [design](../../docs/02-design/features/recording-ux.design.md) §5.3·§5.4의 S3과 [step3 명세](step3.md)를 기준으로 녹음 화면에 3단계 표시를 넣었다. 현재 단계는 `recorderStage`에 따라 `aria-current="step"`으로 이동한다. 비활성 테스트·시작 버튼 아래에는 `missingTestConditions`·`missingStartConditions` 결과가 표시되고 `aria-describedby`로 연결된다.

복구 목록은 현재 열린 세션을 제외하며, 녹음 중에는 목록 대신 안내를 보인다. 각 행은 `sessionStateLabel`·`formatExpiry`로 상태와 기한을 한국어로 표시한다. `확인하고 저장` 버튼과 분리된 위험 모양의 `녹음 폐기`를 사용한다. `새 녹음 화면으로`는 선택·키·로컬 표시 상태와 오래된 5초 테스트를 비우고 목록을 다시 읽는다. 서버 폐기나 로컬 음성 삭제를 요청하지 않는다. 열린 세션의 폐기는 패널 맨 아래 설명과 구분선 아래에 둔다.

녹음 방식 라디오는 이름을 공유한다. 테스트·실시간 미터에는 입력별 접근 가능한 이름을 붙였다. 입력 감지는 100ms 간격 최근 15개 크기를 `signalDetected`로 판정한다. 5초 테스트 안내는 마이크 단독과 컴퓨터 소리+마이크 모드별로 다르다. 입력 방식을 바꾸면 이전 테스트 음성이 남지 않게 한다. 서버·SQL·migration·시작/저장 API는 수정하지 않았다. `lib/` 신규 모듈도 없다.

검증 기록(2026-09-29):

- `npm run e2e:review-controls`: 단독 재실행 19/19 통과. 단계 이동, 비활성 이유와 연결, 라디오 키보드 이동, 미터 이름, 현재 세션 제외, 복구 목록 버튼, 새 화면 복귀·폐기 0건을 확인했다. 마지막 테스트 편집 뒤 관련 녹음 흐름 1개를 재실행해 통과했다. 첫 전체 병렬 실행에서는 접근성 화면이 초기 안내만 렌더되어 실패했고, 검증 서버 정리 후 단독 실행에서 통과했다.
- `npm run e2e:recording`: 20/20 통과, 기존 3분 실시간 시험 1개 skip.
- `npm run lint`: 통과. 기존 문구 경고 79건, 차단 0건.
- `SASU_VERIFY_BUILD=1`에서 `npm run build`: Next.js 16.3.4 컴파일·TypeScript·38개 정적 페이지 생성 통과. `next-env.d.ts` 복원.
- `npm run test -- --maxWorkers=2 --testTimeout=15000`: 149파일·1,659개 통과.
- [양식 1440px](../../docs/verification/recording-ux-2026-09-29/s3-form-1440.png)·[390px](../../docs/verification/recording-ux-2026-09-29/s3-form-390.png)·[복구 목록 1440px](../../docs/verification/recording-ux-2026-09-29/s3-recovery-list-1440.png)을 열어 확인했다. 합성 입력의 로컬 UI 검증이다.

[구현 전 관계](../../docs/verification/recording-ux-2026-09-29/graft-s3-before.txt)·[구현 후 관계](../../docs/verification/recording-ux-2026-09-29/graft-s3-after.txt)는 수동 검색이다. 로컬 Graft 실행 파일과 MCP 도구가 없고 Docker 엔진 파이프도 없어 필수 Graft 전후 그래프를 만들지 못했다. `docs/AI-DEVELOPMENT.md`의 도구 결과 없는 step 완료 금지 규칙에 따라 상태는 `blocked`로 기록한다. 기존 다른 변경은 보존했고 커밋·배포는 하지 않았다.
