# 본인 실자료 검토 이력·재열람 검증 — 2026-10-01

phase 42는 현재 볼 수 있는 본인의 AG-07 작업을 최신순 목록에서 찾아 다시 연다. 세션 목록 API와 기존 현재 입력 RLS·상세 인용 복원을 재사용한다. 새 migration·task/job·LLM 호출·원문 복제는 없다. phase 41과 42 모두 이번 기록에서 **개발·격리 로컬 검증 완료이며 운영 미반영**이다.

## 최종 실행 결과

| 검사 | 실행·결과 | 로컬 로그 |
|---|---|---|
| 목록 API 선행 테스트 | 없는 Route import red → 목록/API 기존 상세 2파일 25/25 green (신규 13건) | .vercel/phase42-route-red.log, phase42-route-green.log |
| 전체 단위 | `node node_modules/vitest/vitest.mjs run --config .vercel/review-qa/checklist-vitest.config.mts --configLoader native` — 172파일 1,788/1,788, 48.03초 | .vercel/phase42-unit.log |
| 기존 현재 권한 SQL | `node scripts/verify-security-sql.mjs 'C:/Users/이주호/AppData/Local/Temp/sasu-pglite-phase36'` — 308/308·권한 조합 2,016건 | .vercel/phase42-sql.log |
| lint·한국어 문구 | `npm run lint` 종료 0, blocking 0·기존 warnings 80 | .vercel/phase42-lint-final.log |
| 최종 React 변경 검사 | `node node_modules/eslint/bin/eslint.js components/sales-source-review-history.tsx components/sales-source-ai-review.tsx components/sales-review.tsx 'app/api/d/[dept]/sales-review/history/route.ts'` 종료 0 | .vercel/phase42-react-lint.log |
| 최종 프로덕션 빌드 | `$env:SASU_VERIFY_BUILD='1'; node scripts/review-qa.mjs build --webpack` 종료 0, compile 64초·TypeScript 32.5초·static 38건, history Route 포함 | .vercel/phase42-build-release-final.log |
| 신규 인증 E2E | 아래 최종 재검사에서 이력 3/3, 14.4초/3.6초/1.8초 | .vercel/phase42-recheck.log |
| 기존 영업·게스트 회귀 | 13개 중 첫 실행 12통과·실제 모델 1실패, 같은 테스트 새 요청 재실행 1/1 통과(9.2초). 총 13개 각각 최종 통과 확인 | .vercel/phase42-regression.log, phase42-recheck.log |

최종 재검사 명령:

```powershell
node scripts/review-qa.mjs guest-test tests/e2e/sales-source-ai-review-local.spec.ts tests/e2e/sales-source-review-history-local.spec.ts --grep '선택한 네 자료|본인 이력|이력 조회 실패|취소한 상세'
```

4/4 통과, 30.9초. 기존 회귀는 `guest-test`에 sales-review-local/revision/sources/literal-comparison/condition-checklist/source-ai-review 파일을 넘겨 실행했다. guest 5·기존 인증 8건을 각각 확인했고 새 이력 3건을 합치면 16개 시나리오다. 전체 회귀 13/13을 한 번에 통과했다고 주장하지 않는다.

## 확인한 동작

- 실제 로컬 Supabase에 같은 microsecond 시각의 본인 작업 22개와 타인/타부서 작업 2개를 합성 준비했다. 20건→2건, UUID 내림차순·커서 끝·타인/타부서 직접 상세 404를 확인했다.
- 새로고침 후 다시 열기, 5상태, 현재 전체 문단·부정어·원문 링크, 실패/무근거 안내, 키보드 초점/화면 이동, 390px 가로 넘침 없음을 확인했다.
- 본문 변경·원문 삭제·소스 비활성·원칙 해제에서 목록과 직접 상세를 숨겼다. 동의 철회/lead 회수는 직접 403이며, 포커스 재확인 때 이전 목록·인용을 제거했다. 제외 건수는 응답/화면에 없다.
- 첫 목록/더 보기 500, 보류된 목록의 30초 종료·늦은 응답 무시, 보류된 상세의 2분 종료·재열람, 취소를 무시한 A 상세 404가 현재 B를 지우지 않는 반례를 실행했다.
- 읽기 전후 `sales_source_reviews`, `sales_review_tasks`, `jobs`, `llm_calls` 수가 모두 같았다. 상세 mocked 테스트도 GET만 발생했다. 원문 fixture 변경은 기존 SQL 트리거가 classify job을 만들므로 **읽기 측정 구간과 fixture 수정 구간을 분리**했다. 현재 테스트가 만든 classify job은 해당 item ID로 정리한다.

## 산출물

- [실제 DB 검사와 읽기 전후 수](sales-source-review-history-2026-10-01-runtime.json)
- [데스크톱](sales-source-review-history-2026-10-01.png) · [390px](sales-source-review-history-2026-10-01-mobile.png): 직접 이미지로 목록·상태·인용·원문 링크·모바일 줄바꿈 확인.
- [설계 비교](../03-analysis/sales-source-review-history.analysis.md) · [완료 보고](../04-report/features/sales-source-review-history.report.md)

## 실패·보완 기록

1. 첫 신규 E2E 3건은 열린 wrapper가 `div`라 ARIA region으로 찾지 못해 실패했다. 의미 있는 `section`으로 고친 뒤 3/3을 통과했고, 열린 결과로 초점/화면 이동을 추가해 최종 재검사도 3/3 통과했다.
2. 추가 원문 삭제 검사 뒤 fixture를 되돌릴 때 삭제 트리거가 비운 본문을 복원하지 않아 목록이 비어 1실패·2통과였다. 격리 합성 fixture의 본문도 복원하고 수정 시 발생하는 classify job을 별도 계수/정리했다. 제품 SQL은 바꾸지 않았다.
3. 독립 리뷰가 취소된 상세의 늦은 403/404 콜백이 현재 표시를 지울 수 있음을 찾았다. POST/poll 모두 JSON 직후 abort 검사를 오류 처리 앞에 두고, 취소를 무시한 응답의 E2E를 추가했다.
4. 기존 실제 모델 회귀 첫 실행은 100초 안에 ready 결과가 나타나지 않았다. 모델 호출 기록은 2,284ms이며 task는 processing이었다. 중간 실패 코드를 확보하지 못했으므로 연결 장애/모델 출력/완료 처리 원인으로 단정하지 않는다. 같은 시나리오의 새 요청 재실행은 9.2초에 통과했다. 최초 실패를 해소된 제품 결함으로 주장하지 않는다.
5. 다른 자동 Next build와 충돌해 첫 최종 빌드가 lock으로 중단됐다. 다른 프로세스는 종료하지 않고 기존 `SASU_VERIFY_BUILD=1` 경로를 사용했다. 격리 첫 빌드의 외부 리소스 연결 재시도 뒤 성공, 마지막 UI 변경 뒤 최종 빌드도 성공했다. Next가 만든 검증 디렉터리의 next-env 경로 변경은 되돌렸다.

## 의존 관계와 제한

실제 import/호출: SalesReview → SalesSourceReviewHistory → history Route → 세션 `sales_source_reviews` 현재 RLS. History → SalesSourceAiReview 읽기 모드 → 기존 ai GET → `sales_source_review_inputs`/buildSalesSourceReview → 현재 정확한 문단이다. 기존 모델/pipeline/job은 이력 호출의 소비자가 아니다. 구조 Mermaid는 [설계](../02-design/features/sales-source-review-history.design.md)에 있다.

Graft/Archify MCP/CLI가 현재 노출되지 않아 실제 그래프·렌더 산출물은 없다. 파일 관계와 Mermaid 대조 범위만 확인했다. 위 SQL의 0004 pg_cron/pg_net은 WASM 미지원으로 제외한 기존 범위다. Python 실행기는 실행하지 않고 작성된 harness step 순서로 주 세션에서 직접 구현·검증했다.

실제 고객 자료의 적합성·업무 효용·성능 SLA·부하·branch coverage는 미측정이다. 열린 화면의 원문/권한 변화는 새로고침·포커스·후속 요청에서 재확인하며 실시간 철회 push는 없다. 목록은 시각·상태로 찾는 첫 버전이며 제목 검색·공유·확인 기록·승인·발송은 포함하지 않는다.
