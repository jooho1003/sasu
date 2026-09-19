# Step 2: shell-nav-mobile

공통 셸(부서 메뉴·관리자 메뉴·사이트 헤더·404·error)의 문구를 사전대로 바꾸고, 모바일 상단 스택을 줄인다. 이 step이 고치는 파일 밖의 문구는 건드리지 않는다.

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §1-5 U1·U7 · §3-1(메뉴 이름) · §4-1
- `docs/wording-guide.md` · `lib/labels.ts`
- `components/workspace-shell.tsx`(메뉴 `entries`, 캡션 "워크스페이스", "☰ 메뉴 접기", 데모 배너, 4단계 진행) · `components/admin/shell.tsx` · `components/site-shell.tsx` · `app/not-found.tsx` · `app/error.tsx` · `app/global-error.tsx` · `app/demo/error.tsx` · `app/demo/d/[dept]/error.tsx` · `app/demo/d/[dept]/loading.tsx` · `app/demo/d/[dept]/layout.tsx`(예고편 CTA)
- `app/globals.css` — 모바일 브레이크포인트와 헤더 관련 클래스
- `docs/verification/plain-language-audit-2026-09-19/dash-390.jpg` — 지금 모바일 스택
- `docs/verification/ux-improvement-2026-09-17/README.md` "모바일 탐색과 긴 목록" — 9/17에 만든 4+더보기 탭. 유지한다

## 작업

### 1. 메뉴·캡션 (사용자 결정 §0-4 확정값 기준)

- `workspace-shell.tsx` `entries`: 대시보드 · 묻기 · **결정 기록** · **올린 자료** · 문서 · **문서 점수표** · 예고편 · **기록 보관** · **설정**. 캡션 "워크스페이스" → "부서 메뉴". `suffix`(URL)는 그대로.
- 모바일 탭(4+더보기)의 라벨도 같은 배열에서 나오는지 확인하고, 아니면 같은 값을 쓰게 한다.
- 데모 배지 "합성 데이터 체험" → "가상 회사 체험". 배너 "합성 자료로 모든 기능을 체험하세요. 변경은 새로고침하면 초기화됩니다." → "가상 회사 자료입니다. 눌러 봐도 실제로는 바뀌지 않고, 새로 고치면 처음으로 돌아갑니다."
- 사이드 카드 "전체 기능 지도 / 확인할 기능과 추천 순서를 한눈에." → "기능 한눈에 보기 / 무엇을 어떤 순서로 보면 좋은지 모았습니다." 링크 "기능 지도로" → "한눈에 보기".
- "게스트 데모 · 로그인 없이 전체 기능 체험" → "로그인 없이 보기 · 모든 기능을 눌러 볼 수 있습니다".
- `admin/shell.tsx`: 개요 → **한눈에**, 수집 채널 → **연결한 채널**. 안내 카드 "권한에 맞는 정보만." → "관리자에게 필요한 정보만 보입니다". 푸터 "조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다"는 **그대로**(절대 문장 규칙).
- `site-shell.tsx`: "게스트 데모" → "로그인 없이 보기". "사용 가이드 (노션, 새 탭)" 유지.

### 2. U1 모바일 상단 스택

- 768px 미만에서 "☰ 메뉴 접기" 버튼을 렌더하지 않는다(탭이 그 역할). 접근성: 데스크톱에서는 유지하고 `aria-expanded`를 붙인다.
- 데모 배너와 4단계 진행을 **한 줄**로 합친다: 왼쪽 "가상 회사 체험", 오른쪽 "2/4 근거 확인"(현재 단계만, 나머지는 `aria-label`로). 데스크톱은 지금처럼 4단계 전부 표시.
- 경로 표시 "영업 사수 / 대시보드"는 모바일에서 뒤 항목만("대시보드").
- 목표: 390×844에서 대시보드 첫 카드("결정 카드")의 상단이 **200px 안**에 보인다. `getBoundingClientRect().top`으로 잰다.

### 3. 404 · error · loading

- `not-found.tsx`: 제목 "이 주소에는 페이지가 없습니다" / 본문 "주소가 바뀌었거나, 지금 계정으로는 볼 수 없는 기록입니다." / 버튼 "처음으로" · "로그인 없이 보기".
- `error.tsx`: 제목 "화면을 불러오지 못했습니다" / 본문 "입력한 내용은 보내지 않았습니다. 잠시 뒤 다시 시도하거나 처음 화면으로 가세요." / 버튼 "다시 시도" · "처음으로".
- `global-error.tsx`: "사수를 열지 못했습니다" / "잠시 뒤 다시 시도해 주세요." (내부 오류 비표시 문장은 유지)
- `demo/error.tsx`·`demo/d/[dept]/error.tsx`: "합성" → "가상", "외부 AI가 호출되지는 않았습니다" → "AI를 부르지도 않았습니다".
- `loading.tsx`: "부서의 기록과 근거를 불러오고 있습니다…" 유지(이미 쉬움).
- `demo/d/[dept]/layout.tsx` 예고편 CTA: "결정이 실제 업무로 이어지는 순간 / 예고편을 열고 신입의 첫 업무를 직접 체험해 보세요." → "결정이 진짜 일이 되는 순간 / 예고편에서 신입의 첫 업무를 직접 해 보세요." 버튼 "예고편 바로 체험" → "예고편 열기".

### 4. E2E 셀렉터

메뉴 텍스트로 잡는 셀렉터(`getByRole("link", { name: "원장" })` 등)를 새 라벨 또는 `data-testid`로 바꾼다. `grep -rn "원장\|세팅\|음성·자료 검토\|문서 평가\|기록 보존" tests/ playwright*.config.ts`.

## Acceptance Criteria

```bash
node scripts/check-wording.mjs components/workspace-shell.tsx components/admin/shell.tsx components/site-shell.tsx app/not-found.tsx app/error.tsx app/global-error.tsx app/demo/error.tsx "app/demo/d/[dept]/error.tsx" "app/demo/d/[dept]/layout.tsx"   # blocking 0
npm run lint && npm run test && npm run build
npx playwright test tests/e2e/guest*.spec.ts   # 게스트 완주
# 실측: 390×844 /demo/d/<영업 부서> 에서 결정 카드 top < 200px — 스크린샷 docs/verification/plain-language-2026-09-XX/dash-390.png
```

## 금지사항

- URL(`suffix`)·라우트 폴더 이름을 바꾸지 마라. 이유: 링크·북마크·E2E·문서가 URL을 참조한다. 이름표만 바꾼다.
- 9/17에 만든 4+더보기 모바일 탭 구조를 바꾸지 마라. 이유: 이미 실측 검증된 탐색이다. 라벨과 상단 스택만 줄인다.
- 다른 step의 파일(`dashboard-s1.tsx` 등)을 고치지 마라. 이유: 같은 파일을 두 step이 고치면 충돌한다. 셸 밖 문구는 step 3~6.
- "조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다"를 바꾸지 마라. 이유: 관리자 권한 경계의 절대 문장 규칙(ADR-044 계열).
