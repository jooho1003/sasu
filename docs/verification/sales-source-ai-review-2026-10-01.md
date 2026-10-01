# 실제 영업 자료 AI 근거 선택·검토 질문 검증 — 2026-10-01

phase41 구현은 사용자가 선택한 네 현재 자료에서 AI가 주제별 문단 범위를 고르고, 코드가 정확한 인용과 고정 확인 질문을 복원한다. SQL/RLS는 현재 요청자 권한과 원문 버전을 요청·처리·완료·읽기에서 재검사한다. 원문이나 생성 문장은 task/job에 복제하지 않는다. 이 기능과 0068은 로컬 검증만 했으며 운영 배포에 포함되지 않는다. phase38~40 운영 반영은 [별도 기록](sales-source-tools-production-2026-10-01.md)이다.

## 실행 결과

| 검사 | 명령·결과 |
|---|---|
| TDD red | 새 pure/pipeline 테스트 각각 없는 모듈 import로 실패 확인 후 구현 |
| 최종 full unit | `node node_modules/vitest/vitest.mjs run --config .vercel/review-qa/checklist-vitest.config.mts --configLoader native`: 171파일·1,775건 통과 |
| SQL 현재권한·버전 | `node scripts/verify-security-sql.mjs <isolated-pglite>`: 308건·권한 조합 2,016건 통과 |
| local schema | `node scripts/review-qa.mjs setup`: 격리 Supabase에 0068 적용 |
| lint | `npm run lint`: 종료0, 문구 차단0·기존 경고80 |
| 최종 build | `node scripts/review-qa.mjs build --webpack`: 화면 안내 정리 후 compile16.3초·TypeScript5.9초·정적38페이지 통과 |
| 실제 모델 | `node scripts/review-qa.mjs source-ai-model`: Groq gpt-oss-120b 합성3사례 통과 |
| 신규 E2E | `review-qa.mjs guest-test tests/e2e/sales-source-ai-review-local.spec.ts --grep '선택한 네 자료\|검토 실패'`: 2/2, 10.6초 |
| 기존 회귀 | guest + sales-review/local·revision·sources·literal-comparison·condition-checklist: 11/11 |

native Vitest 설정은 기존 alias·include/exclude·node 환경과 동일하며 임시 ignored 경로에만 둔다. 본 검증의 빌드는 webpack이다. 운영 Git 연동 phase40 빌드는 별도 성공했다. SQL WASM은 pg_cron/pg_net이 없어 0004를 제외했으며 해당 migration은 새 변경 대상이 아니다.

## 현재권한·인용·실패

SQL 19개 새 검사는 atomic task/job·멱등, member/outsider/미동의/demo, 잘못된 IDs/hash, 본인 RLS/직접 쓰기/worker RPC 거절, 삭제/본문 변경/비활성/원칙 해제, 권한·동의 회수, 소스 부서 이동·현재 demo 전환, UTF16/문단 한도, terminal/2분/완료 중 변경/KST 한도를 검사한다.

브라우저는 202→폴링→ready와 실제 Groq 실행을 확인했다. 저장 결과는 번호뿐이며 인용에 할인 미승인·납기 미확정 문단 전체가 보존됐다. 원문 열기·390px·member403·본문 변경404·focus 재조회로 이전 인용/원문 대조 제거·재선택·lead 강등403을 확인했다. 합성 검토 task 수는 15→15로 유지됐다. 테스트는 자신이 만든 local task/job/원문만 제거한다.

무근거·failed·500은 인용을 남기지 않는다. Playwright clock과 응답 보류로 POST/GET이 끝나지 않을 때도 121초 후 watchdog이 중단하고 선택/버튼 잠금을 해제하는 것을 확인했다.

첫 E2E는 연결 응답 전에 test가 권한을 바꾸는 순서 오류와 이름 없는 combobox 선택 때문에 실패했다. 연결 완료를 기다리고 역할별 이름으로 선택하도록 수정했다. PDCA 리뷰에서 별도로 찾은 stalled-fetch watchdog 누락은 코드 수정→재빌드→재실행으로 해소했다. 실패 기록을 성공으로 대체해서 주장하지 않는다.

## 산출물

- [모델 선택·체크](sales-source-ai-review-2026-10-01-model.json): 정상 부정 조건 ready, 무관련 refused, 출력 조작 지시 제외 ready. 번호 출력만 기록하고 원문은 합성 코드 사례에 있다.
- [인증 실행 체크](sales-source-ai-review-2026-10-01-runtime.json)
- [데스크톱](sales-source-ai-review-2026-10-01.png) · [390px](sales-source-ai-review-2026-10-01-mobile.png): 직접 이미지로 레이아웃·문단/부정어·원문 링크 확인.
- [설계 비교](../03-analysis/sales-source-ai-review.analysis.md) · [보고](../04-report/features/sales-source-ai-review.report.md)

## 의존 관계와 누락 범위

실제 import/호출을 따라 contracts→sales-source-review→answer-grounding, pipeline→llm/SQL, worker→jobs→pipeline, SalesReviewSources→SalesSourceAiReview→세션 API를 확인했다. 구조 Mermaid는 [설계](../02-design/features/sales-source-ai-review.design.md)에 있다. Graft/Archify MCP가 노출되지 않았고 Get-Command에서도 실행 파일을 찾지 못해 두 도구의 실제 그래프/렌더 산출물은 없다.

본 결과는 합성 자료의 기능·권한 검증이다. 실제 고객 자료의 관련성·업무 적합성을 평가한 기록이 아니다. 이미 열린 결과의 권한 변경은 focus/후속 요청에서 재확인하며 실시간 철회 push는 없다. 대형 원문은 부분 처리하지 않고 422로 거절한다. 가격·계약 승인·고객 발송은 구현하지 않았다.
