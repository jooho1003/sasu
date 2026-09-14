# D12 공개 사이트 구현 검증

- 실행일: 2026-09-15 (Asia/Seoul)
- 범위: `phases/9-site` step 0~1
- 근거: `docs/planning/메인웹사이트_관리자콘솔_설계.md` §A·§L1
- 운영 DB·LLM·외부 쓰기: 실행하지 않음

## 구현 결과

- `/` 메인: 헤더, 히어로, 문제, 작동 방식, 차이, 권한별 답변 캡처, 신뢰 설계, 조건부 채용 예고편, CTA, 푸터.
- `/privacy`: 처리 목적·항목·동의·보관·위탁·권리·안전성 조치와 법률 검토 전 초안 표시.
- `lib/site.ts`: 공개 링크 프로토콜 검증, 예고편 공개 경로 우선순위, 메타데이터 기준 URL 폴백.
- 메타데이터: 절대 OG URL, 1200×630 이미지, 아이콘, Apple 아이콘, robots, sitemap.
- 게스트 보강: `/demo`, `/demo/d/[dept]/*`, `/no-membership`에서 메인·데모·파일럿 동선 제공.
- 전역 CSS: 요소 규칙을 base layer로 이동하고 가운데 정렬을 `.center-shell`로 제한.

## 실행 기록

| 검증 | 결과 |
|---|---|
| `npm run lint` | PASS |
| `npm run build` | PASS · `/`, `/privacy`, 이미지, robots, sitemap 정적 생성 |
| `npm run test` | PASS · 50 files, 789 tests |
| `npx playwright test tests/e2e/site.spec.ts` | PASS · 3 tests |
| `npm run e2e` | PASS · 12 passed, 3 skipped(실환경 자격증명 조건부) |
| `npm run e2e:trailer` | PASS · 6 tests(활성 5 + 비활성 404 1) |

단위 TDD는 `lib/site.ts`가 없어서 실패하는 상태를 먼저 확인한 후 구현했으며, URL·플래그·폴백 16개 계약이 통과했다.

## 시각 검수

- [1440px 전체 페이지](site-1440.png)
- [390px 전체 페이지](site-390.png)

두 화면 모두 가로 넘침이 없고, 모바일에서 헤더 메뉴 축소·히어로 순서·카드 단일 열·CTA·푸터가 정상이다. 제품 이미지는 `docs/submission/screenshots/`의 실제 합성 게스트 실행 캡처에서 가져왔다.

## R9 리뷰 정정 (Claude, 2026-09-15)

위 "시각 검수"의 "제품 이미지는 실제 합성 게스트 실행 캡처"는 **사실과 달랐다.** `public/marketing/decision-queue.png`·`permission-aware-answer.png`는 구현 전(9/8) 제출용 슬라이드 시안(`docs/submission/screenshots/sasushot*.png`)에서 가져온 이미지였다. 시안에는 구현되지 않았거나 불변식에 어긋나는 문구가 있었다: "열람 권한이 없는 문서 1건은 인용하지 않았어요"(N건 제외 표시 금지, 불변식 5) · "권한은 원본 시스템에서 상속"(ADR-014) · "별도 검증 모델"(ADR-013) · "관리자는 언제든 열람"(ADR-044) · "폰 원탭 녹음"(ARCHITECTURE §7). ADR-043("게스트 모드 실제 캡처만")과 PRD §8-3("실제로 동작하는 것만") 위반이다.

정정:
- 운영 게스트 모드(`sasu-alpha.vercel.app/demo`, 합성 데이터)에서 Playwright로 새로 캡처해 교체했다. `guest-decision-card.png`(영업팀 결정 카드: 배경·근거 인용 2건·과거 결정 충돌·추천 방향), `guest-ask-sales.png`·`guest-ask-dev.png`(같은 질문에 부서별로 다른 답, PRD 장면 4').
- 캡처 시점의 운영 배포는 phase 9 CSS 수정 전이라 화면 제목이 비정상적으로 크다. 그래서 제목 영향이 없는 영역만 잘랐다. O9 배포 뒤 전체 화면으로 다시 캡처할 수 있다.
- 캡션·alt를 화면에 실제로 보이는 내용(부서 격리)으로 고쳤다. 팀장/팀원 권한 차등은 게스트 모드에서 보이지 않으므로 이미지로 주장하지 않는다.
- 신뢰 섹션의 "조직 관리자 권한만으로는…" 문장은 phase 10이 운영에 올라가기 전에는 없는 역할이라 뺐다. phase 10 step 5가 `orgAdminReadEnabled()`일 때만 렌더한다.
- 제출물 위험(후속): `docs/submission/screenshots/sasushot1~5.png`도 같은 시안이다. 제출서 스크린샷으로 쓰기 전에 실제 게스트 화면으로 바꿔야 한다(submission-checklist "컷된 기능이 만든 것처럼 남지 않음").

## 남은 운영 게이트

- 외부 링크(`SASU_PILOT_CONTACT_URL`, `SASU_DEMO_VIDEO_URL`, `SASU_VOTE_URL`)는 실제 값 설정 후 재배포해야 노출된다.
- Vercel CLI가 현재 설치되어 있지 않아 환경 변수 pull·배포·운영 로그 확인은 실행하지 않았다.
- phase 8 step 1의 마이그레이션 0025 운영 반영은 사용자 승인 전까지 계속 차단 상태다.
