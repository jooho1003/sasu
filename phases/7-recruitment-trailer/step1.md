# Step 1: 공간 탐색형 오피스 재구현

## 읽어야 할 파일

- PRD §3-1·§8-1, ARCHITECTURE §6-1, ADR-041
- `components/recruitment-trailer.tsx`, `lib/trailer.ts`

## 작업

격자형 장소 버튼 맵을 실제 Canvas 2D 오피스로 대체한다. 전용 배경, 걷는 캐릭터, 벽/가구 충돌, 클릭 경로 탐색, 카메라/줌, 근접 NPC 대화, 오버레이 수첩·결재함, 모바일 이동 버튼을 구현한다. 목록 경로와 3퀘스트는 유지한다. 공간 순수 함수는 테스트부터 작성한다.

## Acceptance Criteria

- `npm run lint` → `npm run build` → `npm run test`, `npm run e2e:trailer` 통과.
- 모든 상호작용 지점 도달 가능, 벽 통과 불가, 도착 전 NPC 열림 불가, 모달 입력 중 캐릭터 정지.
- 실제 렌더 스크린샷을 보고 공간·아바타·HUD와 모바일 조작을 확인한다.
- 플레이 API·개인정보 저장·채점·실제 사용자 접속 수 표시는 추가하지 않는다.
