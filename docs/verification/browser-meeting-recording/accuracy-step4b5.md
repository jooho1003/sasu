# Phase 23 · step 4-B5 인용 위치 실행 기록

2026-09-29. 기준: PRD §3-4 ACC-01·§8, 상세 설계 §11.2, [PDCA 설계 대조 목록](../../02-design/features/browser-meeting-recording.design.md#4-b5-인용-위치-대조-목록), [step 명세](../../../phases/23-browser-meeting-recording/step4b5-citation-location.md).

## 결과와 설계 대조

| 설계 항목 | 구현·근거 | 판정 |
|---|---|---|
| 발행 항목→검토 구간 | `lib/recording/citation-location.ts`: SQL `publish_review`의 2,400 유니코드 문자 청크와 공백 청크 건너뛰기를 순번에 맞춤. 수정된 revision·삭제된 원본·문서는 대상에서 제외 | 구현·단위 통과 |
| 권한 인지 인용 링크 | 답변·문서·카드·원장 요청 모두 세션 클라이언트의 `reviewed_materials` SELECT를 사용. RLS가 숨기면 기존 원문 링크. 원문 quote 문자열 포함도 확인 | route 단위 통과 |
| 구간 이동·재생 | 검토 화면의 `?section=N`은 지정 구간으로 스크롤하고 해당 시각 재생 버튼에 초점. 버튼 클릭 뒤 기존 원본 접근 API가 단회 허가를 판정 | 브라우저 실험실 통과 |
| 낮은 신뢰·경계 표시 | 이동 가능한 녹음 인용에만 배지 추가 | 단위·빌드 통과 |

## 실제 실행

- 먼저 `tests/recording/citation-location.test.ts`를 작성하고 모듈 부재로 실패하는 것을 확인했다. 구현 뒤 신규 단위·route 검증(`citation-location`, 답변, 문서, 카드, 원장) 통과.
- `npx playwright test -c playwright.review-controls.config.ts tests/review-controls/recording-segments.spec.ts --grep 'citation link focuses'`: 1/1 통과. `/?section=1`에서 두 번째 구간의 `1:01부터 듣기`가 초점이고, 클릭 전 원본 요청은 0건.
- `npm run test`: 156개 파일, 1,688개 테스트 통과. `npm run lint`: 종료 0, 기존 문구 경고 79개·차단 0. `npm run build`: Next 16.3.4 빌드·TypeScript·페이지 생성 종료 0.
- Graft 변경 전 그래프는 `itemHref`의 답변 GET 호출과 `ReviewDetail` 위치를 확인했다. 변경 후 617개 파일·2,941개 노드·7,470개 엣지로 인덱싱했고 `graft check` 통과. `reviewCitationTarget` 호출자 4곳(답변·문서·카드·원장)을 확인했다. 그래프는 컨테이너 `/work/sasu-b5-after-graph`.
- [Archify 명세](step4b5-citation-location.sequence.json) · [흐름도](step4b5-citation-location.html) · [브라우저 검사 영수증](step4b5-final-check/step4b5-citation-location.browser-check.json): validate·check·browser-check 통과. 검증 중 흐름도 수정 후 기존 영수증 경로 충돌이 생겨 최종 영수증을 별도 디렉터리에 기록했다.

## 남은 범위

제품 Next 서버를 띄우는 명령이 앞선 4-B4 검증에서 자동 승인 정책에 의해 `blocked by policy`로 거절됐다. 같은 서버를 다른 방식으로 시작하지 않았으므로 로그인한 제품 브라우저에서 카드·원장·답변·문서 전체 이동은 이번에 실측하지 못했다. API는 세션 클라이언트 모의 테스트, 검토 화면은 Vite 브라우저 실험실로 각각 검증했다. 원본 재생 권한은 기존 `/original` 경로가 계속 판정한다. 실제 기기·정량 평가·운영 적용 게이트도 Phase 23 전체에서 남아 있다.
