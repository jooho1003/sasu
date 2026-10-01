# Step 10: desktop-work

## 읽어야 할 파일

- `docs/PRD.md` §3-8 DC-09, §3-3 AG-04·AG-07, §3-7(쉬운 말 기준), `docs/wording-guide.md`
- `docs/ARCHITECTURE.md` §6-8·§6-10(AG-07), §6-12 불변식 46~50
- `docs/ADR.md` ADR-054(자료 검토함), ADR-080(AG-07), ADR-082 결정 8
- `docs/02-design/features/desktop-companion.design.md` §4(E12~E16)·§5.3 "일 맡기기"·§5.4(U09·U10)
- step 8·9 산출물: `desktop/src/main/api/storage-upload.ts`(`uploadReview` — 메타데이터 등록 → 기기 세션 Storage 직접 업로드 → 구간 등록이 이미 있다), `desktop/src/main/ipc.ts`(`upload:review`·`sales:*` 채널), `desktop/src/preload/index.ts`, `desktop/src/renderer/src/components/`(step 9에서 나눈 화면), `desktop/tests/e2e/`
- 웹 기준 화면: `components/reviewed-materials.tsx`(파일 검사·지문·`audioPlan`·`encodeMonoWav`·공개 범위·참여자·동의 확인), `components/sales-review-sources.tsx`·`components/sales-source-ai-review.tsx`(원문 역할 4개 선택·요청·상태)
- `lib/adapters/review-audio.ts`, `lib/contracts.ts`(`ReviewCreate`, `SalesSourceReviewRequest`)

## 작업

step 9가 남겨 둔 **일 맡기기** 탭의 두 구역을 만든다. 둘 다 lead에게만 보인다(member에게는 "팀장만 사용할 수 있어요" 안내).

1. **자료 검토함 올리기**(`components/WorkReviewUpload.tsx` 등):
   - 끌어다 놓기 또는 파일 선택. 문서 `.txt/.md/.csv/.json/.pdf/.docx`(20MB), 음성 `audio/*`(50MB·30분) — 웹과 같은 검사.
   - 입력: 제목, 공개 범위(`dept`/`leads_only`), 음성이면 참여자(부서 멤버 목록에서 선택)와 합성 여부, "참여자 동의를 확인했어요" 체크(`consent_confirmed: true`가 아니면 보내지 않음).
   - 화면에서 SHA-256 지문을 계산하고, 음성은 Web Audio로 디코드한 뒤 `@sasu/review-audio`의 `audioPlan`·`encodeMonoWav`로 구간 WAV를 만든다. 원본·구간 바이트를 `upload:review` IPC로 본체에 넘긴다(본체의 `uploadReview`가 업로드한다). 화면은 Supabase·fetch를 쓰지 않는다.
   - 진행 문구(원본 보관 중 · 구간 n/N), 실패 시 웹과 같은 안내와 "웹에서 이어서 하기"(`app:openWeb('/d/<dept>/reviews/<id>')`).
   - 참여자 목록이 필요하면 본체에 최소 IPC를 추가한다(예: `members:list` → 사용자 JWT로 같은 부서 `members`의 `user_id·display_name·consented_at`만). 새 서버 경로가 필요하면 `/api/companion/members` GET을 `requireDeviceContext` + RLS로 만든다(service role 금지).
2. **영업 원문 검토**(`components/WorkSalesReview.tsx` 등):
   - `sales:sources`로 후보를 받아 역할 4개(고객 요청·기존 견적·변경 견적·원칙)마다 서로 다른 원문을 고른다. 원칙은 원칙 소스 후보에서만. 같은 원문을 두 역할에 고르면 보내지 않는다.
   - `sales:start`(클라이언트가 만든 `request_id`) → 202 → 상태를 `sales:status`로 확인(상태 요약 30초 또는 화면이 열려 있으면 5초) → 완료되면 "웹에서 결과 보기"(`web_path`). 결과 본문은 앱에 복제하지 않는다.
   - `sales:*`가 403(`lead_only`·`consent_required`·`demo`)이면 해당 안내, 404면 구역을 숨긴다.
3. 상태 요약의 `reviews`·`sales`가 펫 상태(진행 중·완료·실패)에 반영되는지 확인한다(core `computePetState`는 step 8에 있다).
4. E2E(`desktop/tests/e2e/work.spec.ts`, 로컬 QA): lead 기기로 ① 작은 `.txt` 문서 → 자료 검토함 등록 201 → Storage에 `original` 존재 → 구간 202 ② 2초짜리 합성 WAV 음성 → 구간 업로드·등록 ③ 영업 원문 4건 선택 → 요청 202 → 같은 요청 재전송 멱등 → 상태 표시. member 기기에서는 두 구역이 보이지 않고 IPC를 직접 불러도 403. 결과·스크린샷은 `docs/verification/43-desktop-companion/desktop-work.md`.

## 보완 — 3회 실패의 원인 (2026-10-02 오케스트레이터 재현)

이전 3회 시도의 `upload:review` "network: 서버에 연결하지 못했습니다"는 **네트워크 문제가 아니었다.** 임시 로그로 원래 예외를 확인한 결과:

- 서버 `POST /api/companion/reviews/<id>/parts`는 정상 202를 돌려준다(Electron 밖 Node fetch 재현: 7초 유휴 뒤에도 202).
- 응답의 `job_id`는 `queue_review_part`가 구간마다 **결정적으로** 만드는 값이라(같은 구간 재요청 시 같은 값) RFC 4122 variant 비트를 따르지 않는다. 예: `42e1b3e2-2daa-710d-e1a5-4ce4ad1f9bb8`.
- 앱의 응답 파서(`desktop/src/shared/contracts.ts`의 `const Uuid = z.string().uuid()`)가 이를 `ZodError: Invalid UUID`로 거부했고, `desktop/src/main/api/client.ts`의 catch가 파서 오류까지 `network`로 분류했다.

고칠 것:
1. 서버가 만든 ID(job_id·task_id·answer_id·card id·link_id 등)를 받는 앱 파서와 IPC 입력은 `z.guid()`(8-4-4-4-12 16진 형식만 확인)를 쓴다. `desktop/src/shared/contracts.ts`의 `Uuid`, `desktop/src/main/ipc.ts`의 `IdInput`·`id`·`SalesStatusInput.task_id`·`seen[]`, `desktop/src/main/outbox-service.ts`의 `parentId`가 대상이다. 앱이 `crypto.randomUUID()`로 만드는 ID(review id·request_id)는 그대로 둬도 된다.
2. `ApiClient`는 `fetch` 실패만 `network`/`timeout`으로 분류하고, 응답 파싱 실패는 `ApiError(status, "invalid_response", "서버 응답을 확인하지 못했습니다.")`로 구분한다. `retryTransient`는 `invalid_response`를 재시도하지 않는다.
3. 위 두 경우를 core·shared 단위 테스트로 고정한다(비표준 variant의 job_id 통과, 파서 실패가 network가 아님).
4. E2E를 QA 환경 빌드로 돌린다: 서버는 `node scripts/review-qa.mjs build` 뒤 `start`(일반 `npm run build`의 `.next`는 운영 Supabase 주소라 모든 Bearer가 401이다), 앱은 `SUPABASE_URL`·`SUPABASE_ANON_KEY`(로컬 QA)·`SASU_APP_URL=http://127.0.0.1:3011`을 넣고 빌드한다.
5. E2E 140~141행처럼 구간 상태를 `queued`로만 기대하면 워커가 먼저 처리했을 때 실패한다. `queued|processing|done|ready` 중 하나와 job 존재로 판정한다.

## 실행 메모 — 장시간 서버 (2026-10-02 오케스트레이터)

이전 시도에서 Codex 셸 도구로 `node scripts/review-qa.mjs start`(또는 `dev`)를 직접 띄우자 명령이 끝나지 않아 세션이 40분 넘게 멈췄다. 검증 서버는 아래처럼 **분리 프로세스**로 띄우고, 준비를 HTTP로 확인한 뒤 쓰고, 끝나면 **반드시 종료**한다.

```powershell
$qa = Start-Process node -ArgumentList "scripts/review-qa.mjs","start" -WorkingDirectory (Get-Location) -WindowStyle Hidden -PassThru -RedirectStandardOutput ".vercel/review-qa/qa-server.out.log" -RedirectStandardError ".vercel/review-qa/qa-server.err.log"
for ($i=0; $i -lt 90; $i++) { try { if ((Invoke-WebRequest http://127.0.0.1:3011 -UseBasicParsing -TimeoutSec 2).StatusCode) { break } } catch {}; Start-Sleep 2 }
# ... E2E 실행 ...
taskkill /PID $qa.Id /T /F
```

step을 끝내기 전에 이 step에서 띄운 서버·Electron·Playwright 프로세스가 남아 있지 않은지 확인한다. 남은 프로세스는 실행기를 멈추게 한다.

## Acceptance Criteria

```powershell
npm --prefix desktop run lint
npm --prefix desktop test
npm --prefix desktop run build
npm --prefix desktop run e2e
npm run check:wording
npm run lint
npm run build
npm run test
git diff --check
```

- 정적 확인(출력 0줄): `git grep -n "dangerouslySetInnerHTML\|fetch(\|createClient(" -- desktop/src/renderer`
- E2E 기록에 ①②③과 member 403의 실제 출력이 있어야 완료다.

## 검증 절차

1. AC 실행, 업로드·영업 요청 화면 스크린샷을 기록에 연결한다.
2. 체크리스트: 화면에 토큰·네트워크 없음 · 동의 확인 없이 업로드 안 됨 · 결과 본문 복제 없음 · 문구 검사 통과.
3. `phases/43-desktop-companion/index.json` step 10을 갱신한다.

## 금지사항

- 자유 텍스트를 영업 검토 입력으로 받지 마라. 이유: ADR-082 결정 8 — 확정된 원문 4건만 고른다.
- 원본 파일을 앱 로컬에 남기지 마라(업로드 뒤 메모리만). 이유: 불변식 50.
- 서명 URL을 service role로 만들지 마라. 이유: 기기 세션 Storage RLS가 판정한다(불변식 46).
- 앱에서 영업 검토 결과·원문 인용을 저장하거나 다시 그리지 마라. 이유: AG-07 결과는 웹이 현재 권한으로 다시 검증해 보여 준다.
- 기존 테스트를 깨뜨리지 마라.
