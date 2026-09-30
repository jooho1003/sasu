# Step 8: ux-verification

step 0~7의 결과를 실제 로컬 서버와 화면에서 확인하고 기록한다. 이 step은 코드를 고치지 않는다. 실패를 찾으면 기록하고 멈춘다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.4 Page UI Checklist 전체 · §8 Test Plan. `/pdca analyze recording-ux`가 이 목록과 대조한다)
- `/docs/PRD.md` §11 완료 판정(웹 회의 녹음 행, "가상 스트림 E2E만으로 OS 시스템 소리 지원을 주장하지 않음", 실행 기록 요구)
- `/docs/AI-DEVELOPMENT.md` §2 5~6 · §5(합성 스모크를 실제 정확도로 발표하지 않음)
- `/docs/setup-guide.md` §3 Supabase
- `docs/verification/recording-ux-2026-09-29/README.md` 전체
- `phases/33-recording-ux/index.json`의 step 0~7 summary
- `playwright.recording-product.config.ts`, `tests/e2e/recording-product.spec.ts`(step 1에서 새 흐름으로 고친 것), `scripts/seed-dept.ts`

## 작업

1. **사전 확인**: `npx supabase status`로 로컬 Supabase(`project_id="sasu"`, API 55321)가 떠 있는지 본다. 아래 환경 변수 **이름**이 셸에 있는지 본다. 값은 출력하지 않는다.
   - `NEXT_PUBLIC_SUPABASE_URL`(localhost/127.0.0.1이어야 함), `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `RECORDING_KEY_SECRET`, `SEED_LEAD_EMAIL`, `SEED_LEAD_PASSWORD`
   하나라도 없거나 Supabase URL이 원격(`supabase.co`)이면 **blocked**로 멈춘다. 이유: `.env`가 원격을 가리키므로 셸에서 로컬 값으로 덮어써야 한다.
2. **자동 검증**: 아래 AC를 모두 실행하고 통과 수를 기록한다. 실제 제품 E2E는 로컬 DB에 조직 스위치가 켜져 있어야 한다. 시드 스크립트가 켜지 않으면 사람에게 요청하는 blocked로 멈추고, 필요한 SQL을 사유에 적는다(`insert into org_settings(org_id, browser_recording_enabled) values ('11111111-1111-4111-8111-111111111111', true) on conflict (org_id) do update set browser_recording_enabled = true;`).
3. **화면 캡처**: 실험실(`npm run e2e:review-controls`가 만든 캡처)과 실제 제품 E2E 캡처를 모은다. 빠진 것이 있으면 Playwright로 1440×900·390×844 두 크기로 찍는다. 대상:
   - 녹음 양식(단계 표시·비활성 이유)
   - 녹음 중(타이머·상태 칩)
   - 종료 확인
   - 복구 목록
   - 검토 화면 플레이어
   - 이어진 기록 줄
   - 관리자 설정
   모두 `docs/verification/recording-ux-2026-09-29/`에 둔다.
4. **키보드 확인**: 실험실 녹음 화면(`/?view=recorder`)에서 마우스 없이 Tab·Shift+Tab·Space·Enter·Esc만으로 진행한다. 순서: 제목 입력 → 동의 → 5초 테스트 → 확인 체크 → 녹음 시작 → 잠시 멈추기 → 다시 시작 → 녹음 종료 → 계속 녹음(Esc) → 녹음 종료 → 녹음 끝내기 → 저장 버튼까지. 이 흐름을 Playwright 사례 `tests/review-controls/keyboard-recorder.spec.ts`로 남긴다. 각 단계에서 포커스가 보이는지 캡처 1장을 남긴다.
5. **Graft 마감**: README §4 절차로 `{N}=8`, `{when}=after`를 한 번 더 만들고, `graft check`와 이 phase에서 바뀐 컴포넌트의 `graft grep` 결과를 `graft-s8-after.txt`에 남긴다. Archify는 README §3의 사유대로 실행하지 않았다고 적는다.
6. **기록**: `docs/verification/recording-ux-2026-09-29/README.md` §6에 결과를 적는다.
   - U01~U22 각각의 결과(해결·부분·남음)와 근거 캡처·테스트 이름
   - 실행한 명령과 통과·실패 수
   - 합성 입력(실험실)과 실제 로컬 서버 결과를 나눈 표
   - 실제 기기 녹음(V01~V06)은 이 phase에서 하지 않았다는 사실
   - 남은 문제

## 코드 관계와 구조 확인

- Graft: 5번. 산출물 `docs/verification/recording-ux-2026-09-29/graft-s8-after.txt`.
- Archify: 실행하지 않음(README §3). 요약에 사유를 적는다.

## Acceptance Criteria

```powershell
npx supabase status
npm run lint
npm run test -- --maxWorkers=2 --testTimeout=15000
npm run e2e:recording
npm run e2e:review-controls
npm run build
npx playwright test --config playwright.recording-product.config.ts
```

`npm run build`는 제품 E2E가 `npm run start`(3200 포트)로 띄우므로 일반 빌드를 쓴다. 실행 전 떠 있는 `npm run dev`가 있으면 멈춘다. 판정 기준: 모든 명령 통과. 제품 E2E는 녹음 시작 한 번 → 녹음 → 종료 확인 → 저장 → 검토 화면 이동을 지나고 CSP 위반 0건·페이지 오류 0건.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - 기록이 합성 결과와 실제 서버 결과를 나눴는가? 실제 기기 결과를 주장하지 않았는가?
   - CLAUDE.md CRITICAL: 기록·로그에 비밀값과 원문을 남기지 않았는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 8을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "통과 수(단위·실험실·제품 E2E), U01~U22 결과 요약, 캡처 폴더, 남은 문제"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "실패한 명령과 출력 마지막 줄"`
   - 사용자 개입 필요(로컬 Supabase·환경 변수·조직 스위치) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- 이 step에서 제품 코드를 고치지 마라. 이유: 검증 step이다. 실패는 기록하고, 고치는 일은 사람이 새 step으로 정한다.
- 원격 Supabase에 대고 테스트하지 마라. 이유: `.env`가 원격을 가리킨다. 셸 변수가 로컬이 아니면 blocked로 멈춘다.
- 환경 변수 값·키·비밀번호를 출력하거나 기록하지 마라. 이유: 비밀값을 리포에 남기지 않는다(CLAUDE.md).
- 합성 입력 결과를 실제 기기·실제 회의 결과로 적지 마라. 이유: PRD §11, AI-DEVELOPMENT §5.
- 운영 DB에 migration을 적용하거나 배포하지 마라.
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
