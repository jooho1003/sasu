# 부서별 당일 회고 자동화 — 법령·플랫폼 정책 제약 조사

- **조사일**: 2026-09-19
- **조사 대상**: 사수(SASU)의 "부서별 당일 회고 자동화"(직원 본인의 하루 활동 — 통화 메타데이터·메일 메타데이터·문서 편집·CRM 활동 — 를 본인 동의로 모아 회고를 만드는 기능)를 설계하기 위해, 한국 법령과 플랫폼 정책이 두는 제약을 1차 출처(law.go.kr 원문·플랫폼 공식 약관)로만 확인한다.
- **출처 규칙**: 법령은 국가법령정보센터(law.go.kr) 원문, 정책은 각 플랫폼 공식 페이지만 근거로 썼다. 블로그·해설·기사는 배제했다. 법적 판단은 하지 않으며, 판단이 필요한 지점은 `[해석 필요: 법률 자문]`으로 표시했다. 원문을 못 찾은 항목은 "확인 못 함"으로 적었다.

## 결론 3줄 (핵심 제약 요약 — 판단 아님)

1. **통화·메일 메타데이터의 법적 성격이 애매한 지점이 많다.** 통화 메타데이터(상대 번호·시각·길이)는 통신비밀보호법 제2조 11호 "통신사실확인자료" 정의에 문언상 그대로 포섭되고([1]), Gmail의 `gmail.metadata` 스코프는 "본문 아님"에도 Google 공식 분류상 **Restricted**라 서버 저장 시 연 1회 CASA 보안평가가 요구된다([7][9]). 본인이 본인 단말에서 추출하는 행위가 통비법 규율 대상인지는 조문만으로 확정되지 않는다 `[해석 필요: 법률 자문]`.
2. **고객 식별정보를 회고에 넣지 않고 건수만 남기는 설계가 조문상 가장 부담이 적다.** 개인정보보호법 제15조는 "수집 목적의 범위에서 이용"을 요구하고([3]), 제17조는 "제3자에게 제공(공유를 포함)"을 규율하며([3]), 제2조제1호의2는 가명처리를 "일부 삭제·대체로 특정 개인을 알아볼 수 없도록 처리"로 정의한다([3]). 식별 요소를 아예 남기지 않으면 이 조문들의 적용 쟁점이 축소된다.
3. **"본인 동의 수집"과 "부서 공개"는 별개로 다뤄야 한다.** 표준 개인정보 보호지침 제6조⑥은 임금·교육·증명서·복지 목적에 한해 근로자 무동의 수집·이용을 허용하고([5]), 개인정보위·고용노동부 「개인정보보호 가이드라인(인사·노무편)」은 근로자 개인정보를 **공개**하려면 원칙적으로 근로자 동의를 받아야 한다고 적고 있다([6]). 플랫폼 약관(Slack·Atlassian)은 "minimum necessary"·"necessary" 수집 원칙을, Notion·Atlassian은 연동 해제/삭제 요청 시 삭제 의무를 명문화한다([11][12][14]).

---

## 1. 통신비밀보호법

### 조문 원문 요지

- 확인 법령: 통신비밀보호법(법률 제20735호, 2025.1.31. 일부개정, 2025.8.1. 시행). 원문: https://www.law.go.kr/법령/통신비밀보호법 ([1])
- **제2조(정의)** ([1])
  - 1호 "통신" = 우편물 및 전기통신.
  - 3호 "전기통신" = 전화·전자우편 등 유선·무선·광선 등 전자적 방식으로 음향·문언·부호·영상을 송신 또는 수신하는 것.
  - 7호 "감청" = 전기통신에 대하여 **당사자의 동의없이** 전자장치·기계장치등을 사용하여 통신의 음향·문언·부호·영상을 청취·공독하여 그 내용을 지득 또는 채록하거나 송·수신을 방해하는 것.
  - 11호 "통신사실확인자료" = 가. 가입자의 전기통신일시 / 나. 전기통신개시·종료시간 / 다. **발·착신 통신번호 등 상대방의 가입자번호** / 라. 사용도수 등.
  - 제2조 정의 목록(1~12호)에 "대화"의 별도 정의는 없다.
- **제3조(통신 및 대화비밀의 보호)** ① "누구든지 이 법과 형사소송법 또는 군사법원법의 규정에 의하지 아니하고는 우편물의 검열·전기통신의 감청 또는 통신사실확인자료의 제공을 하거나 **공개되지 아니한 타인간의 대화를 녹음 또는 청취**하지 못한다." ([1])
- **제14조(타인의 대화비밀 침해금지)** ① "누구든지 **공개되지 아니한 타인간의 대화**를 녹음하거나 전자장치 또는 기계적 수단을 이용하여 청취할 수 없다." ([1])
- **제16조(벌칙)** ①1호: "제3조의 규정에 위반하여 우편물의 검열 또는 전기통신의 감청을 하거나 공개되지 아니한 타인간의 대화를 녹음 또는 청취한 자"는 1년 이상 10년 이하의 징역과 5년 이하의 자격정지. 제16조①1호에는 "통신사실확인자료 제공" 위반이 열거되어 있지 않다. ([1])

### 당사자 간 녹음 vs 제3자 녹음 — 조문상 구분

- 제3조·제14조 모두 규율 대상을 "**공개되지 아니한 타인간의 대화**"로 한정하고, 감청 정의(제2조 7호)는 "**당사자의 동의없이**"를 요건으로 둔다 ([1]).
- 통화 당사자 본인이 자신이 참여한 통화를 스스로 녹음하는 행위가 "타인간의 대화" 또는 "당사자의 동의없이"에 해당하는지는 조문 문언에 확정적으로 기술되어 있지 않다 `[해석 필요: 법률 자문]` ([1]).

### 설계에 주는 제약

- **되는 것(조문 근거)**: 본 기능은 통화 **내용**(음향·문언)을 청취·채록하지 않으므로, 제2조 7호 "감청" 정의의 "통신의 음향·문언·부호·영상을 청취·공독하여 그 내용을 지득 또는 채록"이라는 문언 요건에는 해당하지 않는다 ([1]). 통화 녹음 기능은 아예 두지 않는 것이 제3조·제14조·제16조 적용 쟁점을 피하는 설계다 ([1]).
- **안 되는 것 / 유의**: 상대 번호·시각·길이·수신/발신 구분은 제2조 11호 "통신사실확인자료" 정의에 문언상 포섭된다 ([1]). 제3조①은 통신사실확인자료의 "**제공**"을 금지 행위로 열거하므로 ([1]), 사수가 이 데이터를 회사 서버로 전송·저장하고 부서에 공개하는 흐름이 "제공"에 해당하는지가 쟁점이 된다.

### `[해석 필요: 법률 자문]`

- 본인이 본인 단말에서 본인 통화의 메타데이터를 추출·기록하는 행위가 제3조①의 "통신사실확인자료의 제공"에 해당하는지 ([1]).
- 제16조①1호에 통신사실확인자료 제공 위반이 열거되어 있지 않은데, 별도 벌칙 조항이 적용되는지 (본 조사에서는 제16조①1호만 확인, 다른 항·호는 확인 못 함) ([1]).
- 당사자 본인 녹음(향후 기능 추가 시)이 "타인간의 대화"에 해당하는지 ([1]).

---

## 2. 개인정보보호법

### 조문 원문 요지

- 확인 법령: 개인정보보호법(법률 제21445호, 시행 2026.9.11.). 조문별 URL 패턴 `https://www.law.go.kr/법령/개인정보보호법/제○조` ([2]~[3]). law.go.kr은 본문을 JS로 렌더링해 정적 fetch로는 본문이 잡히지 않아 브라우저 렌더링으로 확인했다.
- **제2조제1호의2(가명처리 정의)**: "'가명처리'란 개인정보의 일부를 삭제하거나 일부 또는 전부를 대체하는 등의 방법으로 추가 정보가 없이는 특정 개인을 알아볼 수 없도록 처리하는 것을 말한다." https://www.law.go.kr/법령/개인정보보호법/제2조 ([2])
- **제15조(개인정보의 수집·이용)** ① "개인정보처리자는 다음 각 호의 어느 하나에 해당하는 경우에는 개인정보를 수집할 수 있으며 그 **수집 목적의 범위에서 이용**할 수 있다." (1호 동의, 2호 법령상 의무, 3호 공공기관 소관업무, 4호 계약 이행, 5호 급박한 생명·신체·재산 이익, 6호 정당한 이익, 7호 공중위생) ③ "당초 수집 목적과 합리적으로 관련된 범위에서 정보주체에게 불이익이 발생하는지 여부, 암호화 등 안전성 확보에 필요한 조치를 하였는지 여부 등을 고려하여 대통령령으로 정하는 바에 따라 정보주체의 동의 없이 개인정보를 이용할 수 있다." https://www.law.go.kr/법령/개인정보보호법/제15조 ([3])
- **제17조(개인정보의 제공)** ① "개인정보처리자는 … 정보주체의 개인정보를 **제3자에게 제공(공유를 포함한다. 이하 같다)**할 수 있다." (1호 동의, 2호 제15조①2·3·5~7호에 따라 수집 목적 범위에서 제공) ④ "당초 수집 목적과 합리적으로 관련된 범위에서 … 정보주체의 동의 없이 개인정보를 제공할 수 있다." https://www.law.go.kr/법령/개인정보보호법/제17조 ([3])
- **제23조(민감정보의 처리 제한)** ① "사상·신념, 노동조합·정당의 가입·탈퇴, 정치적 견해, 건강, 성생활 등에 관한 정보, 그 밖에 정보주체의 사생활을 현저히 침해할 우려가 있는 개인정보로서 대통령령으로 정하는 정보(이하 '민감정보'라 한다)를 처리하여서는 아니 된다." (예외: 별도 동의, 법령 근거) ② 민감정보 유출등 방지를 위해 제29조에 따른 안전성 확보 조치 의무. https://www.law.go.kr/법령/개인정보보호법/제23조 ([3])
- **제28조의2(가명정보의 처리 등)** ① "통계작성, 과학적 연구, 공익적 기록보존 등을 위하여 정보주체의 동의 없이 가명정보를 처리할 수 있다." ② "가명정보를 제3자에게 제공하는 경우에는 특정 개인을 알아보기 위하여 사용될 수 있는 정보를 포함해서는 아니 된다." https://www.law.go.kr/법령/개인정보보호법/제28조의2 ([3])
- **제29조(안전조치의무)**: "개인정보가 유출등이 되지 아니하도록 내부 관리계획 수립, 접속기록 보관 등 대통령령으로 정하는 바에 따라 안전성 확보에 필요한 기술적·관리적 및 물리적 조치를 하여야 한다." https://www.law.go.kr/법령/개인정보보호법/제29조 ([3])
- **제37조의2(자동화된 결정에 대한 정보주체의 권리 등)** (본조신설 2023.3.14., 조번호 변경 없음) ① "완전히 자동화된 시스템(인공지능 기술을 적용한 시스템을 포함한다)으로 개인정보를 처리하여 이루어지는 결정 … 이 자신의 권리 또는 의무에 중대한 영향을 미치는 경우에는 … 거부할 수 있는 권리를 가진다. 다만, 자동화된 결정이 제15조제1항제1호·제2호 및 제4호에 따라 이루어지는 경우에는 그러하지 아니하다." ② 설명 요구권, ③~⑤ 처리자의 조치·기준 공개 의무. https://www.law.go.kr/법령/개인정보보호법/제37조의2 ([3])

### 설계에 주는 제약

- **고객 전화번호·이메일·이름을 회고에 넣는 경우**: 고객 응대·영업 목적으로 수집한 정보를 "직원 본인 회고 작성·부서 공개"에 쓰는 것이 제15조①의 "수집 목적의 범위에서 이용"에 해당하는지가 쟁점이다 ([3]). 제15조③의 "합리적으로 관련된 범위" 예외도 대통령령이 정하는 요건(불이익 여부·안전조치 여부)을 요구한다 ([3]). 이 정보가 저장되는 순간 제29조의 기술적·관리적·물리적 안전조치 의무(내부 관리계획, 접속기록 보관 등)가 일반적으로 따라온다 ([3]).
- **회고를 부서원(상사 등)에게 공개하는 경우**: 제17조는 "제3자에게 제공(공유를 포함)"으로 정의하나 ([3]), 같은 개인정보처리자(회사) 내부의 다른 부서원·상사가 "제3자"인지 — 즉 "제공"과 "내부 이용"의 경계 — 는 조문 문언만으로 확정되지 않는다 `[해석 필요: 법률 자문]` ([3]).
- **마스킹(뒷자리 제거·이름 일부 가림)**: 제2조제1호의2가 정의하는 가명처리("일부를 삭제하거나 일부 또는 전부를 대체")의 방법에 문언상 부합할 소지가 있다 ([2]). 다만 제28조의2①이 동의 없는 가명정보 처리를 허용하는 목적은 "통계작성·과학적 연구·공익적 기록보존 등"으로 열거되어 있어 ([3]), 회고 작성·부서 공개가 여기에 해당하는지는 별도 판단이 필요하다 `[해석 필요: 법률 자문]`.
- **"통화 3건"처럼 건수만 남기는 설계가 부담이 적은 이유(조문 근거)**:
  - 제15조: 상대방 식별정보가 회고에 남지 않으면 고객 개인정보를 회고 목적으로 "이용"하는 행위 자체가 발생하지 않아 "수집 목적의 범위" 쟁점이 축소된다 ([3]). 개인정보 해당 여부는 제2조제1호 정의에 따른다 ([2]) `[해석 필요: 법률 자문]`.
  - 제23조: 상대방의 건강·성생활 등 민감정보가 회고 문맥에 결합될 경로가 원천 차단된다 ([3]).
  - 제2조제1호의2·제28조의2: 건수만 남기는 것은 "특정 개인을 알아볼 수 없도록" 하는 가명처리의 정의를 넘어 식별 요소를 완전히 배제하는 형태다 ([2][3]).
- **제37조의2**: 회고 자체는 "자신의 권리 또는 의무에 중대한 영향을 미치는" 결정이 아니면 직접 적용 대상이 아니다 ([3]). 회고 기반으로 카드 자동 생성·업무 배정 판단 등 AI 자동화 결정 요소가 추가되면 거부권·설명요구권·기준 공개 의무 적용을 검토해야 한다 ([3]).

### `[해석 필요: 법률 자문]`

- 고객 식별정보의 회고 포함이 제15조① "수집 목적의 범위" 내인지, 제15조③ 예외 요건을 충족하는지 ([3]).
- 부서 공개가 제17조 "제3자 제공(공유 포함)"인지, 내부 이용인지 ([3]).
- 마스킹을 가명처리로 볼 때 제28조의2① 열거 목적에 해당하는지 ([2][3]).
- 회고 기능이 제37조의2의 "자동화된 결정"에 해당할 수 있는 경우가 있는지 ([3]).

---

## 3. 근로자 활동 기록과 노동 관련 법

### 원문 요지

- **근로기준법**(법률 제21373호, 시행 2026.8.20.) 전체 조문(약 66,000자)을 law.go.kr에서 검색한 결과, "개인정보"·"모니터링"·"인사기록"·"인사관리" 문구는 없다. "감시"는 제63조(감시·단속적 근로자 적용제외) 문맥에서만 등장한다. 제41조(근로자 명부), 제98조·제100조의2(부속 기숙사 근로자의 사생활의 자유 침해 금지·사생활 보호 조치)가 있으나 업무활동 모니터링·인사관리 목적 개인정보 처리를 직접 규율하지 않는다. https://www.law.go.kr/법령/근로기준법 ([4]) → **본 주제 관련 조문 확인 못 함**.
- **표준 개인정보 보호지침**(개인정보보호위원회고시 제2025-4호, 2025.4.11. 시행) **제6조(개인정보의 수집·이용) ⑥**: "근로자와 사용자가 근로계약을 체결하는 경우 「근로기준법」에 따른 임금지급, 교육, 증명서 발급, 근로자 복지제공을 위하여 근로자의 동의 없이 개인정보를 수집·이용할 수 있다." https://www.law.go.kr/행정규칙/표준개인정보보호지침 ([5]). 지침 전체에 "모니터링"·"감시"·"노동" 단어는 없고, "인사"는 제15조③ "인사이동" 시 접근권한 조정 문맥에만 등장한다 ([5]).
- **개인정보위·고용노동부 「개인정보보호 가이드라인(인사·노무편)」**(2023.1.31. 발표·개정). pipc.go.kr 보도자료 본문에서 확인한 문구 ([6]):
  - "근로자의 개인정보를 공개하려는 경우 원칙적으로 근로자 동의를 받아야 하며" (고용유지 단계)
  - "1) 근로자 등 이해관계자에게 디지털 장치 도입 목적과 개인정보 처리내용 등을 설명한 후 의견을 청취하고, ※ 노사협의회가 설치된 경우 노사협의를 해야 함(근로자참여법 제20조 제1항 제14호) / 2) …수집·이용 근거가 불명확한 경우 동의를 받아야 하며, 이 경우 ㄱ) 필요한 최소한의 처리, ㄴ) 동의 내용의 명확한 고지, ㄷ) 능동적 의사 확인, ㄹ) 선택권 보장에 각별히 주의"
  - 첨부 PDF(「[참고] 개인정보보호 가이드라인(인사·노무편).pdf」) 원문은 다운로드가 400 오류로 차단되어 **직접 열람 확인 못 함**. 위 인용은 보도자료 본문에서 가져온 것이다 ([6]).
- 「개인정보 보호법 및 시행령 개정사항 안내」·「근로자 개인정보 처리 가이드」라는 명칭의 별도 문서는 본 조사에서 원문 **확인 못 함**.

### 설계에 주는 제약

- 표준지침 제6조⑥의 무동의 예외는 임금지급·교육·증명서 발급·복지제공 목적에 한정되므로 ([5]), 통화·메일 메타데이터·CRM 활동 기반 회고 생성은 이 예외에 해당하지 않아 별도 동의 근거가 필요하다는 점에서, "본인 동의 수집" 설계 방향과 부합한다.
- 인사·노무 가이드라인은 수집 동의와 별개로 근로자 개인정보의 **공개**에 대해 원칙적으로 동의를 요구한다 ([6]). 따라서 "수집 동의"와 "부서 공개 동의"를 하나로 묶지 않고 분리해 받는 설계가 원문 문구에 가깝다.
- 같은 가이드라인은 "디지털 장치 도입" 시 이해관계자 설명·의견 청취·(노사협의회 있으면) 노사협의·최소 처리·능동적 의사 확인·선택권 보장을 요구한다 ([6]). 회고 자동화 도입 시 이 절차를 조직 관리자 온보딩에 반영할 수 있다.

### `[해석 필요: 법률 자문]`

- 회고를 부서에 공개하는 것이 가이드라인의 "근로자 개인정보 공개"에 해당하는지, 수집 동의만으로 충분한지 ([6]).
- 사수의 자동 회고 기능이 가이드라인의 "디지털 장치"에 해당하는지, 상사의 부하 업무패턴 열람이 "감시"로 평가되는지 ([6]).
- `[추정]` 가이드라인은 안내서 성격으로 고시(표준지침)와 법적 효력이 다를 수 있다 — 효력 차이는 확인 못 함.

---

## 4. Google API Services User Data Policy / Restricted scopes

### 정책 원문 요지

- **API Services User Data Policy** "Additional Requirements for Specific API Scopes": "Certain Google OAuth API Scopes (the 'Sensitive and Restricted Scopes') are subject to additional requirements that can be found in each product's User Data and Developer Policy or the Google Developer Page." 이어서 "...applications must pass an annual security assessment and obtain a Letter of Assessment from a Google-designated third party." https://developers.google.com/terms/api-services-user-data-policy ([7]). 이 페이지에 "CASA"라는 용어는 등장하지 않는다 ([7]).
- `https://support.google.com/cloud/answer/9110914`(#restricted-scopes / #sensitive-scopes)는 301 리다이렉트되어 OAuth 앱 검증 허브 페이지 https://support.google.com/cloud/answer/13463073 로 이동하며, 이 허브 페이지 자체에는 스코프별 표가 없다 ([8]) → **9110914 페이지에서 스코프별 표 직접 확인 못 함**. 실제 분류 표는 API별 공식 문서에 있다.
- **Gmail API 스코프 문서** "Restricted scopes" 표에 `https://www.googleapis.com/auth/gmail.metadata` — "View your email message metadata such as labels and headers, but not the email body."가 포함된다. Restricted 정의: "These scopes provide wide access to Google user data and require restricted scope OAuth App Verification... If you store restricted scope data on servers (or transmit), then you must go through a security assessment." https://developers.google.com/gmail/api/auth/scopes ([9])
- **Google Drive API 스코프 문서** "Restricted scopes" 표에 `drive`, `drive.readonly`, `drive.metadata`, `drive.metadata.readonly` 등이 포함된다. https://developers.google.com/workspace/drive/api/guides/api-specific-auth ([10])
- **CASA**: "Cloud App Security Assessment framework (CASA)" — restricted scope 요청 앱은 "must undergo an annual security assessment", 통과 시 "Letter of Validation (LOV)" 발급. https://support.google.com/cloud/answer/13465431 ([9-1])
- OAuth 앱 검증 절차·소요 기간 안내: https://support.google.com/cloud/answer/13463817 ([9-2])

### 설계에 주는 제약

- `gmail.metadata`는 "본문 아님"이라는 설명에도 Google 공식 분류상 **Restricted**다 ([9]). 사수가 이 데이터를 Supabase 등 서버에 저장·전송하면 "store restricted scope data on servers (or transmit)" 조건에 해당해 연 1회 CASA 보안평가 + LOV, 그리고 restricted scope OAuth 앱 검증이 요구된다 ([7][9][9-1]).
- Drive의 메타데이터 전용 스코프(`drive.metadata.readonly`)도 Restricted다 ([10]). "문서 편집 이력"을 Drive에서 가져오는 설계도 같은 검증·평가 요건에 걸린다.
- 정책 원문상 restricted scope 데이터를 서버에 저장하지 않는 구조가 보안평가 요건의 조건("If you store … on servers (or transmit)")을 피하는 유일한 경로로 기술되어 있다 ([9]). 클라이언트 측에서 집계만 하고 원본을 서버에 남기지 않는 구조가 이에 해당하는지는 `[해석 필요: 법률 자문]`.
- 9/20 제출 일정 안에 OAuth 앱 검증·CASA를 완료하는 것은 검증 절차 안내([9-2]) 기준으로 현실적이지 않다 `[추정]`. MVP에서는 Gmail·Drive 연동을 범위에서 빼거나 테스트 사용자 모드로 제한하는 판단이 필요하다.

### `[해석 필요: 법률 자문]`

- 서버 저장 없이 클라이언트에서 건수만 집계하는 구조가 "store restricted scope data on servers (or transmit)"에 해당하지 않는지 ([9]).
- 미검증 앱의 테스트 사용자 한도 안에서 데모를 운영하는 것이 정책상 허용 범위인지 ([8][9-2]).

---

## 5. Figma · Notion · Slack · Atlassian Developer Terms

세부 해석 없이 조항 위치와 요지만 적는다.

### Figma — https://www.figma.com/legal/developer-terms/ ([11])

- 보관·삭제: Section 4.d(Limitations) "Upon termination, you will delete all Developer Resources" — Developer Resources(API 리소스) 삭제이며 최종 사용자 데이터 삭제 의무는 아니다. Section 7.b~d(Publicly Available Integrations)에서 Integration Data에 대해 "obtain from users all necessary rights, permissions, and consents", "provide and maintain a clear and conspicuous privacy policy", "protect the confidentiality, integrity, and availability of Integration Data"를 요구한다 ([11]).
- 재판매 금지: "sell"·"resale" 관련 문구 **확인 못 함** ([11]).
- 최소 수집: 해당 문구 **확인 못 함** ([11]).
- 제약 한 줄: 재판매·최소수집 명문 조항은 없으므로 이 두 항목에 대해 Figma 약관을 근거로 삼을 수 없다. 사용자 동의 확보·개인정보처리방침 게시·Integration Data 보호는 명문 의무다 ([11]).

### Notion — https://www.notion.so/Developer-Terms-ba4131408d0844e08330da2cbb225c20 ([12])

- 재판매 금지: Section 3.1(Prohibited Uses) (i) "…collect, store, transfer, **sell**, use, alter, or delete any Integration Data either **without the prior written consent of the End User**…" — 절대 금지가 아니라 End User 동의 없는 판매를 금지 ([12]).
- 보관·삭제: Section 4.4(Data Subject Requests) "You must comply with all data subject requests from End Users with respect to an End User's right to **delete**, access, or receive… Integration Data… In the event you **retain** End User Data following the deletion or uninstallation of your Integration by an End User, you must continue to maintain the End User Data according to Your Terms with the End User and continue to maintain industry standard security measures." ([12])
- 최소 수집: 해당 문구 **확인 못 함** ([12]).
- 제약 한 줄: 직원이 연동 해제·삭제를 요청하면 End User Data를 삭제하거나, 보관 시 자체 약관과 업계 표준 보안 조치를 유지해야 한다 ([12]).

### Slack — https://slack.com/terms-of-service/api ([13])

- 재판매 금지(유사): "Data Usage by Third Parties" 섹션 "you may not: … (C) **use data collected from one organization to directly benefit a different organization or any third party**." — 직접적 재판매 문구는 아니나 타 조직·제3자 이익을 위한 전용을 금지 ([13]).
- 최소 수집: 같은 섹션 "You must limit your use, processing, and retention of API Data from others outside your organization to the **minimum necessary** to develop, test, operate, and support your Application's functionality." ([13])
- 보관·삭제: delete/retain/uninstall/disconnect/revoke를 포함한 명시 조항 **확인 못 함**. Termination 섹션의 "Upon termination of the Contract, you will promptly destroy copies of any documentation and any other Slack information in your possession…"는 Slack 자체 정보 파기 조항이다 ([13]).
- 제약 한 줄: 한 조직의 데이터를 다른 조직·제3자 이익에 쓰면 (C) 위반 소지가 있고, 사용·처리·보관은 "minimum necessary"로 제한해야 한다 ([13]).

### Atlassian — https://developer.atlassian.com/platform/marketplace/atlassian-developer-terms/ ([14]) + https://developer.atlassian.com/platform/marketplace/data-privacy-guidelines/ ([15])

- 재판매 금지: Developer Terms Section 9.2(Collection and Use) "You may not **sell** any End User Data." ([14])
- 최소 수집: 같은 Section 9.2 "you must limit your access and processing of such information to that (a) authorized by the end user or (b) **necessary** for the purposes of providing the functionality of your Marketplace App." ([14])
- 보관·삭제: Developer Terms 본문에서 delete/retain/uninstall 명시 문구 **확인 못 함** ([14]). 별도 공식 가이드라인 Data Privacy Guidelines "Minimize the data you collect" 섹션에 "get rid of data when it is no longer needed… by developing and enforcing reasonable data retention schedules", "Respect Atlassian Developer Terms and any instructions to **delete user data upon request and/or uninstall**"이 있다 ([15]).
- 제약 한 줄: End User Data 재판매는 명문 금지, 수집·처리는 사용자 승인 범위 또는 기능 제공에 필요한 범위로 제한, 삭제 요청·언인스톨 시 삭제와 보관 기간 정책 운영이 가이드라인에 명시돼 있다 ([14][15]).

### 종합 (원문 근거만)

- "최소 수집" 원칙 명문: Slack([13])·Atlassian([14]). "재판매 금지" 명문: Notion(동의 없는 판매 금지, [12])·Atlassian(전면 금지, [14]). "삭제 의무" 명문: Notion([12])·Atlassian 가이드라인([15]).
- Figma·Slack 본문에서 삭제 의무 조항을 찾지 못한 것은 "의무 없음"의 근거가 아니다. 네 플랫폼 공통으로 연동 해제 시 저장된 원본 활동 데이터를 삭제하는 기능을 두는 것이 명문 조항이 있는 플랫폼([12][15])의 요건을 충족하는 설계다.

---

## 6. Google Play Call Log 권한 정책

### 정책 원문 요지

- 페이지: "Use of SMS or Call Log permission groups" https://support.google.com/googleplay/android-developer/answer/10208820 (리다이렉트 없음) ([16])
- 핵심 원칙: "Only access Call Log or SMS permissions when your app falls within permitted uses and only to enable your app's critical core functionality." ([16])
- 허용 앱 유형 표 (원문):
  - "Default Phone handler (when app is the registered default handler for phone and any other core functionality usage)" → `PROCESS_OUTGOING_CALLS, READ_CALL_LOG, WRITE_CALL_LOG` ([16])
  - "Default Assistant handler (when app is the registered default handler for assistant and any other core functionality usage)" → `READ_CALL_LOG` ([16])
- "Exceptions" 표: 계정 인증(전화), 백업/복원, 발신자 표시·스팸 차단, 연동기기 동반앱, 기기 간 동기화, 기기 자동화 등 구체적 사례만 열거하며, 각 사례는 "no alternative method to provide the core functionality"(대체 수단 없음)을 요구한다 ([16]).

### 설계에 주는 제약

- 업무 회고용 보조 앱은 기본 전화·SMS·어시스턴트 핸들러가 아니며 ([16]), Exceptions 표의 열거 사례(계정 인증·백업·발신자 표시·동반앱·동기화·자동화) 어디에도 해당하지 않는다 ([16]). 따라서 원문의 허용 유형·예외 유형 어느 쪽에도 사수의 사용 사례가 열거되어 있지 않다.
- 예외 적용 시에도 "대체 수단 없음"이 요구되는데 ([16]), 사수에는 슬랙·회의 전사 등 다른 입력 경로가 이미 존재한다.
- 결과적으로 `READ_CALL_LOG`를 요청하는 안드로이드 앱을 Google Play로 배포하는 설계는 정책 원문상 근거가 없다. 통화 메타데이터를 쓰려면 Play 배포 앱의 Call Log 권한이 아닌 다른 경로(사용자가 직접 내보낸 파일 업로드 등)를 전제해야 한다.

### `[해석 필요: 법률 자문]`

- Play 심사에서 개별 사례 판단 여지가 있는지 — 원문은 열거식이며 "사수" 유형에 대한 명시적 허용·금지 문구는 없다 ([16]). 배포를 검토한다면 Google Play 정책팀 사전 문의가 필요하다.
- Play 외 배포(사이드로딩·기업 내부 배포)에 이 정책이 어떻게 적용되는지는 본 조사 범위 밖 — 확인 못 함.

---

## 출처 URL 전체 목록

1. 통신비밀보호법(법률 제20735호) 원문 — https://www.law.go.kr/법령/통신비밀보호법
2. 개인정보보호법 제2조(정의: 개인정보·가명처리) — https://www.law.go.kr/법령/개인정보보호법/제2조
3. 개인정보보호법 제15조·제17조·제23조·제28조의2·제29조·제37조의2 — https://www.law.go.kr/법령/개인정보보호법/제15조 · https://www.law.go.kr/법령/개인정보보호법/제17조 · https://www.law.go.kr/법령/개인정보보호법/제23조 · https://www.law.go.kr/법령/개인정보보호법/제28조의2 · https://www.law.go.kr/법령/개인정보보호법/제29조 · https://www.law.go.kr/법령/개인정보보호법/제37조의2
4. 근로기준법(법률 제21373호) 원문 — https://www.law.go.kr/법령/근로기준법
5. 표준 개인정보 보호지침(개인정보보호위원회고시 제2025-4호) — https://www.law.go.kr/행정규칙/표준개인정보보호지침
6. 개인정보보호위원회 보도자료 「개인정보보호 가이드라인(인사·노무편)」(2023.1.31.) — https://pipc.go.kr/np/cop/bbs/selectBoardArticle.do?bbsId=BS074&mCode=C020010000&nttId=8579 (첨부 PDF 직접 열람 못 함)
7. Google API Services User Data Policy — https://developers.google.com/terms/api-services-user-data-policy
8. Google OAuth 앱 검증 허브(9110914 리다이렉트 대상) — https://support.google.com/cloud/answer/13463073
9. Gmail API 스코프 분류(Restricted 표에 gmail.metadata 포함) — https://developers.google.com/gmail/api/auth/scopes
   - 9-1. CASA(Cloud App Security Assessment) 안내 — https://support.google.com/cloud/answer/13465431
   - 9-2. OAuth 앱 검증 절차 안내 — https://support.google.com/cloud/answer/13463817
10. Google Drive API 스코프 분류 — https://developers.google.com/workspace/drive/api/guides/api-specific-auth
11. Figma Developer Terms — https://www.figma.com/legal/developer-terms/
12. Notion Developer Terms — https://www.notion.so/Developer-Terms-ba4131408d0844e08330da2cbb225c20
13. Slack API Terms of Service — https://slack.com/terms-of-service/api
14. Atlassian Developer Terms — https://developer.atlassian.com/platform/marketplace/atlassian-developer-terms/
15. Atlassian Data Privacy Guidelines for Developers — https://developer.atlassian.com/platform/marketplace/data-privacy-guidelines/
16. Google Play "Use of SMS or Call Log permission groups" — https://support.google.com/googleplay/android-developer/answer/10208820
