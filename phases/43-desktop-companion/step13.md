# Step 13: desktop-followup

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-04·05·08·10, §8-1·§11 데스크톱 행
- `docs/ARCHITECTURE.md` §6-12 불변식 46~50·§8
- `docs/ADR.md` ADR-082
- `docs/01-plan/features/desktop-companion.plan.md`
- `docs/02-design/features/desktop-companion.design.md` 전체, 특히 §11.4
- `docs/03-analysis/desktop-companion.analysis.md` §6 G2~G4
- `desktop/src/main/{index,ipc}.ts`, `storage/encrypted-file.ts`, `core/poller.ts`
- `desktop/src/preload/index.ts`, `desktop/src/renderer/src/{App.tsx,components/AskTab.tsx,components/LoginFlow.tsx}`

## 작업

기존 승인 설계의 검수 이월 G2~G4만 보완한다. 새로운 plan/design 사이클은 만들지 않는다.

1. `SettingsService`를 테스트부터 작성한다. 암호화 파일의 읽기·수정·쓰기·삭제를 하나의 큐로 처리한다. `markSeen(id)`는 최신 저장값에 ID를 추가한다. renderer가 전체 `seen`을 교체할 수 없게 IPC·preload 타입을 좁힌다. 펫 위치 저장과 로그아웃 삭제도 같은 서비스로 배선한다.
2. 기존 `core/poller.ts`에 취소 가능한 답 폴링을 TDD로 추가한다. 네트워크·서버 조회 오류는 화면 안내 후 종료한다. 완료·120초·새 질문·화면 종료 뒤 추가 요청과 늦은 화면 반영이 없어야 한다. 질문 접수 자체를 재시도하지 않는다.
3. 기기 이름은 본체 `hostname()`에서 E02로 보낸다. renderer는 부서 ID만 보낸다. 서버 계약·권한 경로를 바꾸지 않는다.

## 코드 관계와 구조 확인

- 변경 전후: App/AskTab → preload → IPC → SettingsService → 기존 암호화 파일; 펫 이동·로그아웃은 같은 저장 큐.
- Graft·Archify 도구의 실행 여부와 누락 범위를 `docs/verification/43-desktop-companion/followup.md`에 기록한다. 사용할 수 없으면 코드로 확인한 관계를 기록하며 도구 산출물로 표시하지 않는다.

## Acceptance Criteria

```powershell
npm --prefix desktop test
npm --prefix desktop run lint
npm --prefix desktop run build
npm --prefix desktop run e2e -- --grep 'desktop followup'
npm run lint
npm run build
npm run test
git diff --check
```

추가 회귀: 읽음 ID 동시 추가·설정/위치 변경 보존·실패 후 큐 복구·삭제 직렬화, 폴링 오류와 취소, 실제 Electron IPC의 hostname·발신 창·입력 제한·암호화 저장, 오류 안내·탭 이동 뒤 요청 종료. Electron 합성 UI 검증과 실제 DB/API 전체 흐름 검증을 구분한다.

## 완료 기록

- 실행 로그와 G2~G4 결과를 followup.md에 연결하고 analysis/report에 후속 결과를 추가한다.
- step 13만 완료 처리한다. step 12 및 전체 phase는 사람 실측·운영 승인 대기를 유지한다.

## 금지사항

- 운영 DB·Auth·메일·배포 저장소를 바꾸거나 설치 파일을 게시하지 않는다. 운영 승인이 필요하다.
- renderer에 네트워크·토큰·Node 기능을 열지 않는다.
- 사람 설치·업데이트 실측을 추정하거나 기존 검증 기록을 덮어쓰지 않는다.
