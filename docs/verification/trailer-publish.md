# 예고편 발행 로컬 검증

> 후속 운영 적용과 실제 B 검증은 [O10~O12 운영 기록](O10-O12-production.md)을 참조하세요. 아래는 운영 적용 전 로컬 검증 당시의 기록입니다.

2026-09-15. phase 11 step 0~7 로컬 구현. 운영 migration·배포·시드·스냅샷 생성·실제 Groq 호출은 실행하지 않았다. 실제 발행본과 게스트의 생성 과정 화면은 O11 검증 전이다.

## 실행 결과

| 검증 | 실제 결과 |
|---|---|
| `npm run lint` | 통과 |
| `npx tsc --noEmit` | 통과 |
| `npm run test` | 62 파일, 880 테스트 통과 (phase 11 기준) |
| `npm run build` | 통과. `/t/[slug]`, 부서 목록·생성·검토는 동적 렌더 |
| `node scripts/verify-security-sql.mjs D:/바이브코딩/.sasu-qa-db` | phase 11: 104 통과, 실패 0. 기존 권한 조합 2,016개. 격리 PGlite, pg_cron/pg_net 제외 |
| `npm run e2e:trailer` | 기존 공간 체험 6 통과, 1.4분 |
| `E2E_BASE_URL=http://127.0.0.1:3116 npm run e2e -- tests/e2e/trailer-publish.spec.ts tests/e2e/org-admin.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts` | 19 통과, B 그룹 5 skipped, 21.4초 |

첫 E2E에서 off 상태의 부서 URL이 상위 레이아웃의 로그인 리다이렉트로 200이 되는 문제가 나왔다. Proxy에서 해당 비활성 경로를 인증 전 404로 닫고, 새 빌드·서버로 다시 실행해 통과했다. Playwright의 CommonJS 실행과 `import.meta`가 충돌한 테스트도 수정했다. 실패한 실행을 통과로 집계하지 않았다.

발행 플래그 on의 로컬 서버(3126)에서는 부서 예고편 URL에 비로그인 요청을 보내 `307`, `Location: /login`을 확인했다. 운영 DB에는 0027을 적용하지 않았으므로 실제 생성·승인·발행 흐름은 이 확인에 포함되지 않는다. 후속 phase 12까지 구현한 최종 공통 검증은 단위 909개, SQL 109개, E2E A·회귀 20개 통과이며 해당 기록은 `trailer-assessment.md`에 있다.

## PRD §11 근거 매핑

| 완료 조건 | 검증 위치 |
|---|---|
| 후보는 같은 부서 공개·최신 정정본 | SQL `trailer candidates…`; 라우트 13 테스트; B 첫 흐름 |
| 생성 입력 최소화·비식별 검사 | `pipeline/trailer-inputs.test.ts`, `trailer-generation.test.ts`, `trailer-gate.test.ts` |
| 스키마·인용 실패 재시도 1회와 실패 상태 | `pipeline/trailer-generate.test.ts`, `jobs.test.ts` |
| 조직 허용·검사 해시·전 항목 승인 | SQL `publication requires…`, `scenario trigger…`, golden fixture `trailer-approval.json` |
| 수정·오래된 검사·승인 무효화 | SQL `gate reports…`, `trailer updates…`; `trailer-routes.test.ts` |
| 공개 payload 키 2개·스키마 fail closed | SQL `published scenario edits…`; `trailer-public.test.ts`; B 공개 조회 |
| 철회 즉시 무효·재발행 새 slug | SQL `unpublishing invalidates…`, `only organization admins…`; B 철회·재발행 |
| 일일 20회·직접 RPC 우회 차단 | SQL `trailer generation counter…`; B 직접 RPC 21회 |
| 데모 발행본은 실제 파이프라인 결과·원문 겹침 0 | `trailer-snapshot.test.ts`; 작성한 스냅샷 스크립트; B 게스트 검증은 미실행 |
| 게스트 읽기만·LLM/쓰기 0 | public 클라이언트만 사용. B 해당 검증은 O11 필요. 기존 guest E2E는 통과 |
| 컷 플래그·기존 체험 보존 | A 그룹 5 테스트; `site.test.ts`; 기존 체험 6 테스트 |
| 권한·롤백 | SQL RLS/함수 grant 및 0027 → 0026 down 검증 |

공개 화면은 분석·저장 요청을 추가하지 않았다. 관리자/부서장 쓰기는 세션 클라이언트의 RPC만 사용하며 org·dept·creator를 요청 본문에서 받지 않는다. 원문은 검토 화면의 세션 읽기와 생성 워커의 제한된 필드 조회에만 존재한다. 검사 보고서에는 경로·규칙만 저장한다.

## O11 실행 순서

1. O10을 먼저 완료한다. migration 상태를 확인하고 0027만 적용한다. 이후 0028 파일까지 있는 현재 트리에서는 `supabase db push --dry-run`으로 범위를 확인하고 승인 범위만 담은 체크아웃으로 실행한다.
2. 발행 플래그 off 상태로 배포한다. Vercel CLI가 없다면 `npm i -g vercel` 설치를 권장한다.
3. 데모 개발팀(`cccccccc-cccc-4ccc-8ccc-cccccccccccc`)의 공개 결정 id 1~3개로 `npx tsx scripts/snapshot-demo-trailer.ts --dept <dept> --decisions <ids> --out fixtures/trailer/demo-trailer.snapshot.json` 실행.
4. 담당자가 검사 결과·가상화 품질·금지어를 검토한 뒤 스냅샷을 커밋한다. 이 파일을 손으로 만들지 않는다.
5. `npx tsx scripts/seed-demo.ts`, QA 계정 env를 채운 뒤 `npx tsx scripts/seed-qa-org.ts --reset` 실행. 시드는 없는 후속 migration 테이블의 정리만 건너뛰고, 존재하는 테이블의 오류는 중단한다.
6. `SASU_TRAILER_PUBLISH_ENABLED=true`, `SASU_ORG_ADMIN_MODE=on`으로 **빌드 및 서버 재시작** 후 `E2E_ALLOW_EXTERNAL_WRITES=1`, `E2E_TRAILER_DB=1`을 설정해 B 테스트 실행. static/ISR 메인·데모 링크는 빌드 시점 플래그의 영향을 받는다. 테스트 마지막 QA reset은 합성 QA 데이터에만 적용한다.
7. Vercel `SASU_TRAILER_PUBLISH_ENABLED=true`, `SASU_TRAILER_DEMO_PATH=/t/onsaemiro2026demotrail` 설정 후 배포하고 `/`, `/demo`, 공개 체험 링크를 확인한다. 파일럿 조직 공개 허용은 자동으로 켜지 않는다.

자동 검사는 바꿔 쓴 문장이나 수치·전략 노출을 판단하지 못한다. 검사 통과와 별개로 항목별 공개 승인이 필요하다. 현재 저장소에는 실제 생성 스냅샷이 없으므로 데모 발행본 시드는 안내 후 건너뛴다.
