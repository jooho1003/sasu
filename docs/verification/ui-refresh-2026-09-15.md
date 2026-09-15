# UI/UX 개선 실행 기록 — 2026-09-15

기준: 사용자 요청, PRD §3·§5·§7·§8, ADR-048, `phases/13-ui-refresh/step0.md`.

## 변경

- 메인: 중앙 메시지, 실제 합성 시드의 원문을 이용한 제품 미리보기, 간결한 CTA와 기능 설명.
- 데모 입구: 부서별 체험 내용, 세 단계 안내, 부서 선택 카드.
- 공통 디자인: Noto Sans KR, 밝은 중성 배경, 녹색 브랜드, 얇은 경계선, 공통 버튼·포커스 표시·동작 줄이기 설정 대응.
- 부서 탐색: 로그인·게스트 공통 사이드바, 현재 위치 표시, 모바일 가로 메뉴, 본문 건너뛰기.
- 데모 대시보드: 결정 카드를 기록보다 먼저 배치. 기록은 분류 선택 후 원문 펼치기.
- Q&A: 준비된 질문 선택, 답변·인용·범용 답 비교. 모바일 질문 목록은 가로 스크롤. 근거 없는 사수 답변은 표시하지 않음.
- 원장·카드·로그인·문서·역할·세팅: 공통 여백·서체·패널. 중복 메뉴 정리. 세팅 로딩 중 제목과 진행 안내 제공.

디자인 참고: [Lindy](https://www.lindy.ai/), [Apple Mac](https://www.apple.com/kr/mac/). 테마 구현 참고: [Tailwind CSS dark mode](https://tailwindcss.com/docs/dark-mode).

## 최종 실행 결과

| 검사 | 결과 |
| --- | --- |
| `npm run lint` | 통과 |
| `npm run build` | 통과 — Next.js 16.3.4 프로덕션 빌드·TypeScript·정적 페이지 25개 생성 |
| `npm run test` | 67개 파일, 910개 테스트 통과 |
| 공개 사이트·게스트·부서별 완주·UI E2E | 16개 통과, 45.7초 |
| `git diff --check` | 통과 |

E2E는 최종 프로덕션 빌드를 `next start --port 3001`로 실행한 뒤 수행했다.

```powershell
$env:E2E_BASE_URL = 'http://localhost:3001'
npx playwright test tests/e2e/site.spec.ts tests/e2e/guest.spec.ts tests/e2e/team-coverage.spec.ts tests/e2e/ui-refresh.spec.ts --reporter=line
```

### 확인한 동선

- 1440px·390px에서 메인 → 데모 → 카드 → 원장 → 묻기 → 로그인.
- 영업·개발·기획·디자인 부서의 카드와 인용된 답변.
- 분류 선택 시 기록 변경, 원문 펼치기, 준비된 모든 질문 선택 시 해당 제목과 인용 표시.
- 현재 메뉴의 `aria-current`, 모바일 메뉴로 로그인 접근, 주요 화면 가로 넘침 없음.
- 기존 QA 시드 계정으로 대시보드·묻기·원장·문서·역할·세팅 읽기 화면을 두 해상도에서 확인. 업무 데이터 쓰기 요청 및 브라우저 실행 오류 0건.
- 게스트 열람 전후 `llm_calls`·`jobs`·`items`·`answers`·`decisions`·`citations` 행 수 동일. 비데모 부서 접근 404, 잘못된 슬랙·워커 인증 거부 확인.

첫 E2E에서는 모바일 세팅의 외부 채널 조회가 기본 5초 대기시간을 넘겨 1건 실패했다. 로딩 중에도 제목과 상태가 보이도록 개선하고, 해당 검사는 실제 세팅 제목이 표시될 때까지 최대 30초 기다리도록 변경했다. 최종 재실행은 건너뛴 항목 없이 16개 모두 통과했다.

## 스크린샷

모두 최종 프로덕션 빌드에서 자동 캡처한 합성 데모 또는 공개 화면이다.

| 화면 | 데스크톱 | 모바일 |
| --- | --- | --- |
| 메인 | [1440px](ui-refresh-2026-09-15/home-1440.png) | [390px](ui-refresh-2026-09-15/home-390.png) |
| 데모 입구 | [1440px](ui-refresh-2026-09-15/demo-1440.png) | [390px](ui-refresh-2026-09-15/demo-390.png) |
| 대시보드 | [1440px](ui-refresh-2026-09-15/dashboard-1440.png) | [390px](ui-refresh-2026-09-15/dashboard-390.png) |
| 결정 카드 | [1440px](ui-refresh-2026-09-15/card-1440.png) | [390px](ui-refresh-2026-09-15/card-390.png) |
| 원장 | [1440px](ui-refresh-2026-09-15/ledger-1440.png) | [390px](ui-refresh-2026-09-15/ledger-390.png) |
| 묻기 | [1440px](ui-refresh-2026-09-15/ask-1440.png) | [390px](ui-refresh-2026-09-15/ask-390.png) |
| 로그인 | [1440px](ui-refresh-2026-09-15/login-1440.png) | [390px](ui-refresh-2026-09-15/login-390.png) |

## 범위와 상태

API·워커·DB 마이그레이션·권한 판정은 변경하지 않았다. 운영 배포·커밋·푸시는 수행하지 않았다. 조직 관리·채용 예고편의 기능 플래그는 유지했으며, 해당 기능의 전체 운영 쓰기 흐름은 이번 E2E 범위에 포함하지 않았다. 자동 다크 테마는 ADR-048에 따라 밝은 테마로 통일했다.

개발 모드에서 기존 Turbopack 캐시 복원 오류가 발생하여 개발 화면 확인에는 webpack을 사용했다. 최종 `npm run build`는 기본 Turbopack으로 정상 완료했다.
