# Step 14: desktop-session-outbox

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-04·10·11, §11
- `docs/ARCHITECTURE.md` §6-12·§8, `docs/ADR.md` ADR-082
- `docs/01-plan/features/desktop-companion.plan.md`
- `docs/02-design/features/desktop-companion.design.md` 전체, §6·7·11.5
- `docs/AI-DEVELOPMENT.md`
- `desktop/src/main/{index,ipc,outbox-service}.ts`, `auth/supabase.ts`, `api/client.ts`
- `desktop/src/renderer/src/App.tsx`, `desktop/tests/e2e/followup.spec.ts`

## 작업

기존 승인 설계의 로그아웃·세션 삭제·FIFO 계약을 보완한다. 테스트를 먼저 작성하고 API 세션 세대/취소, 보관 큐의 작업·파일 직렬화와 종료 무효화, 공통 종료 이벤트, renderer 재마운트를 구현한다. 서버 계약과 권한 SQL은 그대로 따른다.

Graft로 변경 전후 의존을 확인하고 Archify로 종료→취소→삭제→로그인 흐름을 검사한다. 도구가 실행 불가하면 실제 누락 범위를 기록한다.

## Acceptance Criteria

1. 동시 flush가 같은 보관 질문을 한 번만 전송하고 동시 오프라인 send를 모두 보존한다.
2. 전송 중 종료하면 늦은 응답·실패가 파일을 다시 만들지 않는다. 401 종료 안의 삭제가 교착하지 않는다.
3. invalid_response는 직접/보관 전송 모두 재시도하지 않는다.
4. 설정·트레이 로그아웃, 서버 401 뒤 로그인 화면·기본 펫 상태로 돌아간다. 새 로그인에는 이전 답·기록·설정이 없다.
5. 종료 전 API의 늦은 성공/401이 새 세션을 변경하지 않는다.

실행: desktop `test`, `lint`, `build`, 합성 Electron `e2e -- --grep 'desktop followup'`; root `lint`, `build`, `test`; `git diff --check`.

## 기록과 제한

실행 기록은 `docs/verification/43-desktop-companion/session-outbox.md`, PDCA analyze/report에 연결한다. step14만 완료하며 step12와 phase의 운영 대기 상태는 유지한다. 운영 DB·Auth·메일·배포 저장소·게시 작업은 이 step에 포함되지 않는다.
