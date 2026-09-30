# Step 4-B4: 낮은 신뢰·경계 확인 구간 검토 UI

## 입력

- `docs/PRD.md` §3-4 ACC-01, `docs/planning/웹회의_녹음_설계.md` §11.2
- `docs/02-design/features/browser-meeting-recording.design.md` 4-B4 대조 목록
- `components/review-detail.tsx`, `app/globals.css`, `tests/review-controls/recording-segments.spec.ts`
- `docs/verification/browser-meeting-recording/accuracy-step4b3.md`

## 작업·완료 기준

1. `confidence: low`와 `boundary_review: true`를 각각 문자 배지와 카드 배경으로 구분한다. 시각 정보가 없는 기존 단일 파일·사용자 추가 구간은 변화가 없다.
2. `다음 확인 필요 구간` 버튼을 누르면 검색 필터를 지우고 아직 방문하지 않은 구간의 입력칸으로 스크롤·초점을 옮긴다. 모두 방문한 뒤에는 순환한다.
3. 필요한 구간을 모두 한 번 방문하기 전에는 확정 체크박스를 사용할 수 없다. 서버의 기존 확정·권한 계약을 바꾸지 않는다.
4. 실험실 브라우저 테스트에서 배지·순차 초점·검색 해제·확정 체크박스 게이트와 정상 구간 회귀를 확인한다. lint·TypeScript·빌드를 통과한다.

## 검증 기록

`docs/verification/browser-meeting-recording/accuracy-step4b4.md`에 테스트·Graft 관계·남은 인용 칩과 실기기 게이트를 남긴다.
