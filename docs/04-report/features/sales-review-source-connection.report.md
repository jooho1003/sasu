# `/pdca report sales-review-source-connection` — phase 38 로컬 완료

[PRD AG-04](../../PRD.md)와 [ADR-077](../../ADR.md)에 따라 기존 `items`/`sources`를 영업 화면에 읽기 전용으로 연결했다. 팀장은 고객 요청·기존 견적·변경 견적·원칙 원문 4건을 고르고 현재 권한으로 재검사한 원문 일부와 원문 링크를 본다. 선택은 저장하지 않으며 기존 합성 검토 동선은 유지한다.

[실행 기록](../../verification/sales-review-source-connection-2026-09-30.md): 대상 단위 7/7, 전체 단위 1,725/1,725(추가 테스트 전), 인증 브라우저 1/1, 합성 회귀 1/1, 게스트 5/5, 빌드·lint 통과. [완료 화면](../../verification/sales-review-source-connection-2026-09-30.png)을 저장했다. [설계 대조](../../03-analysis/sales-review-source-connection.analysis.md)는 11/11이다.

실제 고객 자료의 업무 적합성·가격 해석·생성형 검토는 검증하지 않았고, phase 38 코드는 운영에 반영하지 않았다. Graft·Archify 도구 결과는 없다.
