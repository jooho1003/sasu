# 조직 관리자 구현 검증 — 2026-09-15

> 후속 운영 적용과 실제 B 검증은 [O10~O12 운영 기록](O10-O12-production.md)을 참조하세요. 아래는 운영 적용 전 로컬 검증 당시의 기록입니다.

범위: phase `10-org-admin` step 4~6. 관리자 화면, 초대 수락, 부서장 멤버 관리, 게스트 관리자 화면, 고지, QA 시드·E2E를 구현했다. **로컬 검증 완료, O10 운영 반영 및 B 그룹은 미실행**이다. 기존 step 0~3 산출물과 Claude R10 SQL 보완을 함께 검증했다.

## 실행 기록

| 실행 | 실제 결과 |
|---|---|
| `npm run lint` | exit 0 |
| `npx tsc --noEmit` | exit 0 |
| `npm run test` | 54 files, 822 passed |
| 고지·합성 멤버 TDD | 먼저 3 failed / 8 passed 확인 → 구현 후 11 passed |
| `npm run build` | exit 0. `/admin` 4개 페이지는 요청 시 렌더, `/demo/admin`은 revalidate 60초 |
| `node scripts/verify-security-sql.mjs 'D:/바이브코딩/.sasu-qa-db'` | isolated PGlite, 92 passed / 0 failed, 4조직·12부서·24사용자·72항목·2016개 행렬 검증. pg_cron/pg_net 마이그레이션 제외 |
| 아래 E2E 명령 | **18 passed / 3 skipped, 31.3초**. A 그룹 7개 + 기존 guest 4개·site 3개·team-coverage 4개 통과. B 그룹 3개는 O10에서 실행 |

```powershell
$env:SASU_ORG_ADMIN_MODE = 'off'
npm run start -- --hostname 127.0.0.1 --port 3115
# 별도 터미널
$env:E2E_BASE_URL = 'http://127.0.0.1:3115'
$env:E2E_ALLOW_EXTERNAL_WRITES = '0'
$env:E2E_ORG_ADMIN_DB = '0'
npm run e2e -- tests/e2e/org-admin.spec.ts tests/e2e/guest.spec.ts tests/e2e/team-coverage.spec.ts tests/e2e/site.spec.ts
```

추가 브라우저 확인: 같은 빌드를 `SASU_ORG_ADMIN_MODE=on`, 3125 포트로 시작했다. `/admin` → `/login?next=/admin`. `/invite/abc`는 0026 미적용 DB의 RPC 오류를 일반 안내로 처리하며 원문 오류를 노출하지 않았다. [390px 화면](org-admin-invite-390.png). 유효 초대 수락이나 관리자 실데이터 화면을 통과한 기록은 아니다.

게스트 완주 화면: [1440px](org-admin-guest-1440.png), [390px](org-admin-guest-390.png). 기존 데모 열람 전후 `llm_calls/jobs/items/answers/decisions/citations` 행 수 불변도 통과했다.

수정 중 발견한 문제: off 빌드에서 `/admin`의 404가 정적으로 남을 수 있어 관리자 페이지의 데이터 접근 앞에 `connection()`을 두었다. 수정 빌드에서 4개 관리자 페이지 모두 동적 렌더임을 확인했다. Playwright의 `test.use`를 describe 안에서 지정할 수 없다는 설정 오류는 파일 최상위로 이동해 해결했다.

## R10 조기 리뷰 반영

Claude, 2026-09-15 06:25, F1: 빈 부서에 여러 첫 부서장 초대를 남겨 둔 뒤 부서가 생겼을 때 수락하면 관리자에게 기존 부서 권한을 올리는 경로가 생겼다. SQL이 살아 있는 첫 부서장 초대를 부서당 1개로 제한하고, 관리자발 초대 수락 시 부서 행을 잠근 뒤 멤버 0명을 재검사한다. 하니스 `a spare admin first-lead invite cannot be accepted once the department has members (R10)` 포함 92개 통과.

화면은 같은 부서의 기존 초대를 철회한 후 새 링크를 만드는 동작을 제공한다. E2E B의 여정에 두 번째 이메일로 첫 부서장 초대 → 중복 안내·교체 버튼 확인을 추가했다. 이 B 여정은 아직 실행하지 않았다.

## PRD §11 매핑

| 조건 | 검증 위치·실행 상태 |
|---|---|
| 조직 격리·private 호출 차단·최소 실행 권한 | SQL 하니스 통과 |
| 멤버 있는 부서 첫 초대 거부·관리자 자기 초대 거부·승격 경로 없음 | SQL 하니스 통과, B 여정 준비 |
| 마지막 부서장 해제·제외 거부 | SQL 하니스 통과. B는 단독 부서장의 해제 버튼 미노출·제외 거부·직접 해제 API 거부를 확인 |
| 관리 RPC 화이트리스트·일별 답변 집계 | SQL 하니스 통과, strict Zod 파싱. B의 RPC 테스트 준비 |
| 로그아웃 → 초대 → 로그인 → 표시명 → 수락 → 동의 → 부서 | B 여정 준비, 미실행 |
| 다른 이메일 수락 거부 | SQL 하니스 통과, B의 불일치 화면·로그아웃 폼 확인 준비 |
| `/demo/admin` LLM 0·쓰기 0·이메일 0 | SQL 데모 래퍼 검증 통과, public 클라이언트·readOnly 연결. 실제 데모 시드 후 B에서 검증 필요 |
| off 상태 라우트·API 404, 끊어진 링크 없음 | A 그룹 7개 통과 |
| 게스트·기획·디자인·개발·공개 메인 회귀 | 기존 E2E 11개 통과 |

## O10 실행 순서 — 운영 변경 전 승인 필요

근거: `phases/10-org-admin/step6.md` 금지사항과 PRD §3-2·ARCHITECTURE §6-2 불변식 22. 아래 시드·DB 반영·외부 쓰기 E2E·배포는 이번 세션에서 실행하지 않았다. O10은 0025 적용과 리뷰 통과를 먼저 확인한다.

1. 부서 이름 중복을 읽기 조회로 확인한다.

```sql
select org_id, lower(name), count(*)
from public.departments
group by org_id, lower(name)
having count(*) > 1;
```

2. `npx supabase db push --dry-run`으로 **0026만** 대기 중인지 확인 후 `npx supabase db push`. 0027·0028까지 작성돼 있으면 그대로 실행하지 말고 0026까지의 검증된 체크아웃에서 진행한다.
3. `SASU_ORG_ADMIN_MODE=off`로 배포한다. Vercel CLI가 없으면 `npm i -g vercel` 설치를 권장한다.
4. `.env.local`의 QA 관리자·초대 대상 계정을 서로 다르게 설정한다. `npx tsx scripts/seed-qa-org.ts`와 `npx tsx scripts/seed-demo.ts` 실행 후, 0026이 적용된 동일 프로젝트를 대상으로 테스트한다. **B의 데모 검증은 데모 시드 후** 실행해야 한다. 시드는 데모 `admin_events`가 있으면 삭제하지 않고 중단한다.
5. QA 로컬 빌드·실행·E2E:

```powershell
$env:SASU_ORG_ADMIN_MODE = 'on'
npm run build
npm run start -- --hostname 127.0.0.1 --port 3125
# 별도 터미널
$env:E2E_BASE_URL = 'http://127.0.0.1:3125'
$env:E2E_ALLOW_EXTERNAL_WRITES = '1'
$env:E2E_ORG_ADMIN_DB = '1'
npm run e2e -- tests/e2e/org-admin.spec.ts
npx tsx scripts/seed-qa-org.ts --reset
```

게스트 `/demo/admin`은 ISR이므로 플래그를 바꿀 때 on 값으로 다시 빌드한다. QA 조직 UUID는 `faaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa`. `--reset`은 QA 대기 초대 철회와 초대 대상의 QA 멤버십만 제거하고 부서·관리 기록을 보존한다. 외부 쓰기 환경변수는 검증 후 해제한다.

6. B 통과 후 `SASU_ORG_ADMIN_MODE=on`으로 배포하고 운영 URL에서 재확인한다. 실제 매직링크 이메일 1회 확인은 사람이 수행한다.

한계: B는 `generateLink` → `verifyOtp` → 세션 쿠키 주입으로 메일함을 대신한다. 실제 이메일 전달과 `next` 쿠키 → 인증 콜백을 끝까지 증명하지 않는다. 기존 동의 버전은 ADR-044에 따라 1을 유지했으며, 고지 문장은 웹 상수·슬랙 전문·문서 일치 테스트로 확인했다.
