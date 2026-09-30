# capture-lock 실행 기록 (2026-09-29)

## 변경

- `acquireCaptureLock`은 Web Locks의 `ifAvailable` 보유만 유지한다. release는 idempotent이며 callback Promise가 release까지 잠금을 보유한다.
- `startRecording`의 lease-loss 중단 경로를 제거했다.
- `cleanupLocalRecordings`가 예전 `sasu-meeting-capture-lease` IndexedDB를 기다리지 않고 최선 노력으로 삭제한다.
- 브라우저 실험실 테스트에 6초 메인 스레드 정지, 두 번 release, 기존 lease DB 삭제를 추가했다.

## 관계 확인

- Graft 전: `capture-lock-graft-before.txt`
- Graft 후: `capture-lock-graft-after.txt`
- 두 그래프 모두 `graft check` 통과. `acquireCaptureLock`은 `startRecording`만 호출하며, 그 호출자는 `MeetingRecorder.begin`과 recording lab이다. `cleanupLocalRecordings`의 호출자는 `MeetingRecorder`다. 변경 뒤 `capture_lease_lost`는 그래프 인덱스에 0건이다.
- Archify는 구성 요소 경계·데이터 흐름·서버/SQL이 바뀌지 않고 `storage.ts` 내부 잠금 구현만 축소하므로 실행하지 않았다.

## 검증

실행 위치: HEAD `113a703`에서 딴 격리 worktree(브랜치 `fix/capture-lock-20260929`). 원본 작업 트리에 다른 세션의 phase 23·33 미커밋 변경이 있어 분리했다.

| 명령 | 결과 |
|---|---|
| `npm run lint` | exit 0 · blocking 0 |
| `npm run build` | 성공 (Next.js 16.3.4). `next-env.d.ts` 변경 없음 |
| `npm run test` | 148 파일 · 1,624 통과 |
| `npx playwright test --config playwright.recording.config.ts` | 21 통과 · 1 skip (기존 20 + 새 사례 "Web Lock survives a six-second main-thread stall, releases idempotently, and cleanup removes the legacy lease DB") |
| `grep -rn "BroadcastChannel\|capture_lease_lost\|leaseDb\|heartbeat" lib/recording/browser` | 0건 |
| `grep -n "sasu-meeting-capture-lease" lib/recording/browser/storage.ts` | 1건 (264행 `deleteDatabase`) |

경과: 첫 실행(Codex `gpt-5.6-terra`)에서는 worktree `node_modules`를 원본으로 잇는 junction을 Turbopack이 "points out of the filesystem root"로 거부해 build가 3회 실패했다. 원본 `node_modules`는 영향이 없음을 확인했고(`next --version` 16.3.4), worktree에 `npm ci`로 따로 설치한 뒤 메인 세션이 위 AC를 다시 실행했다.

`e2e:recording`이 다시 쓴 기존 `docs/verification/**` 파일 5개는 `git checkout`으로 되돌렸다. 원본 작업 트리의 같은 파일 미커밋 변경과 병합이 충돌하지 않게 하려는 것이다. 분석 문서 갱신은 메인 세션이 원본 트리에서 한다.
