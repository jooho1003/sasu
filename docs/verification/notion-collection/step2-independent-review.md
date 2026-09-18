# 노션 연결 독립 검토 — 2026-09-18

사용자 지시: 다른 세션에서 Phase 25 step 2를 구현 중이므로 이 세션은 검토·독립 검증을 담당한다. 구현 완료·운영 반영을 판정하지 않는다.

**최신 상태(08:58 KST 재실행):** 데모 조직의 외부 호출 선행 문제는 회귀 probe 통과로 바뀌었다. JSON null 예외는 여전히 재현된다. 아래 최초 검토 기록을 보존하며 [후속 결과](#후속-재검토-0858-kst)를 우선 참고한다.

## 구현 세션에 전달할 사항

1. **수정됨 — 중첩 토큰 컨텍스트의 조직 권한 조회 생략.** `lib/notion-workspace.ts`의 `if (workspaceStorage.getStore()) return action()` 때문에 A 조직 컨텍스트 안에서 B 부서/해지된 설치를 요청해도 A 토큰을 재사용했다. `tests/notion-workspace-review.test.ts`의 중첩 조회 2건에서 먼저 실패를 재현했고, 조건문 1개를 제거한 뒤 통과했다. 사용자에게 다른 세션 여부를 확인하기 전에 적용한 유일한 제품 코드 변경이며, 이후 제품 코드는 수정하지 않는다. 중첩 호출도 SQL RPC를 다시 확인하도록 유지해야 한다.
2. **P1 · 재현됨 — 데모 조직의 외부 호출 선행.** 현재 `POST /api/admin/notion`은 세션의 `admin_org_id()`만 확인한 후 Notion `/users/me`를 호출한다. 이 RPC는 `orgs.is_demo`를 확인하지 않는다. 고정 데모 reviewer ID는 proxy가 차단하지만, 다른 ID의 데모 조직 관리자는 SQL 저장 거부 전에 외부 호출이 실행된다. PRD NOT-01 및 §8의 데모 조직 Notion 호출 0 조건과 충돌한다. 외부 호출 전 세션 RPC에서 데모 조직을 거부해야 한다(요청 본문의 flag로 판별하지 말 것).
3. **P2 · 재현됨 — JSON null 입력.** `request.json()` 결과를 타입 단언한 뒤 `body.token`에 접근하므로 JSON `null`은 400 대신 예외가 발생한다. `lib/contracts.ts`의 Zod 계약으로 객체·토큰·attested를 검증하면 null과 배열도 일관되게 거부할 수 있다.
4. **전환 회귀 확인 필요.** 08:01 실행 시 `tests/notion.test.ts` 7건은 전역 NOTION_TOKEN에 의존해 실패했다. 어댑터에서 fallback을 제거한 것은 설계대로다. 기존 API 응답 검증 테스트를 `runWithNotionAuth`로 감싸 의도를 보존해야 한다. 다른 세션이 작업 중이므로 최종 결함으로 판정하지 않는다.

## 현재 실행 근거

- `npx vitest run tests/notion-installation-review.test.ts tests/notion-workspace-review.test.ts`: 조직·워크스페이스 AAD, 암호문 변조, 잘못된 키, 동시 토큰 격리, 전역 토큰 거부, 중첩 조직 변경·해지 조회를 검증한다. 최초 중첩 2건 실패 → 제품 코드의 조회 생략 제거 후 통과.
- `node scripts/review-notion-isolation.mjs`: **실제 로컬 Supabase PostgreSQL에서 16개 SQL assertion 통과**. 테이블 직접 SELECT/INSERT 차단, credential 저장 RPC 브라우저 호출 차단, 다른 조직·일반 멤버·내용 권한 없는 관리자 격리, 데모 설치 거부, 워크스페이스 중복 거부, 해지 후 토큰 제거·소스 중단·다른 조직 유지 확인. 기존 `supabase_db_review-qa` 컨테이너만 사용하며 모든 fixture와 임시 migration은 트랜잭션 rollback. 운영 접속·외부 Notion 호출 없음.

## 코드 관계·도구

- 관리자 API → 세션 `admin_org_id` → 요청 범위 Notion 인증 → `/users/me` → AES-GCM 암호화 → service role 설치 저장 어댑터.
- 부서/작업 → SQL 설치 조회 → AAD로 복호화 → `runWithNotionAuth` → Notion 읽기. 호출 범위가 중첩돼도 같은 조회 경계를 유지해야 한다.
- Graft·Archify 도구는 이 세션의 도구 목록/PATH에서 발견되지 않았다. 실제 코드·테스트·SQL로 확인했으며 도구 실행 산출물은 없다.
- Notion 인증 조회 계약은 2026-09-18 [공식 /users/me 문서](https://developers.notion.com/reference/get-self) 확인. 실제 테스트 워크스페이스 토큰 호출은 하지 않았다.

## 파일 충돌 기록

검토 시작 시 `tests/notion-installation.test.ts`, `tests/notion-workspace.test.ts`를 신규 작성하려는 순간 다른 세션의 같은 경로가 생성되어 충돌했다. 이 세션의 테스트를 `*-review.test.ts`로 이동해 경로를 분리했고, 08:01 이후 원래 경로에 구현 세션의 테스트가 다시 작성된 것을 확인했다. 이후 기존 테스트를 덮어쓰지 않는다.

## 최종 독립 검증 (08:06 KST)

| 명령 | 결과 |
|---|---|
| `npx vitest run tests/notion-installation-review.test.ts tests/notion-workspace-review.test.ts` | 2 files / 6 tests 통과 |
| `node scripts/review-notion-isolation.mjs` | 로컬 Supabase SQL assertion 16개 통과, 전부 rollback |
| `npx vitest run --config docs/verification/notion-collection/vitest.review.config.ts` | 2개 실패 재현: null 입력 TypeError, 데모 조직에서 외부 검증 함수 호출 1회 |
| 변경한 독립 검토 파일 대상 `npx eslint` | 통과 |
| `npx tsc --noEmit --incremental false` | 통과 |
| `git diff --check` | 오류 없음, 기존 CRLF 경고만 |

실패 재현 테스트는 별도 `*.spec.ts` 및 review config로 실행한다. 기본 Vitest 목록에는 포함되지 않으므로 구현 세션의 일반 회귀 테스트와 혼동하지 않는다. 외부 호출은 전부 mock이며 실제 Notion 요청은 0건이다. 이 두 문제가 해결되면 같은 명령으로 2 passed를 확인하고 기본 회귀 목록 편입 여부를 구현 세션에서 정하면 된다.

전체 lint/build/E2E와 phase 완료 처리는 동시에 작업 중인 구현 세션의 최종 검증으로 남긴다. 이 기록만으로 step 2 완료나 배포 승인을 주장하지 않는다.

## 설계 대비 남은 개발

- Phase 25: step 2 조직별 연결 구현 중. 이후 import-v2(기존 source 호환), 자동 발견·동의 게이트, bulk 레인, 증분/삭제, 관리 UI, OAuth/webhook 순서. 공개 통합 개통은 별도 외부 검증이 필요하다.
- Phase 23: 보안·원본 접근 로컬 검증은 있으나 실제 녹음 장치/중단 복구·보안 게이트가 남음. 부분 완료를 녹음 기능 완성으로 표시하면 안 된다.
- Phase 14: 인용 표시 구현은 완료 기록이 있고 운영 Slack 검증·캡처가 남음.
- 상태 문서: 최상위 `phases/index.json`에는 phase 23·24가 없고, phase 25의 verification 경로인 `docs/verification/notion-collection/README.md`는 검토 시점에 존재하지 않았다. 구현 세션에서 step 기록 정리 시 인덱스와 링크를 함께 맞출 필요가 있다.

## 후속 재검토 (08:58 KST)

페르소나 검토 중 다른 세션의 phase25 step2 완료 기록을 확인해 기존 실패 probe와 관련 회귀를 다시 실행했다. 제품 코드는 변경하지 않았다.

| 명령/검사 | 결과 |
|---|---|
| `npx vitest run tests/notion-installation-review.test.ts tests/notion-workspace-review.test.ts tests/notion.test.ts tests/notion-admin-route.test.ts` | 4 files / 21 tests 통과. 전역 토큰 fallback 전환 관련 어댑터 회귀도 통과 |
| `npx vitest run --config docs/verification/notion-collection/vitest.review.config.ts` | 1 passed / 1 failed |
| 데모 외부 검증 차단 probe | 통과. route가 `admin_notion_installation` eligibility RPC 실패를 `/users/me` 전에 거부. SQL 함수의 is_demo 거부도 코드에서 확인 |
| JSON null probe | **실패 유지**. `app/api/admin/notion/route.ts:62`, `body.token`에서 TypeError. 객체/Zod 검증 필요 |

외부 호출은 모두 mock이며 실제 Notion 호출·운영 배포·DB 변경은 없다. phase25 index는 step0~2 completed, step3~8 pending, production_deployed=false로 바뀌었고 verification README도 이제 존재한다. 완료 상태와 전체 검증 수치는 구현 세션의 기록이며 이번 독립 재검토가 모두 재실행한 뜻은 아니다. 이 후속 결과는 위 08:06 실패2건 상태를 대체한다.
