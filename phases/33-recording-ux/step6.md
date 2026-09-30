# Step 6: review-detail-notices

검토 화면에서 녹음 자료의 경고와 이어진 기록 표시를 정리한다.

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/docs/02-design/features/recording-ux.design.md` (bkit 설계 — §5.3·§5.4·§8에서 `S6`으로 표시한 항목)
- `/docs/ARCHITECTURE.md` §6-5 웹 회의 녹음 · §8 테스트 경계
- `/docs/PRD.md` §3-4 REC-04 · §7 디자인 가이드
- `docs/planning/웹회의_녹음_설계.md` §11.1(클리핑 5% → "입력이 과했습니다") · §12(30분 초과 회의의 이어서 녹음, 앞뒤 기록 이동)
- `/docs/wording-guide.md`
- `docs/verification/recording-ux-2026-09-29/README.md` §1(U18·U19)·§4
- `components/review-detail.tsx`(:330-360 머리글과 이어진 기록, :464-504 보관된 원본), `app/globals.css`의 `.review-notice`·`.review-workspace` 규칙
- `components/meeting-recorder.tsx`·`app/globals.css`에서 step 2가 만든 알림 tone 클래스(`recorder-notice is-warning` 등)
- `tests/review-controls/recording-segments.spec.ts`(검토 화면 픽스처), `scripts/review-controls-lab/main.tsx`

## 작업

`components/review-detail.tsx`와 `app/globals.css`만 고친다(테스트 제외).

1. **입력 과다 경고(U18)**: `clippingRatio > 0.05`일 때의 "입력이 과했습니다. 원본을 들으며 받아쓴 글을 확인해 주세요."를 경고 모양으로 바꾼다. step 2의 경고 tone과 같은 색 규칙을 쓰되, 클래스는 검토 화면 범위(`review-warning` 등)에 둔다. 페이지를 열 때부터 있는 안내이므로 live region(`role="status"`)을 쓰지 않는다. 문구는 유지한다.
2. **이어진 회의 기록(U19)**: 별도 `panel`을 없앤다. 머리글 바로 아래 한 줄짜리 이동 줄(`<nav aria-label="이어진 회의 기록">`)로 바꾼다. 왼쪽 `← 이전 기록 · {제목}`, 오른쪽 `다음 기록 · {제목} →`, 녹음자·스위치 조건이 맞고 다음 기록이 없으면 `이 회의 이어서 녹음`. 표시 조건은 지금과 같다(`audio_segments`이고 이전·다음·이어서 녹음 중 하나라도 있을 때). 링크 대상과 글자(`이전 기록 · `, `다음 기록 · `, `이 회의 이어서 녹음`)는 유지한다. 390px에서는 줄바꿈해도 된다.

### 테스트 (`tests/review-controls/recording-segments.spec.ts`)

1. 픽스처에 `capture_metadata`의 클리핑 비율 0.1을 넣으면(검토 화면이 실제로 읽는 필드명을 코드에서 확인해 맞춘다) 경고 문구가 경고 클래스를 가진 요소 안에 있고 `role="status"`가 아니다. 0.01이면 보이지 않는다.
2. 이어진 기록 픽스처(`continuation: { previous: {id,title}, next: null }`, `can_continue: true`)에서 `nav[aria-label="이어진 회의 기록"]` 안에 `이전 기록 · …`과 `이 회의 이어서 녹음`이 있고, `section[aria-label="이어진 회의 기록"]`은 없다.

캡처: `docs/verification/recording-ux-2026-09-29/s6-review-detail-1440.png`, `s6-review-detail-390.png`.

## 코드 관계와 구조 확인

- Graft(README §4, `{N}=6`): 전후 `graft grep "입력이 과했습니다|이어진 회의 기록|review-notice"`로 같은 문구·클래스를 쓰는 다른 화면(`retention-console.tsx` 등)이 바뀌지 않았는지 확인한다. `graft-s6-before.txt`·`graft-s6-after.txt`.
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
3. 결과에 따라 `phases/33-recording-ux/index.json`의 step 6을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "입력 과다 경고 클래스, 이어진 기록 nav 전환, 테스트·캡처·Graft 경로"`
   - 수정 3회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

## 금지사항

- `.review-notice`의 전역 모양을 바꾸지 마라. 이유: 확정 안내·재추출 안내·보존 콘솔도 쓴다. 새 클래스를 더한다.
- 이어서 녹음 표시 조건(`can_continue`)을 화면에서 새로 계산하지 마라. 이유: 서버가 녹음자·팀장·동의·스위치로 판정해 준다(`reviews/[id]/route.ts:116-117`).
- `ReviewDetail`의 저장·확정·버전 충돌·재추출 로직을 바꾸지 마라. 이유: 기존 단일 파일 자료도 같은 컴포넌트를 쓴다(phase 23 step2 명세).
- 테스트를 지우거나 `skip`하지 마라.
- 검증 빌드 없이 `npm run build`를 돌리지 마라.
- 기존 테스트를 깨뜨리지 마라.
- 사용자 요청 경로에서 service role 클라이언트를 쓰지 마라. 이유: 필터 누락 한 줄이 유출이다.
- Groq·Anthropic SDK를 `lib/llm.ts` 밖에서 부르지 마라.
