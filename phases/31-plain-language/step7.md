# Step 7: verification

설계 §7의 검증을 전부 실행해 기록하고, 검사기를 `npm run lint` 체인에 넣는다. 완료되면 이 phase는 **blocked**로 멈춘다 — 운영 반영·제출 스크린샷 교체·노션 가이드 갱신은 사람이 판정한다.

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §7 · §8 · §0-7·§0-8
- `docs/PRD.md` §3-7 PL-08 · §11 완료 판정
- `docs/verification/ux-improvement-2026-09-17/README.md` — 검증 기록 형식(결과 요약·구현한 개선·검증한 유저 플로우·증거 링크)
- `docs/verification/plain-language-audit-2026-09-19/` — 기준선(baseline.txt·text-*.txt·스크린샷)
- `scripts/check-demo-release.mjs` · `playwright.config.ts` · `tests/e2e/**`
- step 0~6의 완료 요약

## 작업

### 1. 검사기 편입 (§0-7)

- `package.json`: `"lint": "eslint . && node scripts/check-wording.mjs"`. `Stop` 훅이 lint → build → test 순으로 돈다(`scripts/hooks/`)는 것을 확인하고, 훅 파일은 고치지 않는다.
- `npm run lint`가 0으로 끝나야 한다. 남은 `blocking` 위반은 **그 파일을 맡은 step의 규칙대로** 고친다(사전 추가가 필요하면 `terms.json`과 `docs/wording-guide.md`를 같이 고치고 요약에 적는다).
- `--report`의 경고(`length`·`style_mix`·`button_noun`) 건수를 기준선(`baseline.txt`)과 비교해 표로 남긴다. 경고는 0이 아니어도 된다. 남은 것은 파일:줄 목록으로.

### 2. 자동 검증

```bash
npm run check:wording          # blocking 0
npx tsc --noEmit
npm run lint && npm run test && npm run build
npm run test:rls
npm run e2e && npm run e2e:trailer && npm run e2e:review-controls
npm run check:demo-release
npm run audit:showcase
```

전부 통과 로그를 `docs/verification/plain-language-2026-09-XX/commands.md`에 명령·종료 코드·핵심 줄만 남긴다.

### 3. 화면 실측

- `SASU_VERIFY_BUILD=1`로 `.next-verify`에 빌드 → 3100 포트 `next start`(기존 서버는 내렸다 다시 띄운다. `next-env.d.ts` 변경은 복원). `app/demo/d/[dept]/loading.tsx` 때문에 `fetch()`로는 스트리밍 셸만 보이므로 **반드시 실제 브라우저(Playwright)**로 연다.
- 1440×900·390×844에서: `/` · `/demo` · `/demo/features` · 영업 부서 대시보드·카드·결정 기록·묻기 · 개발 부서 올린 자료·문서·문서 점수표 · 기록 보관 · 설정 · `/demo/admin` · `/demo/hiring` · 예고편 · `/login` · `/privacy` · 없는 주소(404). 각 화면의 `document.body.innerText`를 `text-<화면>.txt`로 저장하고 `node scripts/check-wording.mjs --text`로 훑는다(렌더된 텍스트에서도 금지어 0).
- U1: 390에서 대시보드 결정 카드 `getBoundingClientRect().top < 200`. U3: 결정 기록 근거 후보가 접혀 있고 펼친 출처 1개, 중복 문장 0. U5: 문서 점수표 첫 문장에 수식 없음. U9: 설정 체크박스 글자 크기 = 본문. U11: 배지 가운뎃점 2개 이하.
- 스크린샷은 기준선과 같은 이름(`dash-390.jpg` 등)으로 저장해 전후 비교가 되게 한다.

### 4. 사람 읽기 테스트 (사용자 몫 — 준비만)

- `docs/verification/plain-language-2026-09-XX/reading-test.md`에 절차를 적는다: 개발자가 아닌 1명(가능하면 중학생)에게 `/demo` → 추천 순서 4단계를 **설명 없이** 시키고, 멈추거나 되묻는 말을 그대로 적는다. 5분. 결과 칸은 비워 둔다.

### 5. 기록

`docs/verification/plain-language-2026-09-XX/README.md`: 결과 요약(한 줄) · 기준선 대비 표(blocking·경고·영문 노출·호칭 혼용·문체 혼용 건수 전후) · 화면별 전후 스크린샷 링크 · 실행한 명령 · 남은 경고 목록 · 사용자 판단 대기 항목(운영 반영 시점, 제출 스크린샷 5장 재캡처, README 썸네일 라벨, 노션 가이드 용어, 동의 문구 법률 확인).

`phases/31-plain-language/index.json`의 step 7을 `blocked`로 두고 `note`에 대기 항목을 적는다. `phases/index.json`의 이 phase도 `blocked`.

## Acceptance Criteria

```bash
npm run lint   # eslint + check-wording 둘 다 0
npm run test && npm run build && npm run e2e
ls docs/verification/plain-language-2026-09-*/   # README.md commands.md reading-test.md text-*.txt *-1440.jpg *-390.jpg
grep -c "blocking" docs/verification/plain-language-2026-09-*/README.md
```

## 금지사항

- 운영에 배포하거나 `vercel promote`·`db push`를 하지 마라. 이유: 설계 §0-8 — 운영 반영은 제출 뒤 사용자 승인. 이 step은 검증 서버(3100)까지다.
- 제출 스크린샷(`docs/submission/screenshots/`)·README 썸네일·노션 가이드를 바꾸지 마라. 이유: 제출본은 그대로 두고, 교체 여부는 사람이 판정한다. 대기 항목으로만 적는다.
- 남은 경고를 없애려고 검사기의 기준(60자·문체 감지)을 느슨하게 만들지 마라. 이유: 기준은 설계 §2가 원본이다. 경고는 남겨도 되고, 바꾸려면 설계 문서부터.
- 렌더된 텍스트 파일(`text-*.txt`)에 로그인 세션의 실데이터를 넣지 마라. 이유: 검증은 가상 회사 데모만. 로그인 화면은 소스 기준으로 검사한다.
- 훅 스크립트(`scripts/hooks/*.sh`)를 고치지 마라. 이유: `npm run lint` 안에 검사기를 넣으면 훅은 자동으로 같이 돈다.
