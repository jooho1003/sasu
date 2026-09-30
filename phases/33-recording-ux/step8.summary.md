# Step 8 검증 기록

- bkit PDCA 설계 대조: `docs/02-design/features/recording-ux.design.md`의 S0~S7과 U01~U22 결과를 [검증 기록](../../docs/verification/recording-ux-2026-09-29/README.md) §6에 연결했다. U01~U20은 합성 실험실·단위 검증, U21~U22는 실제 로컬 서버·로그인 제품 E2E에서 확인했다.
- 자동 검증: 단위 151파일·1664 통과, 녹음 실험실 E2E 20 통과·기존 1 skip, 검토 UI E2E 27 통과, 로컬 제품 E2E 9/9 통과. `npm run lint` exit 0(기존 wording 경고 79·blocking 0), `npm run build` 통과, `git diff --check` exit 0.
- 제품 E2E: Docker Linux 엔진과 로컬 Supabase(API 55321)를 시작했다. 로컬 자격 증명으로 시드하고 실제 로그인→녹음→저장→전사→확정→요약 및 조직 스위치 off/on을 검증했다. 원격 DB에는 테스트하지 않았다. 마이크 입력은 합성이며 실제 기기 V01~V06은 검증하지 않았다.
- 검증 중 Node 24 서버 `navigator` 차이로 녹음 페이지 hydration 오류를 발견했다. `components/meeting-recorder.tsx`의 서버·클라이언트 초기 스냅샷을 맞추고 `tests/recording/meeting-recorder-hydration.test.ts`를 추가했다. 실패 발견 후 수정·전체 E2E 재통과까지 기록했다.
- 키보드 흐름은 `tests/review-controls/keyboard-recorder.spec.ts`에서 Tab/Space/Enter/Esc로 저장 버튼 포커스까지 통과했다. 1440×900·390×844 캡처와 제품 off/on 캡처는 검증 폴더에 있다.
- Graft 0.19.0: 계획 시점 388파일·2,093노드·4,979관계, 최종 412파일·2,169노드·5,181관계, 양쪽 `graft check` OK. 단계별 전후 스냅샷은 Docker 장애 당시 생성하지 못했다. Plan §4.1 완료 게이트는 여전히 미충족이다. 최종 결과는 `graft-s8-after.txt`. Archify는 구성 요소 경계 변경이 없어 README §3 사유대로 실행하지 않았다.
- 별도 step8 명세는 코드 수정 없이 실패를 기록하도록 했으나, 발견한 hydration 결함은 전체 제품 E2E의 완료 조건을 막아 같은 검증 과정에서 수정했다. 알림 글자 대비는 info 9.67:1, warning 7.97:1, error 8.50:1로 4.5:1 기준을 넘는다. 운영 배포·커밋은 하지 않았다.
