# Step 2 결과 — 녹음 중 안전 장치 (Graft 검증 대기)

`components/meeting-recorder.tsx`와 `.meeting-recorder` CSS에 종료 확인, 이탈 보호, 탭 제목, 패널별 tone 알림, 녹음 상태·타이머 표시를 구현했다. `녹음 종료`는 확인 영역을 열고 `녹음 끝내기`에서만 중단한다. `계속 녹음`과 Esc는 확인을 닫는다. 녹음 중에는 `beforeunload`와 같은 출처 링크 이동 차단을 걸고 종료 시 해제한다. 수정키·새 탭·다운로드 링크는 차단 대상에서 제외했다.

탭 제목은 녹음 시간에 따라 바뀌고, 자동 중단 때 경고 제목으로 바뀐 뒤 탭이 보이면 복원된다. 사용자 종료·언마운트에서도 복원된다. 오류는 원인을 원형 그대로 보관하고 `recorderErrorText`로 렌더할 때만 번역한다. `run(panel, task)`로 누른 패널에 `role="alert"`를 배치하고 포커스한다. 중단 사유는 `stopReasonNotice`로 변환하며 `duration_limit`은 정보 알림이다. 상태 칩, `m:ss / 30:00` 타이머, 저장된 길이, 3초 저장 지연, 29분 경고를 표시한다. 초 단위 타이머는 `aria-live="off"`이고 숨긴 상태 알림에는 시간 숫자가 없다.

설계 대조: [bkit plan](../../docs/01-plan/features/recording-ux.plan.md)·[design](../../docs/02-design/features/recording-ux.design.md) §5.4의 S2 체크리스트와 [step2 명세](step2.md)를 확인했다. 순수 문구 함수는 S0 모듈을 사용한다. 서버 route·SQL·migration·권한 경로는 바뀌지 않았다. `lib/` 신규 모듈도 없다. [구현 전 관계](../../docs/verification/recording-ux-2026-09-29/graft-s2-before.txt)·[구현 후 관계](../../docs/verification/recording-ux-2026-09-29/graft-s2-after.txt)는 수동 검색이며 Graft 결과는 아니다. `graft`·`archify` 로컬 실행 파일이 없고 Docker 엔진 파이프도 없어서 Graft 그래프와 새 Archify 시각화는 만들지 못했다. S2는 단일 컴포넌트의 이벤트·표시 변경으로 설계 문서는 Archify를 별도로 요구하지 않는다.

검증 기록(2026-09-29):

- `npm run e2e:review-controls`: 18/18 통과. 종료 확인/취소/Esc, 실제 `page.close({ runBeforeUnload: true })` 대화상자와 종료 후 해제, 내부 링크 차단, 탭 제목·중단 제목 복원, 상태 알림 무시간, 오류 패널·포커스·영문 코드 비노출을 확인했다. 마지막 화면 테스트 편집 뒤 관련 사례를 재실행해 통과했다.
- `npm run e2e:recording`: 20/20 통과, 기존 3분 실시간 시험 1개 skip.
- `npm run lint`: 통과. 기존 문구 경고 79건, 차단 0건.
- `SASU_VERIFY_BUILD=1`에서 `npm run build`: Next.js 16.3.4 컴파일·TypeScript·38개 정적 페이지 생성 통과. `next-env.d.ts` 복원.
- `npm run test -- --maxWorkers=2 --testTimeout=15000`: 149파일·1,659개 통과.
- [1440px 캡처](../../docs/verification/recording-ux-2026-09-29/s2-stop-confirm-1440.png)·[390px 캡처](../../docs/verification/recording-ux-2026-09-29/s2-stop-confirm-390.png)를 열어 확인했다. 합성 입력의 로컬 UI 검증이며 실서비스·실기기 검증은 step 8 범위다.

`docs/AI-DEVELOPMENT.md`의 도구 결과 없는 step 완료 금지 규칙에 따라 Graft 전후 그래프 확보 전까지 상태는 `blocked`다. 기존 작업 트리의 다른 변경은 보존했다. 커밋·배포·운영 DB 적용은 하지 않았다.
