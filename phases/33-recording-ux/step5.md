# Step 5: recording-entry-switch

조직 녹음 스위치가 꺼지면 녹음 진입을 보이지 않게 하고(설계 V19 "진입 버튼 없음"), 녹음 자료에 `회의 녹음` 배지를 붙인다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S5`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §3.4 권한은 SQL에서 판정한다 · §6 불변식 · §6-5 웹 회의 녹음 · §8 테스트 경계
- `/docs/ADR.md` ADR-057(조직 스위치) · ADR-070 결정 8(스위치 off)
- `/docs/PRD.md` §3-4 SEC-04 행 · §6-8 API 엔드포인트 표의 `/api/d/[dept]/reviews` 행 · §11 웹 회의 녹음 행(V19)
- `docs/planning/웹회의_녹음_설계.md` §13.3 SEC-11 · §13.4 V19
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U21·U22)·§4
- `app/api/d/[dept]/reviews/route.ts`(목록 GET), `app/api/d/[dept]/reviews/[id]/route.ts`(:48-62 `client.rpc("review_org_settings", { p_dept })`로 스위치를 읽는 방식, :116-117 `can_continue`)
- `components/reviewed-materials.tsx`(:199-225 팀장/멤버 분기와 `회의 녹음` 링크, 목록 배지 렌더)
- `app/(auth)/d/[dept]/reviews/record/page.tsx`
- `lib/contracts.ts`(목록 응답 스키마가 있으면), `tests/review-detail-route.test.ts`(route 단위 테스트 작성 방식)

## 작업

1. **목록 API**: `GET /api/d/[dept]/reviews` 응답에 `recording_enabled: boolean`을 더한다. 세션 클라이언트로 `client.rpc("review_org_settings", { p_dept: member.deptId })`를 불러, `browser_recording_enabled === true`일 때만 true로 둔다. 오류가 나거나 값이 없으면 false로 둔다(목록은 계속 돌려준다). `reviewed_materials` select에 `original_layout`을 더한다. 응답 스키마가 `lib/contracts.ts`에 있으면 거기에도 필드를 더하고 계약 테스트를 먼저 고친다.
2. **목록 화면**: `components/reviewed-materials.tsx`는 `recording_enabled`가 true일 때만 `회의 녹음` 링크를 보여 준다. false면 링크 자리에 아무것도 두지 않는다(V19). `original_layout === "audio_segments"`인 항목은 배지를 `음성` 대신 `회의 녹음`으로 쓴다.
3. **녹음 페이지**: `app/(auth)/d/[dept]/reviews/record/page.tsx`에서 팀장·동의 확인 뒤, 세션 서버 클라이언트로 같은 RPC를 읽는다. 스위치가 꺼져 있으면 `MeetingRecorder` 대신 제목 `회의 녹음`과 "조직에서 웹 회의 녹음을 껐습니다. 파일 가져오기를 이용해 주세요."(`lib/recording/recording-routes.ts`의 기존 문구와 같게), 그리고 `올린 자료 확인` 링크를 보여 준다.
4. **테스트**: route 단위 테스트(`tests/reviews-list-route.test.ts`, 없으면 새로)를 `tests/review-detail-route.test.ts` 방식으로 쓴다. 확인할 것: RPC가 켜짐 → true, 꺼짐 → false, 행 없음(null) → false, RPC 오류 → false이고 목록은 200. `original_layout`이 응답에 있다. service role 모듈(`lib/supabase/service`)을 import하지 않는다.

## 코드 관계와 구조 확인

- Graft(README §4, `{N}=5`): 전후 `graft grep "review_org_settings|recording_enabled|reviews/record"`와 `graft callers ReviewedMaterials`(비면 `graft grep "<ReviewedMaterials"`)로 목록 응답을 쓰는 곳을 모두 찾는다. 데모 화면(`app/demo/**`)이 같은 응답 모양을 쓰면 함께 확인한다. `graft-s5-before.txt`·`graft-s5-after.txt`.
- Archify: 해당 없음(응답 필드 추가와 표시 분기).

## Acceptance Criteria

```powershell
npx vitest run tests/reviews-list-route.test.ts tests/review-detail-route.test.ts tests/contracts.test.ts
npm run e2e:review-controls
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build; git restore next-env.d.ts
npm run test -- --maxWorkers=2 --testTimeout=15000
```

판정 기준(V19 일부): 스위치 off 조직의 목록 응답 `recording_enabled=false` → 진입 링크 없음, 녹음 페이지는 안내만. 실제 로그인 화면 확인은 step 8에서 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md §3.4: 권한 판정을 애플리케이션에 복제하지 않았는가? (표시 분기일 뿐, 서버·SQL 검사는 그대로)
   - CLAUDE.md CRITICAL: 요청 경로에서 service role을 쓰지 않았는가? `dept_id`를 요청 본문이 아닌 멤버십에서 정했는가?
   - 새 `lib/` 모듈이 생겼다면 `tests/` 미러 테스트가 있는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 5를 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "목록 응답 recording_enabled·original_layout, 진입 링크·녹음 페이지 분기, 배지, 테스트·Graft 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 버튼을 숨기는 것으로 권한을 대신하지 마라. 서버 route와 SQL의 스위치 검사(`start_review_recording` 등)를 지우거나 약하게 하지 마라. 이유: 버튼을 숨기는 것은 권한이 아니다(CLAUDE.md). 서버·RLS가 집행한다.
- 스위치를 service role 클라이언트로 읽지 마라. 이유: 사용자 요청 경로다. 상세 route와 같은 세션 RPC를 쓴다.
- `org_settings` 테이블을 직접 select하는 정책을 새로 만들지 마라. 이유: 기존 `review_org_settings` RPC가 이미 권한을 판정한다.
- migration을 추가하지 마라. 이유: 이 phase는 화면 개선이다.
- 멤버에게 `회의 녹음` 링크를 보이게 바꾸지 마라. 이유: 녹음은 동의한 팀장만 한다(PRD REC-06).
- 테스트를 지우거나 `skip`하지 마라.
- 검증 빌드 없이 `npm run build`를 돌리지 마라.
- 기존 테스트를 깨뜨리지 마라.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
