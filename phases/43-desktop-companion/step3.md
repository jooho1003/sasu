# Step 3: web-devices

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-10, §3-7(쉬운 말 문구 기준 W1~W7), `docs/wording-guide.md`
- `docs/ARCHITECTURE.md` §6 불변식 2·10, §6-12 불변식 47
- `docs/02-design/features/desktop-companion.design.md` §4(W07·W08)·§5.4(U13)
- step 1·2 산출물: `supabase/migrations/00NN_device_links.sql`(`revoke_device_link`), `lib/companion/context.ts`
- `app/(auth)/d/[dept]/settings/page.tsx`, `components/settings-s5.tsx`(멤버 탭 "내 수집 동의" 패널 위치 :710~751 부근)
- `proxy.ts`(세션 갱신 매처·데모 계정 쓰기 차단)
- 기존 설정 E2E 예: `tests/e2e/` 중 settings·consent를 다루는 spec, `scripts/review-qa.mjs` 명령 목록

## 작업

1. `app/api/devices/route.ts` GET — 쿠키 세션 클라이언트로 본인 활성 연결(`device_links` where `revoked_at is null`)과 부서 이름을 읽어 `{devices:[{id, device_name, dept_name, created_at, last_seen_at}]}`. RLS가 본인 행만 돌려준다. 로그인 안 됨 401(JSON).
2. `app/api/devices/[id]/route.ts` DELETE — `revoke_device_link(id)`. true면 204, false면 404. id가 uuid가 아니면 400.
3. `proxy.ts` 세션 갱신 매처에 `/api/devices`를 추가한다. 데모 계정 쓰기 차단 대상에도 포함되는지 확인한다(DELETE).
4. `components/settings-devices.tsx` — "연결된 기기" 패널.
   - 목록: 기기 이름 · 부서 · 연결한 날 · 마지막 접속. 비어 있으면 "연결된 기기가 없어요."
   - 해제: 버튼 → 같은 자리에서 확인 문장 + `[해제]`/`[취소]` (브라우저 `confirm()` 금지). 성공하면 목록에서 빼고 "이 기기는 다음 요청부터 로그아웃돼요." 안내.
   - 데모 부서·데모 계정에서는 패널을 렌더하지 않는다.
   - 앱 받기 링크는 넣지 않는다(배포 저장소는 운영 반영 승인 뒤 생긴다).
5. `components/settings-s5.tsx` 멤버 탭의 "내 수집 동의" 패널 바로 다음에 넣는다.
6. `tests/devices-route.test.ts`(mock) + `tests/e2e/settings-devices-local.spec.ts`(로컬 QA): 연결 2건 시드 → 목록 2건 → 1건 해제 → 1건 · 다른 사용자 연결은 보이지 않음 · 390px에서 가로 넘침 0. `scripts/review-qa.mjs`에 `settings-devices-test` 명령을 추가해 이 spec을 실행한다.

## 코드 관계와 구조 확인

설정 화면 → `/api/devices` → RPC 경로를 실제 파일로 확인한다. 결과·누락은 `docs/verification/43-desktop-companion/web-devices.md`.

## Acceptance Criteria

```powershell
npx vitest run tests/devices-route.test.ts
npm run lint
npm run build
npm run test
node scripts/review-qa.mjs settings-devices-test
node scripts/review-qa.mjs guest-test
git diff --check
```

## 검증 절차

1. AC 실행, 1440·390px 스크린샷을 `web-devices.md`에 연결한다.
2. 체크리스트: 쿠키 세션만 사용 · service role 없음 · 문구 검사 통과 · 데모 쓰기 0.
3. `phases/43-desktop-companion/index.json` step 3을 갱신한다.

## 금지사항

- `device_links`를 직접 update/delete 하지 마라. 이유: 해제는 `auth.sessions` 삭제와 한 트랜잭션이어야 한다(불변식 47).
- 새 `NEXT_PUBLIC_*` 환경 변수를 만들지 마라. 이유: 클라이언트 노출 값은 CLAUDE.md가 정한 것뿐이다.
- 다른 설정 탭의 동작을 바꾸지 마라.
- 기존 테스트를 깨뜨리지 마라.
