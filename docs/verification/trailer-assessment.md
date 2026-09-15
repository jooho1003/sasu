# 합성 지원자 채점 로컬 검증

> 후속 운영 적용과 실제 B 검증은 [O10~O12 운영 기록](O10-O12-production.md)을 참조하세요. 아래는 운영 적용 전 로컬 검증 당시의 기록입니다.

2026-09-15. phase 12 step 0~4 구현. 운영 migration·시드·발행·실제 지원자 데이터 쓰기는 실행하지 않았다. 실제 Groq 평가는 합성 데이터만 사용했고 `llm_calls` insert를 모킹해 운영 DB 쓰기는 0건이다.

## 실행 결과

| 검증 | 결과 |
|---|---|
| 단위 테스트 | 최종 67 파일, 909 테스트 통과 |
| SQL 하니스 | 109 통과, 실패 0. 권한 조합 2,016개. 격리 PGlite, pg_cron/pg_net 제외 |
| `npm run lint` / `npx tsc --noEmit` / `npm run build` | 모두 통과 |
| `E2E_BASE_URL=http://127.0.0.1:3117 npm run e2e -- tests/e2e/trailer-assessment.spec.ts tests/e2e/trailer-publish.spec.ts tests/e2e/org-admin.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts` | 20 통과, B 그룹 7 skipped, 24.9초 |
| `npm run e2e:trailer` | 기존 공간 체험 회귀 6 통과, 1.4분 |
| 실제 합성 eval | 마지막 실행 5/5 통과, 43초. 공급자 호출 7회(형식 재시도 포함), DB 쓰기 0 |
| UI 렌더 검사 | 제출순·기본 접힘·고정 문구·scores 모드 질문 DOM 없음·잘못된 참조 차단 테스트 통과 |
| UI 시각 확인 | 1440px/390px 합성 SSR 픽스처, 가로 넘침 0. 실제 DB 연동 화면/생성 스냅샷은 아님 |

스크린샷: [1440px](trailer-assessment-ui-1440.png), [390px](trailer-assessment-ui-390.png). 첫 행 상세는 시각 확인을 위해 수동으로 열었다. 실제 기본 상태는 모든 상세가 접혀 있다.

## 실제 모델 평가

마지막 결과: [평가 JSON](evaluation-results/trailer-assessment-2026-09-14T22-48-03-829Z.json). 파일명은 UTC, 실행일은 한국시간 9월 15일이다.

| 제출 | 코드가 계산한 총점 / 5 | 검증 후 금지어 |
|---|---:|---:|
| 합성 지원자 A | 4.20 | 0 |
| 합성 지원자 B | 1.30 | 0 |
| 합성 지원자 C | 3.20 | 0 |
| 특성 변형 A | 3.30 | 0 |
| 특성 변형 B | 3.50 | 0 |

유효 점수의 모든 근거가 제출 이유의 문자열 포함·이벤트 seq 존재·선택 사실 id 존재로 검증됐다. 직무 무관 특성 변형 간 차이는 **0.20 ≤ 0.5**. 결과의 키 화이트리스트도 통과했다. 검증 전 모델 출력에는 금지어가 총 6회 등장했고 검증 후 0회다. 모델 자체가 금지어를 전혀 생성하지 않는다고 주장하지 않는다.

앞선 실패 실행도 보존했다: [첫 실행](evaluation-results/trailer-assessment-2026-09-14T22-41-25-326Z.json), [두 번째 실행](evaluation-results/trailer-assessment-2026-09-14T22-45-52-901Z.json). 첫 실행은 HTTP 단계의 스키마 거부로 3건이 실패했다. 기존 게이트웨이의 JSON 파싱 실패 1회 재시도를 공급자의 HTTP 스키마 거부에도 동일하게 적용하고 단위 테스트로 확인했다. 두 번째 실행에서는 기존 합성 사실집의 `추천 상품` 인용도 금지어 검사에 걸렸다. 모델 출력 예외를 추가하지 않고 인용에도 금지어 검사를 적용했다. 프롬프트에 근거 필드의 정확한 이름·nullable 규칙을 명시했다. 두 실행 모두 특성 변형 한쪽이 형식 오류여서 점수 차이를 계산할 수 없었으며 통과로 기록하지 않았다. 임계값·총점 계산식은 변경하지 않았다.

## PRD §11 매핑

| 조건 | 실행 근거 |
|---|---|
| 실제 지원자 off를 service RPC·직접 insert 모두 거부 | SQL `assessment candidate is disabled…`; 작성한 E2E B 차단 검사 |
| 불변 제출·멱등 재실행·기준 RLS | SQL `assessment creation…`, `assessment RLS…`, cascade 및 0028→0027→0026 rollback |
| 점수 근거 ① 이유 ② 이벤트 ③ 선택 사실 검증 | `trailer-assessment.test.ts`; 실제 eval `validEvidence=true` |
| 미확인 대화·사실은 질문 근거로만 사용 | `trailer-assessment.test.ts`; 모델 출력 검증 함수 |
| 금지어 0 / 고정 안내만 예외 | 기준·질문·인용 필터 단위 테스트; 실제 eval 검증 후 0 |
| 특성 차이 ≤ 0.5 | 실제 eval 마지막 실행 0.20 |
| 총점 코드 계산·근거 없는 기준 0 반영 | 기존 `agent-role.test.ts`, `pipeline/trailer-score.test.ts`, 스냅샷 총점 조작 거부 |
| 제출순·수동 점수 정렬·점수 등급 없음 | `trailer-score-view.test.ts`; E2E B 작성(미실행) |
| 게스트 LLM·쓰기 0 | public 세션만 조회, 쓰기 UI 없음. E2E B 운영 행 수 검증은 O12 필요 |
| 실패 상태·10분 timeout | `jobs.test.ts`, `pipeline/trailer-score.test.ts` |
| 실제 스냅샷만 시드 | 스크립트 작성, 파일 없으면 건너뜀. `trailer-snapshot.test.ts`, `seed-demo.test.ts` |

## O12 인계

1. O10·O11을 완료하고 실제 데모 발행본을 검토·시드한 뒤 0028을 적용한다. `supabase db push --dry-run`으로 범위를 먼저 확인한다.
2. `SASU_TRAILER_SCORES_MODE=off`로 배포한다. Vercel CLI가 없으면 `npm i -g vercel` 설치를 권장한다.
3. `npx tsx scripts/score-demo-attempts.ts --trailer cccccccc-cccc-4ccc-8ccc-cccccccccf01 --out fixtures/trailer/demo-attempts.snapshot.json`을 실행한다. 데모 조직의 발행본만 허용하며 kind는 synthetic이다. 결과에 kind도 저장해 시드가 이를 검증한다.
4. 담당자가 근거·금지어·제출순 표시를 검토하고 실제 스냅샷을 커밋한 뒤 `npx tsx scripts/seed-demo.ts` 실행. 시드가 결과 근거와 총점을 다시 검증한다. 채점 스냅샷이 없으면 건너뛴다.
5. QA 계정과 합성 결정 준비: `npx tsx scripts/seed-qa-org.ts --reset`. B 차단 검사는 데모 시나리오를 복사한 일회성 QA 예고편을 준비하고 검사 후 지운다. 실제 생성 결과나 공개 발행으로 취급하지 않는다.
6. 발행 on·점수 full로 로컬 빌드/서버를 시작하고 `E2E_ALLOW_EXTERNAL_WRITES=1`, `E2E_ASSESSMENT_DB=1`을 설정해 `tests/e2e/trailer-assessment.spec.ts` 실행. `scores` 비교용 서버가 있으면 `E2E_BASE_URL_SCORES`도 설정한다. 이번 로컬 작업에서는 B를 실행하지 않았다.
7. 확인 후 Vercel `SASU_TRAILER_SCORES_MODE=full`을 적용·배포한다. 파일럿의 `trailer_assessment_enabled`는 false를 유지한다. 실제 지원자 제출·초대·동의 화면은 없다.

9/19 09:00 컷 ①은 `scores`, 컷 ③은 `off`. 컷 ③에서 운영에 0028이 있다면 진행 중인 채점 job이 끝나고 남은 채점 job이 없는지 확인한 뒤 전용 down SQL을 적용하고 off 코드와 함께 배포한다. 0027·0026 롤백은 별도 판단이다. 현재 앱은 0026 관리자 응답에 예고편 필드가 없는 경우 닫힌 기본값으로 읽고, 게스트 시드는 아직 없는 후속 테이블의 정리만 건너뛰므로 단계별 적용이 가능하다.

합성 평가 한 번의 통과는 실제 채용 효과·타당성 또는 반복 실행의 동일 점수를 보장하지 않는다. 실제 운영 발행본과 점수표의 end-to-end 검증은 O11/O12에 남아 있다.
