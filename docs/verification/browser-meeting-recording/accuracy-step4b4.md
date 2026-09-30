# Step 4-B4 검토 표시·이동 및 로컬 두 창 통합 기록

2026-09-29 · [PRD ACC-01](../../PRD.md) · [상세 설계 §11.2](../../planning/웹회의_녹음_설계.md) · [설계 대조 목록](../../02-design/features/browser-meeting-recording.design.md) · [step 명세](../../../phases/23-browser-meeting-recording/step4b4-attention-review.md)

## 구현

`ReviewDetail`은 `confidence: low`와 `boundary_review`를 경고 아이콘·글자 배지·카드 배경으로 표시한다. `다음 확인 필요 구간`은 본문 검색을 지우고 아직 방문하지 않은 입력칸으로 초점을 옮긴다. 모두 한 번 방문한 뒤 확정 체크박스를 사용할 수 있다. 직접 입력칸에 초점을 둔 방문도 센다. 새 추출 결과로 바꾸면 방문 기록을 초기화한다. 기존 확정 RPC·권한 판정은 그대로다.

## 실행 기록

| 검사 | 결과 |
|---|---|
| UI 브라우저 테스트 TDD 초기 | 새 테스트의 `낮은 신뢰` 배지 기대 실패 |
| `npx playwright test --config playwright.review-controls.config.ts tests/review-controls/recording-segments.spec.ts -g low-confidence` | 구현 후 1개 통과: 배지·검색 해제·두 구간 초점·확정 체크박스 |
| `npm run e2e:review-controls` | Chrome 28개 통과. 기존 원본 재생·다운로드·재추출·녹음 복구 회귀 포함 |
| `npm run test -- --maxWorkers=2 --testTimeout=15000` | 153파일, 1,679개 통과 |
| `npm run lint` | 통과. 문구 검사 차단 0·기존 비차단 경고 79 |
| `npm run build` | Next.js 16.3.4 Turbopack 빌드·TypeScript·정적 페이지 생성 통과 |

0063을 `npx supabase migration up --local`로 **로컬 Supabase에만** 적용했다. `scripts/verify-transcription-product-pair.ts`는 합성 원본 60초+16초를 세션 RPC로 만들고 사용자 세션으로 비공개 Storage에 올린 뒤 실제 `verifyReviewSegment`·`processReviewPart`·Groq를 호출했다. 뒤 창 조기 실행은 `queued`를 유지하고 LLM 호출 0회였다. 앞 창 완료 후 새 job 1건이 생겼고, 두 창 모두 `done`, 자료는 `ready`·마스킹 구간 22개·Groq 호출 2회였다. 마지막 소유 단어 끝은 60.94초·16.48초였다. 검증 자료는 삭제 상태이며 Storage 원본 잔여 0건을 로컬 DB에서 확인했다. 이 스크립트는 전사 문장·키를 출력하지 않는다.

## 구조·남은 범위

- Graft 이전 4-B3 스냅샷은 `ReviewDetail`·`RecordingSegmentPlayer`·`ReviewSection`의 위치를 확인했다. 이후 그래프는 616개 파일·2,933개 노드·7,455개 엣지를 인덱싱했고 `graft check`가 통과했다. `attentionVisited`·`visitNextAttention`는 `ReviewDetail`에만 있다. Graft의 TSX JSX 호출자 인덱스는 비어 있어 실험실 브라우저 경로로 확인했다.
- [Archify 명세](step4b4-review-attention.sequence.json) · [HTML 흐름도](step4b4-review-attention.html): 자료 로드→표시→방문→기존 확정 명령. validate·check·browser-check 모두 pass, 오류·경고 0.
- 로컬 Next 제품 서버 시작 명령이 자동 승인 정책에서 `blocked by policy`로 거절되어, 이번 변경 후 로그인한 **제품 브라우저 E2E는 실행하지 못했다**. 실제 DB·Storage·Groq 서버 경로와 브라우저 화면 경로는 위와 같이 별도로 검증했다. 정책은 구체적인 거절 사유를 더 제공하지 않았다.
- 인용 칩의 원본 위치 이동, 30창 소요 시간, 실제 기기·정량 평가와 제공사/CSP/운영 승인은 후속 게이트다. 운영 DB에는 0063을 적용하지 않았다.
