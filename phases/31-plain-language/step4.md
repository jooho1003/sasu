# Step 4: lead-screens

팀장 화면(올린 자료·문서 정리·문서 점수표·기록 보관·설정)과 예고편·초대·채용 미션의 문구를 사전대로 바꾸고 U5·U9·U11을 고친다. `lead` 호칭을 §0-3 확정값으로 통일한다.

## 읽어야 할 파일

- `docs/planning/쉬운말_문구_UIUX_설계.md` §1-3(호칭) · §1-5 U5·U9·U11 · §3 · §4-6·§4-7 · §0-3·§0-6
- `docs/wording-guide.md` · `lib/labels.ts`
- 올린 자료: `components/reviewed-materials.tsx` · `components/review-detail.tsx` · `app/(auth)/d/[dept]/reviews/page.tsx` · `app/demo/d/[dept]/reviews/page.tsx` · `components/demo-safe-actions.tsx`(자료 검토 부분만 — 카드·원장 부분은 step 3이 고쳤다)
- 문서: `components/document-assistant.tsx` · `app/demo/d/[dept]/documents/page.tsx`
- 점수표: `components/agent-roles.tsx` · `app/demo/d/[dept]/roles/page.tsx` · `components/trailers/attempt-scores.tsx`
- 기록 보관: `components/retention-console.tsx` · `app/(auth)/d/[dept]/retention/page.tsx` · `components/demo-settings.tsx`
- 설정: `components/settings-s5.tsx`(1249줄 — 문구만) · `components/notion-source-list.tsx` · `app/demo/d/[dept]/settings/page.tsx` · `components/admin/lead-invites.tsx` · `components/admin/invite-acceptance.tsx` · `app/invite/[token]/page.tsx` · `app/no-membership/page.tsx`
- 예고편·초대·미션: `components/trailers/forms.tsx` · `components/trailers/views.tsx` · `components/trailers/invites.tsx` · `components/recruitment-trailer.tsx`(안내·오류 문구만, 가상 동료 말풍선은 해요체 유지) · `components/trailer-invite-flow.tsx` · `components/hiring-demo.tsx` · `lib/hiring-demo.ts`(검증 문구) · `lib/trailer-invite.ts` · `app/api/d/[dept]/trailers/_shared.ts`(오류 사전) · `app/api/d/[dept]/voice/route.ts:6-12`
- `docs/verification/plain-language-audit-2026-09-19/text-roles.txt`·`text-reviews.txt`·`settings-390.jpg` — 지금 상태

## 작업

### 1. 호칭 통일

`grep -rn "부서장" app components lib --include=*.tsx --include=*.ts`로 전부 찾아 §0-3 확정값(추천: 팀장)으로 바꾼다. 단, `orgs`·`members` 컬럼명·enum·API 필드는 건드리지 않는다. 설정 화면의 권한 문장: "{이름}님에게 부서장 권한을 부여합니다." → "{이름}님을 팀장으로 정합니다." / "부서장 권한을 해제합니다. 마지막 부서장은 해제할 수 없습니다." → "팀장에서 내립니다. 팀장이 한 명뿐이면 내릴 수 없습니다." / "부서에서 제외합니다." → "부서에서 뺍니다."

### 2. 올린 자료 (§4-6)

- 제목 "음성·자료 검토" → "올린 자료". 4단계: 파일 고르기 → 글로 바꾸기 → 내용 확인 → 근거로 확정.
- "참여자 전원의 수집·보관 동의를 확인했습니다." → "이 자료에 나오는 사람 모두가 저장에 동의했습니다." "자료 유형 · 자동 판별" → "자료 종류 · 자동으로 알아냄". "전사·추출 결과 보기" → "글로 바꾼 결과 보기". "예시 자료 5개 포함 / 준비된 합성 파일로 바로 체험하세요" → "예시 자료 5개 / 준비된 가상 파일로 바로 해 보세요". "심사위원이 별도 파일을 준비할 필요가 없습니다." 유지.
- 파일 카드 부제 "VTT · 회의 전사 · 추천" → ".vtt 파일 · 회의 받아쓴 글 · 추천". "MD · 부서 원칙" → ".md 파일 · 부서 원칙". CSV·JSON·TXT 같은 식.
- `review-detail.tsx`: "확인 후 확정" → "확인하고 확정하기". "실패·미처리 구간 재시도" → "안 된 부분 다시 하기". "스캔 PDF는 OCR이 필요할 수 있습니다." → "스캔한 .pdf 파일은 글자 읽기가 더 필요할 수 있습니다." "업무 활용 중지" → "업무에 쓰지 않기". "체크섬 포함 보관 묶음 다운로드" → "확인값이 든 보관 파일 내려받기". "TTS 등 실제 사람의 발언이 아닌 합성 음성입니다" → "기계가 읽은 소리입니다. 진짜 사람 목소리가 아닙니다".

### 3. 문서 정리·문서 점수표 (§4-6, U5)

- `document-assistant.tsx`: 제목 "문서 어시스턴트" → "문서 정리". 로딩 두 줄을 한 문체로: "문서를 불러오고 있습니다" / "이 부서의 문서를 확인하고 있습니다." "핵심과 근거를 정리하고 있어요" → "핵심과 근거를 정리하고 있습니다". "TXT · MD · CSV · JSON · PDF · DOCX / 최대 20MB" → ".txt .md .csv .json .pdf .docx 파일 · 20MB까지".
- `agent-roles.tsx`·데모: 아이브로우 "부서 에이전트 역할" → "문서 점수표". 제목 "문서 기준표 평가" → "문서 점수표". "AI 점수는 참고용입니다. 최종 판단은 담당자가 합니다." **유지**(ADR-038 고정 문구). 수식 문장 → "종합 점수는 기준마다 점수에 중요도를 곱해 평균 낸 값입니다. 근거가 없는 기준은 0점입니다." "평가 역할" → "점수 기준표". 표 헤더 "가중 점수" → "종합 점수". 셀 "근거 없음 (0점 반영)" → "근거 없음". "이 역할을 보관할까요?" → "이 기준표를 치울까요?", 버튼 "보관" → "치우기"(뜻: 목록에서 숨김. 삭제가 아니면 도움말 "언제든 다시 꺼낼 수 있습니다").
- `attempt-scores.tsx`: "합성 지원자" → "가상 지원자". `ASSESSMENT_FIXED_COPY`("합성 지원자 · 참고용 · 최종 판단은 담당자")는 `lib/trailer-assessment.ts`에 있다 — "가상 지원자 · 참고용 · 최종 판단은 담당자"로 바꾸고 관련 테스트를 갱신한다. `FORBIDDEN_WORDS`는 건드리지 않는다.

### 4. 기록 보관 (§4-6)

- 제목 "기록 보존" → "기록 보관". "기록 범위와 보존 정책" → "무엇을 얼마나 보관하나". "보존 기간" → "보관 기간". "수동 보관" → "직접 지울 때까지". "보존 정책 적용 체험" → "보관 기간 정해 보기". "합성 기록 내보내기" → "가상 기록 내보내기". "보존 점검" → "보관 상태 확인". "검토용 기록 문서·보관 묶음" → "확인용 기록 문서와 보관 파일". "동기화 오류 확인 필요" → "가져오기가 안 됐습니다. 확인해 주세요". 멤버 안내 "기록 보존은 부서장이 관리합니다." → "기록 보관은 팀장이 관리합니다."

### 5. 설정 (§4-6, U9)

- 제목 "부서 세팅 / 수집 범위와 동의를 확인하세요" → "부서 설정 / 누구의 기록을 어디서 모을지 정합니다". "함께할 멤버와 자료를 연결하고, 우리 부서의 사수를 준비하세요." 유지.
- 체크리스트 4단계: 멤버 동의 받기 → 멤버 슬랙 계정 잇기 → 채널 연결하기 → 원칙 문서 연결하기. "첫 수집까지 / 설정 완료 N / 4" 유지. "필수 연결이 모두 준비됐습니다." 유지.
- 탭: 멤버·동의 → 멤버와 동의 · 연결 관리 유지 · 자료 가져오기 유지. 섹션: "내 수집 동의"(유지) 설명 "원장에 인용된 발언은 결정 기록의 일부로 남습니다. 동의를 철회하면 이후 발언부터 저장하지 않습니다." → "결정 기록에 근거로 쓰인 내 말은 기록의 일부로 남습니다. 동의를 거두면 그 뒤의 말부터 저장하지 않습니다." "Slack 채널 연결" → "슬랙 채널 연결". "회의 전사 업로드 / Zoom·Meet 기본 전사 VTT/TXT를 올리면 화자 동의가 확인된 발언만 저장합니다." → "회의 녹음을 글로 올리기 / 줌·구글 미트가 만든 .vtt .txt 파일을 올리면, 동의한 사람의 말만 저장합니다." "Notion 원칙 문서" → "노션 원칙 문서". "원칙 다시 가져오기" 유지. "채널 연결 및 공지 게시" → "채널 연결하고 알리기". "미동의 멤버에게 동의 요청 보내기" → "아직 동의 안 한 멤버에게 요청 보내기". "공개 범위 / 부서 전체 / 부서장만" → "볼 수 있는 사람 / 부서 전체 / 팀장만".
- U9: 데모 설정 체크박스 줄(`demo-settings.tsx`)을 본문과 같은 글자 크기(`--text-body`, 15px)로, 카드 사이 여백을 16px로 고정. 로그인 설정 화면도 같은 클래스를 쓰는지 확인.
- 초대: `lead-invites.tsx`·`invite-acceptance.tsx`·`app/invite/[token]`: "멤버십" → "부서 소속", "철회" → "거두기", "대기 중 초대" → "아직 안 받은 초대". `no-membership`: "초대가 필요합니다 / 계정은 만들어졌지만 아직 연결된 부서가 없습니다." → "아직 부서가 없습니다 / 계정은 만들어졌습니다. 팀장이 초대하면 부서가 보입니다."

### 6. 예고편·초대·채용 미션 (§4-7, U11)

- `trailers/views.tsx` 상태 상수를 `lib/labels.ts`로(step 1에서 옮겼으면 값만 확인). `trailerNotice`·`ruleLabels`: "가상화" → "가상으로 바꿈", "고유명사" → "회사·사람 이름".
- `trailers/forms.tsx`: "발행" → "공개하기", "철회" → "거두기", "삭제" → "이 예고편 지우기", "다시 검사" 유지, "항목별 승인" → "항목마다 확인". "원장에 부서 공개 결정이 있어야 예고편을 만들 수 있습니다." → "결정 기록에 부서 전체가 볼 수 있는 결정이 있어야 예고편을 만들 수 있습니다." "이 화면을 떠나도 생성과 검사는 계속됩니다. 10초마다 상태를 갱신합니다." → "이 화면을 나가도 만들기와 검사는 계속됩니다. 10초마다 새로 고칩니다."
- `trailers/invites.tsx`: "발급" → "만들기", "철회" → "거두기", "파기" → "완전히 지우기", "재채점" → "점수 다시 매기기".
- 배지 U11: "게스트 모드 · 읽기 전용 · 합성 사례" → "로그인 없이 보기 · 가상 사례". "합성 사례 · 1인 체험" → "가상 사례". 가운뎃점 나열은 2개까지.
- `recruitment-trailer.tsx`: 안내·오류 문구만 합쇼체·사전 적용("선택지와 결정 이유를 작성하고, 단서 수첩에서 근거를 하나 이상 골라주세요." → "선택과 이유를 적고, 단서 수첩에서 근거를 하나 이상 골라 주세요."). 가상 동료 말풍선(NPC 대사)은 **그대로**(해요체 허용 파일).
- `trailer-invite-flow.tsx`: "파기" → "완전히 지움(파기)"(법적 고지 병기), "철회" → "제출 취소", "초대 링크 확인" 유지, "이 링크를 받은 이메일 주소를 입력하세요" 유지. 동의 항목 4개의 **뜻은 바꾸지 않는다**(용어만 병기).
- `hiring-demo.tsx`·`lib/hiring-demo.ts`: "합성" → "가상" 전부, "산출물" → "만든 것", "수용 조건" → "받아들이는 기준", "채용팀 접수·공개 게시·자동 채점·합불 판단은 하지 않습니다." 유지(금지선). 검증 문구 "판단 근거를 30~6,000자로 작성해 주세요." 유지.
- `app/api/d/[dept]/trailers/_shared.ts`·`voice/route.ts` 오류 사전을 W6 두 문장으로. 예: "webm, m4a, mp3, wav, ogg 음성만 사용할 수 있습니다." → ".webm .m4a .mp3 .wav .ogg 파일만 올릴 수 있습니다. 다른 형식이면 바꿔서 다시 올려 주세요."

### 7. E2E

바뀐 버튼(발행·철회·삭제·확인 후 확정·보관)의 셀렉터를 갱신한다. `npm run e2e:trailer`·`e2e:review-controls`가 통과해야 한다.

## Acceptance Criteria

```bash
grep -rn "부서장" app components lib --include=*.tsx --include=*.ts | grep -v "wording-ok" | wc -l   # 0 (§0-3=팀장일 때)
node scripts/check-wording.mjs components/reviewed-materials.tsx components/review-detail.tsx components/document-assistant.tsx components/agent-roles.tsx components/retention-console.tsx components/settings-s5.tsx components/demo-settings.tsx components/notion-source-list.tsx components/trailers/forms.tsx components/trailers/views.tsx components/trailers/invites.tsx components/trailer-invite-flow.tsx components/hiring-demo.tsx lib/hiring-demo.ts lib/trailer-invite.ts lib/trailer-assessment.ts "app/api/d/[dept]/trailers/_shared.ts" "app/api/d/[dept]/voice/route.ts"   # blocking 0
npm run lint && npm run test && npm run build
npm run e2e:trailer && npm run e2e:review-controls
# 실측 390: /demo/d/<영업>/settings 체크박스 줄 글자 크기 = 본문, 카드 간격 16px (스크린샷)
```

## 금지사항

- `components/recruitment-trailer.tsx`의 가상 동료 말풍선·NPC 대사를 합쇼체로 바꾸지 마라. 이유: §0-1 — 캐릭터 목소리는 해요체 허용. 안내·오류만 고친다.
- `lib/trailer-assessment.ts`의 `FORBIDDEN_WORDS`와 `lib/agent-role.ts`의 판정 금지 지시를 바꾸지 마라. 이유: 합불·순위 금지선(ADR-041·045·059).
- 지원자 동의 화면(`trailer-invite-flow.tsx` 동의 단계)의 수집 항목·목적·보관 기간 문장의 뜻을 바꾸지 마라. 이유: 법적 고지(ADR-062). 용어 병기만.
- `orgs`·`members`·`trailer_invites` 컬럼명·API 필드·enum(`lead`)을 바꾸지 마라. 이유: 호칭은 표시 문제다. `lib/labels.ts`의 `memberRole`만.
- step 3이 고친 파일(`demo-safe-actions.tsx`의 카드·원장 부분 등)을 다시 고치지 마라. 이유: 충돌. 자료 검토 부분만.
