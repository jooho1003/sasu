# Step 5: public-admin-consent

메인·로그인·개인정보 안내·조직 관리자 콘솔·데모 랜딩의 문구를 사전대로 바꾸고, 동의 전문은 **바꾸지 않은 채** 바뀔 경우의 diff 표만 만든다. 이 step은 법적 문구의 경계를 다루므로 판단이 필요한 자리마다 요약에 근거를 적는다.

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §1-5 U6·U7·U8·U10 · §2 "바꾸지 않는 고정 문구" · §3 · §4-8 · §0-6
- `docs/wording-guide.md` · `lib/labels.ts`
- `docs/PRD.md` §7 "금지 서사" · §8-3 법적·윤리 전제 · `docs/ADR.md` ADR-044(관리자 절대 문장)·ADR-057(개인정보 페이지 문구 경계)·ADR-062(지원자 동의)
- 메인·사이트: `app/(site)/page.tsx` · `app/(site)/privacy/page.tsx` · `components/site-cta.tsx`
- 로그인: `app/login/page.tsx`(`LOGIN_ERRORS`) · `app/login/login-form.tsx`
- 동의: `lib/consent.ts`(`CONSENT_SECTIONS`, `CONSENT_VERSION`) · `app/(auth)/consent/page.tsx` · `consent-actions.tsx` · `app/(auth)/d/[dept]/layout.tsx`(미동의 배너)
- 관리자: `app/admin/page.tsx` · `app/admin/members/page.tsx` · `app/admin/sources/page.tsx` · `app/admin/audit/page.tsx` · `app/admin/security/page.tsx` · `app/admin/layout.tsx` · `components/admin/views.tsx` · `components/admin/actions.tsx` · `components/admin/slack-installation.tsx` · `components/admin/notion-installation.tsx` · `components/admin/notion-collection.tsx` · `components/admin/review-settings.tsx` · `lib/org-admin.ts`(`ADMIN_ERROR_MESSAGES` 24개) · `app/api/admin/**/route.ts`
- 데모 랜딩: `app/demo/page.tsx` · `app/demo/features/page.tsx` · `app/demo/admin/page.tsx` · `app/demo/notion/page.tsx` · `components/demo-notion-collection.tsx` · `lib/demo-access.ts`(`DEMO_FEATURES` 12개)
- `docs/verification/plain-language-audit-2026-09-19/text-home.txt`·`text-demo.txt`·`text-privacy.txt`·`text-login.txt`

## 작업

### 1. 메인 (§4-8)

- 히어로·혜택 3종은 이미 쉽다. 바꿀 것: "게스트 모드 실제 화면 · 합성 데이터" → "로그인 없이 보는 실제 화면 · 가상 회사 자료". "가입 없이 바로 체험 · 가상 회사의 합성 데이터" → "가입 없이 바로 · 가상 회사 자료".
- 5단계: 동의부터(유지) · 맥락 수집 → **기록 모으기**("슬랙·회의·문서에서 결정할 일을 찾습니다") · 결정 요청(유지, "담당자에게 원문 근거와 카드를 보냅니다" 유지) · 원장 기록 → **결정 남기기**("결정과 그 이유를 함께 남깁니다" 유지) · 근거로 답변 → **근거를 대며 답하기**("질문한 사람이 볼 수 있는 기록만 근거로 씁니다").
- 신뢰 6항목: "미동의 발언은 저장하지 않음" → "동의 안 한 사람의 말은 저장하지 않음" · "저장 전 개인정보 마스킹" → "저장하기 전에 개인정보를 가림" · "부서와 사용자 권한별 접근" → "부서와 사람마다 볼 수 있는 것이 다름" · "질문자가 볼 수 있는 기록만 인용" → "질문한 사람이 볼 수 있는 기록만 근거로 씀".
- "확인할 근거가 부족할 때는 부족하다고 알려줍니다." 유지. 푸터 "데모의 회사·인물·대화는 모두 합성입니다." → "데모의 회사·사람·대화는 모두 가상입니다."

### 2. 로그인 (U10)

- "비밀번호 없이 로그인할 수 있는 매직링크를 보내드립니다." → "비밀번호 없이 로그인할 수 있는 링크를 메일로 보냅니다." 버튼 "매직링크 받기" → "로그인 링크 받기". "메일함을 확인해주세요" → "메일함을 확인해 주세요".
- 도움말 3줄을 불릿 3개, 각 한 문장: "회사에서 초대받은 이메일을 쓰세요." / "메일이 안 오면 스팸함을 보고, 다시 받기를 누르세요." / "로그인했는데 부서가 안 보이면 팀장에게 초대를 부탁하세요."
- `LOGIN_ERRORS`: "로그인 링크를 확인하지 못했습니다. 링크가 만료되었을 수 있으니 새 링크를 요청해주세요." → "로그인 링크가 더는 쓸 수 없는 상태입니다. 새 링크를 받아 주세요." / "로그인은 확인했지만 부서 멤버십을 조회하지 못했습니다." → "로그인은 됐지만 부서를 찾지 못했습니다. 잠시 뒤 다시 시도해 주세요."

### 3. 개인정보 안내 (U8) — 본문은 바꾸지 않는다

- 제목 아래 **"쉬운 요약"** 상자를 추가한다. 5줄, 각 한 문장: 무엇을 모으나("동의한 사람의 슬랙 대화·회의·문서와 로그인 이메일") / 왜("결정할 일을 찾고, 결정을 남기고, 물으면 근거를 대며 답하려고") / 누가 보나("같은 부서에서 볼 수 있게 허용된 사람만") / 언제 지우나("파일럿이 끝나거나 요청하면") / 거부하면("동의하지 않아도 불이익이 없고, 내 말은 저장되지 않습니다"). 상자 끝에 "자세한 내용은 아래 본문을 따릅니다."
- 본문 6개 절은 **한 글자도 바꾸지 않는다**. 대신 RLS·정규식·임베딩·ZDR·옵트아웃이 나오는 문장에 쉬운 말을 **앞에** 병기한 형태로만 고칠 수 있는지 요약에 제안하고, 적용은 하지 않는다(`allow_in` 파일이라 검사기는 통과한다).
- "법률 검토 전 초안" 표시 유지.

### 4. 동의 전문 — diff 표만

- `lib/consent.ts`의 `CONSENT_SECTIONS` 본문을 사전대로 바꾸면 어떻게 되는지 `docs/verification/plain-language-audit-2026-09-19/consent-diff.md`에 **항목별 원문 | 제안문 | 뜻이 바뀌는가(예/아니오, 이유)** 표로 만든다. 코드는 바꾸지 않는다. `CONSENT_VERSION`도 올리지 않는다.
- 첫 로그인 동의 화면(`consent/page.tsx`)의 버튼·안내(전문 밖)는 바꾼다: "동의합니다" 유지, "나중에" 유지, 미동의 배너 문구를 W6로.

### 5. 조직 관리자 (§4-8)

- 헤딩: "조직 개요 / 부서별 멤버, 연결된 자료와 의사결정 현황을 한눈에 확인하세요." → "한눈에 / 부서마다 멤버·연결한 자료·결정 현황을 봅니다." "권한에 맞는 정보만." → "관리자에게 필요한 정보만 보입니다."(step 2가 셸을 고쳤으면 중복 확인).
- 표 헤더·라벨: "30일 결정 / 30일 질문" 유지. "마지막 동기화" → "마지막으로 가져온 시각". "동의" 유지. "이번 달 AI 호출 수" → "이번 달 AI를 부른 횟수". "조직 공개 허용 켜짐" → "예고편 공개 허용 켜짐".
- `ADMIN_ERROR_MESSAGES` 24개를 W6 두 문장으로 다시 쓴다. 예: `already_lead` "이미 부서장인 멤버입니다." → "이미 팀장입니다. 다른 멤버를 고르세요." / `last_lead` "부서에는 최소 한 명의 부서장이 필요합니다." → "팀장은 한 명은 있어야 합니다. 먼저 다른 팀장을 정하세요."
- 슬랙·노션 설치: "Slack 워크스페이스" → "슬랙 워크스페이스"(예외 허용어), "조직에 워크스페이스 하나를 연결합니다." → "회사의 슬랙 하나를 연결합니다." "내부 통합 토큰" → "노션 연결 키(내부 통합 토큰)". "최상위 범위 매핑" → "어느 페이지 아래를 모을지".
- `admin/security`: "자료 보호" 유지. "원본 접근 설정" → "원본을 누가 열 수 있나". "접근 허가 기록" → "열어 본 기록".
- 절대 문장 "조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다" 유지. "위반 0건" 같은 판정 값을 새로 만들지 않는다.

### 6. 데모 랜딩·기능 한눈에 (U6)

- `lib/demo-access.ts` `DEMO_FEATURES` 12개의 `title`·`description`을 §3-1로: 분류 대시보드 → 대시보드("슬랙·회의·문서 기록을 결정·할 일·정보로 나눠 보여 줍니다") · 지금 결정 카드("마감·제안·원문 근거·예전 결정과 다른 점을 보고 직접 눌러 봅니다") · 결정 원장 → 결정 기록("결정과 이유, 고친 기록을 지우지 않고 쌓습니다") · 권한 인지 묻기 → 묻기("내가 볼 수 있는 기록만 근거로 답합니다. 근거가 없으면 답하지 않습니다") · 음성·자료 검토 → 올린 자료("올리기, 동의 확인, 글로 바꾸기, 근거로 확정까지") · 문서 어시스턴트 → 문서 정리 · 문서 평가 → 문서 점수표("부서 기준표로 매긴 점수와 근거 없음 표시") · 기록 보존 → 기록 보관 · 부서 세팅 → 부서 설정 · Notion 자동 수집 → 노션 자동 가져오기 · 조직 관리("부서·멤버·채널·답변 수를 내용은 보지 않고 확인") · 채용 예고편.
- 부제 "팀원 · 시드 결과 확인" / "부서장 · 안전 체험" → "팀원이 보는 화면 · 보기만" / "팀장이 보는 화면 · 눌러 볼 수 있음". 랜딩 상단에 한 줄 설명: "'눌러 볼 수 있음'은 눌러도 실제로는 아무것도 바뀌지 않는다는 뜻입니다."
- "5분 셀프 시연 / 전체 기능을 순서대로 확인하세요" → "5분이면 다 봅니다 / 기능을 순서대로 보세요". "앞의 네 기능이 핵심 이야기입니다." 유지. "추천 시연 시작" → "추천 순서로 시작".
- "다섯 팀의 신입 미션을 체험하세요" 유지. "합성 자료 전용이며 서버에 제출하지 않습니다." → "가상 자료만 쓰고, 서버에는 보내지 않습니다."
- "추천 · 풍부한 영업 기록" → "추천 · 기록이 가장 많은 부서". "핵심 데모 시작" → "여기서 시작". "다른 사례 / 이 부서 둘러보기" 유지.
- 부서 소개(7종): "권한·멱등성·동시성의 결정 근거를 확인합니다." → "같은 요청이 두 번 와도 한 번만 처리하는 기준처럼, 개발 결정의 근거를 봅니다." "채용·온보딩의 기준과 담당자를 확인합니다." → "채용과 첫 안내의 기준과 담당자를 봅니다."
- `demo/features`: "전체 기능 지도" → "기능 한눈에 보기". 4단계 "기록 수집 → 분류와 근거 확인 → 판단과 기록 → 기록 활용" → "기록 모으기 → 나누고 근거 보기 → 정하고 남기기 → 기록 쓰기".
- 심사 계정 배너 "심사위원 데모 계정 · 자동 연결 완료", "영속 저장 없음" → "저장하지 않음". "외부 발신 없음" → "밖으로 보내지 않음".

## Acceptance Criteria

```bash
node scripts/check-wording.mjs "app/(site)/page.tsx" components/site-cta.tsx app/login/page.tsx app/login/login-form.tsx "app/(auth)/consent/page.tsx" "app/(auth)/consent/consent-actions.tsx" app/admin lib/org-admin.ts components/admin app/demo/page.tsx app/demo/features/page.tsx app/demo/admin/page.tsx app/demo/notion/page.tsx components/demo-notion-collection.tsx lib/demo-access.ts   # blocking 0 (privacy·consent.ts는 allow_in)
git diff --stat lib/consent.ts   # 변경 0
grep -n "쉬운 요약" "app/(site)/privacy/page.tsx"
test -f docs/verification/plain-language-audit-2026-09-19/consent-diff.md
npm run lint && npm run test && npm run build
npm run check:demo-release   # /demo 링크·200 유지
```

## 금지사항

- `lib/consent.ts`의 `CONSENT_SECTIONS` 본문과 `CONSENT_VERSION`을 바꾸지 마라. 이유: 동의 문구가 바뀌면 재동의가 필요한지 법률 확인이 먼저다(ADR-065 결정 5). diff 표만.
- 개인정보 안내 본문 6개 절을 바꾸지 마라. 이유: ADR-057 — 확인되지 않은 보호를 약속하지 않도록 문구를 잡아 둔 상태다. 쉬운 요약만 얹는다.
- "조직 관리자 권한만으로는 부서 내용을 볼 수 없습니다"를 바꾸거나, "위반 0건" 같은 판정 문구를 만들지 마라. 이유: 관리자 권한 경계 규칙(ADR-044 계열).
- 메인에 "감시·대체·평가", "적합도", "AI가 거른다", 경쟁사 이름을 넣지 마라. 이유: PRD §7 금지 서사·ADR-041 카피 금지선.
- `DEMO_FEATURES`의 `key`·`href`·`mode`·`audience` 값을 바꾸지 마라. 이유: `safeDemoDestination` 화이트리스트와 `check:demo-release`가 이 값을 본다. `title`·`description`만.
