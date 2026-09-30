# Step 7: admin-recording-switch

조직 관리자 화면의 녹음·내려받기 스위치 설명을 각 항목 곁에 두고, 진행 중인 녹음 건수를 미리 보여 준다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S7`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §6-5 웹 회의 녹음 · §8 테스트 경계
- `/docs/ADR.md` ADR-057(조직 설정) · ADR-070 결정 8(스위치 off는 진행 중 녹음 저장도 막음, 관리자 화면이 끄기 전에 진행 중 건수를 알림)
- `/docs/PRD.md` §3-4 SEC-04 행 · §11 웹 회의 녹음 행(V19)
- `/docs/wording-guide.md`
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U20)·§4
- `components/admin/review-settings.tsx` 전체, `app/admin/security/page.tsx`, `app/api/admin/review-settings/route.ts`(GET이 `active_recordings`를 돌려주는 방식)
- `tests/review-controls/access.spec.ts`(:70-105 설정 사례), `scripts/review-controls-lab/main.tsx`(`?view=settings&recording=1&readonly=1`)

## 작업

`components/admin/review-settings.tsx`만 고친다(테스트 제외).

1. **설명 위치(U20)**: 각 체크박스 바로 아래에 그 항목의 설명을 둔다. 체크박스의 `aria-describedby`로 연결한다. 내려받기 설명은 지금의 첫 문단이고, 녹음 설명은 지금의 둘째 문단이다. 문구는 유지하되 두 문단이 섞이지 않게 나눈다.
2. **진행 중 건수 미리 보기**: `writable`이고 저장된 녹음 스위치가 켜져 있으면, 마운트 때 한 번 `GET /api/admin/review-settings`를 불러 녹음 설명 아래에 "지금 진행 중인 녹음 n건"을 보여 준다(0건이면 "지금 진행 중인 녹음이 없습니다"). 실패하면 아무것도 보여 주지 않는다. 끌 때의 확인 흐름(:17-24)은 그대로 둔다. 확인 직전에 다시 조회하는 것도 유지한다.
3. 버튼 이름 `원본 보호 설정 저장`, 체크박스 이름 `원본 파일 내려받기 허용`·`웹 회의 녹음 사용`, 저장·실패 문구는 유지한다. 테스트가 쓴다.

### 테스트 (`tests/review-controls/access.spec.ts`)

1. `?view=settings&recording=1`에서 GET이 `{ active_recordings: 2 }`를 돌려주면 "진행 중인 녹음 2건"이 보이고, `웹 회의 녹음 사용` 체크박스의 `aria-describedby`가 녹음 설명을 가리킨다.
2. `readonly=1`이면 건수 조회 요청이 0건이다.
3. 기존 끄기 확인 사례가 그대로 통과한다.

캡처: `docs/verification/recording-ux-2026-09-29/s7-admin-1440.png`.

## 코드 관계와 구조 확인

- Graft(README §4, `{N}=7`): 전후 `graft grep "<ReviewSettingsForm|review-settings"`로 사용처(`app/admin/security/page.tsx`, 실험실)가 같은 props로 동작하는지 확인한다. `graft-s7-before.txt`·`graft-s7-after.txt`.
- Archify: 해당 없음.

## Acceptance Criteria

```powershell
npm run e2e:review-controls
npm run lint
$env:SASU_VERIFY_BUILD='1'; npm run build; git restore next-env.d.ts
npm run test -- --maxWorkers=2 --testTimeout=15000
```

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md §2 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 7을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "설명·aria-describedby 연결, 진행 중 건수 미리 보기, 테스트·캡처·Graft 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `app/api/admin/review-settings/route.ts`와 `admin_set_review_settings` RPC를 바꾸지 마라. 이유: 관리자 권한과 `admin_events` 기록은 서버가 한다.
- 읽기 전용 모드에서 건수 조회나 저장 요청을 보내지 마라. 이유: 읽기 전용 화면은 관리 동작을 하지 않는다.
- 끄기 확인을 없애거나 건수 조회 실패 때 확인 없이 끄게 바꾸지 마라. 이유: ADR-070 결정 8(끄기 전 진행 중 건수 알림).
- 테스트를 지우거나 `skip`하지 마라.
- 검증 빌드 없이 `npm run build`를 돌리지 마라.
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
