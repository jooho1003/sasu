# `/pdca analyze sales-review-source-connection` — 2026-09-30

원천: [PRD AG-04](../PRD.md), [plan](../01-plan/features/sales-review-source-connection.plan.md), [design §11](../02-design/features/sales-review-source-connection.design.md), [실행 기록](../verification/sales-review-source-connection-2026-09-30.md).

| 설계 대비 항목 | 결과 |
|---|---|
| 1. 동의한 비데모 lead의 현재 세션 검증 | 일치 |
| 2. GET 후보의 기존 `items`/`sources` RLS 사용 | 일치 |
| 3. 최근 후보와 원칙 후보 병합·중복 제거 | 일치 |
| 4. POST strict 4 ID·중복 거절 | 일치 |
| 5. 같은 부서·미삭제·활성·원칙 재확인 | 일치 |
| 6. 원문 부분 문자열만 미리보기 | 일치 |
| 7. 직접 원문 링크 | 일치 |
| 8. 서버/DB 선택 무저장·LLM 없음 | 일치 |
| 9. 팀원·게스트 거절/무쓰기 | 일치 |
| 10. 기존 합성 검토 유지 | 일치 |
| 11. 단위·브라우저·게스트·lint/build 실행 기록 | 일치 |

**일치율 11/11 = 100%.** Graft·Archify는 호출 환경에 없어 수동 관계·Mermaid로 한정했다. 실제 고객 자료 검증과 운영 반영은 설계 범위 밖이다.
