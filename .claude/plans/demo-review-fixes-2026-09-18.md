# 공개 데모 재검토·잔여 결함 수정 — 2026-09-18

Codex phase 25 결과를 자기 보고가 아닌 브라우저 실측으로 다시 확인하고, 실측에서 나온 잔여 결함만 고친다.
운영 배포·공용 DB 시드·커밋/푸시는 하지 않는다.

| id | 내용 | domain | D1/D2/D3/D4 | tier | 실행 |
|---|---|---|---|---|---|
| R1 | 4부서×9탭 실측 재검토 | review | 2/2/0/2=6 | powerful | main (최종 리뷰, 위임 금지) |
| F1 | 스크롤바 표준 속성이 커스텀 디자인을 덮는 문제 | mechanical | 0/0/0/0=0 | fast | worker·haiku |
| F3 | 원장·문서 집계 문구(결정/보류 분리) | mechanical | 0/0/0/0=0 | fast | worker·haiku |
| F2 | 대시보드 기록 항목 선택 UI·종류 아이콘·이동 링크 | frontend | 2/1/0/2=5 | powerful | main (모호한 판단) |
| F4 | 문서 평가 빈 화면(영업 번들 + 타 부서 안내) | frontend | 2/1/1/2=6 | powerful | main (모호한 판단) |
| V1 | lint·test·빌드·재실측 | qa | 0/1/1/1=3 | balanced | main |

## 게이트

- G1 완전성: PASS
- G2 오버라이드: PASS — 최종 리뷰(R1)·모호한 판단(F2·F4)은 powerful + 위임 안 함
- G3 클램프: PASS — mechanical 0점 fast, frontend 5~6점 powerful, qa 3점 balanced
- G4 비용: PASS — powerful 3/6(50%)로 30% 초과. 근거: R1은 하드 오버라이드(최종 리뷰). F2는 "눌렀을 때 무엇이 보여야 하는가"가 명세에 없어 목표만 있는 작업(D1=2·D4=2). F4는 인용 검증 불변식(quote ⊂ 원문)을 지키는 합성 콘텐츠 설계라 규칙 적용이 아니라 선택이다.
- G5 안전: PASS — D3=2 노드 없음

결과: **PASS**
