# 쉬운 말 문구·UI/UX 정비 — 2026-09-19

"전체 UI/UX를 점검하고, 서비스 문구를 중학교 2학년도 이해하고 쓸 수 있는 수준으로. 확인하고 설계 진행."
점검(A0)·설계(D0)는 끝났다. S0~S7은 설계 §0의 사용자 결정 8개가 확정된 뒤 Codex가 `phases/31-plain-language/`로 실행한다. 9/20 제출본·운영은 건드리지 않는다.

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| A0 | 점검 — 데모 18화면 실측 + 소스 전수 조사 | explore | 1/1/0/0=2 | balanced | Explore ×2 (완료) |
| D0 | 설계·상위 문서·플랜·step 파일 | general | 2/2/1/2=7 | powerful | main (완료) |
| S0 | 사전·검사기·기준선 | general | 1/1/1/1=4 | balanced | codex terra |
| S1 | 이름표 SSOT·영문 노출 제거 | general | 0/1/1/1=3 | balanced | codex terra |
| S2 | 셸·메뉴·404·모바일 헤더 | frontend | 1/1/0/1=3 | balanced | codex terra |
| S3 | 대시보드·카드·결정 기록·묻기 | frontend | 1/1/0/2=4 | balanced | codex terra |
| S4 | 팀장 화면·예고편·초대·미션 | frontend | 1/1/0/1=3 | balanced | codex terra |
| S5 | 메인·로그인·개인정보·관리자·동의 diff | frontend | 1/1/1/2=5 | powerful | codex sol |
| S6 | 슬랙·LLM 문체 블록 | general | 1/1/1/1=4 | balanced | codex terra |
| S7 | 검증·lint 편입·실측·blocked | qa | 0/1/1/1=3 | balanced | codex terra |
| R1 | 최종 리뷰 | review | 2/2/0/2=6 | powerful | main (위임 금지) |

## 게이트

- G1 완전성: PASS
- G2 오버라이드: PASS — D0(모호한 판단·아키텍처)·R1(최종 리뷰)은 powerful + 위임 안 함. S5는 법적 문구 경계라 powerful
- G3 클램프: PASS — explore ceiling(balanced) 안, frontend floor(balanced) 이상, qa balanced
- G4 비용: PASS — powerful 3/11 = 27%
- G5 안전: PASS — D3=2 없음. 운영 반영·제출 스크린샷 교체·동의 문구 변경은 플랜 밖(사용자·법률 판정)

결과: **PASS**

## 사용자 판단 대기 (설계 §0)

문체 · 핵심 버튼 3개 라벨 · lead 호칭 · 메뉴 이름 · 브랜드 표기 · "합성"→"가상" · 검사기 차단 시점 · 운영 반영 시점. 추천값으로 진행해도 된다고 하면 그대로 S0을 시작한다.
