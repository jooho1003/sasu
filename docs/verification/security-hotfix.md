# 운영 쓰기 경계 보완 — 로컬 검증 기록

- 실행: 2026-09-15 03:20~03:27 KST
- 근거: PRD 1.7 §3-2, ARCHITECTURE §6-2, ADR-042, 상세 설계 §B-4.
- 상태: phase8 step0 로컬 구현·검증 완료. **운영 DB 적용과 쓰기/LLM 연동 E2E는 미실행·승인 대기. 운영의 경계가 이미 수정되었다는 뜻이 아니다.**
- 사용자의 “클로드가 설계 완료하면 개발 이어서” 요청에 따라 파일 변화를 확인했고, Claude 앱의 SASU 세션에서 설계 완료 및 step 작성 대기를 확인했다. 메시지·승인을 대신 전송하지 않았다. `computer-use`는 이 상태 확인에만 사용했다.

## 변경

1. `0025_ingestion_write_boundaries.sql`: departments authenticated 정책을 SELECT 전용으로 교체, anon/authenticated INSERT·UPDATE·DELETE 회수. items INSERT도 회수. can_see(), 원장, 기존 SELECT RLS 및 service_role 수집 권한은 유지.
2. 문서·전사 라우트: 기존 세션 멤버십의 lead 검증, 세션 RPC `is_demo_department`의 명확한 false 확인 후에만 저장. 판정 오류/null은 500, 데모는 403. 소스·메타데이터는 세션으로 쓰며 source 생성이 실패하면 우회하지 않는다.
3. `lib/adapters/upload.ts`: mask() 적용 후 items INSERT·id 반환만 수행. 서비스 클라이언트의 조회나 임의 테이블 쓰기는 없음. 라우트의 service role 직접 import 금지 lint 규칙을 유지한다. 전사 미동의·미등록 발언 제외 유지.
4. 하니스: 0001 직후 Supabase 기본 GRANT를 명시적으로 재현한 뒤 보안 마이그레이션을 적용. 기존 코드에도 ALTER DEFAULT PRIVILEGES가 이미 있었으므로 설계의 “기본 GRANT 미재현”은 현재 코드와 일부 달랐다. 핵심 누락은 두 경계의 거부 테스트였다. 마이그레이션 이후 재GRANT해 REVOKE를 취소하는 방식은 사용하지 않았다.

`bkit:phase-7-seo-security` 체크리스트의 서버 권한·입력 검증·실패 시 정보 노출 제한을 적용했다. Next.js 스킬은 카탈로그 경로의 파일이 없어 기존 프로젝트 패턴을 사용했다. 새 서비스·패키지·환경 변수는 추가하지 않았다.

## 실제 실행 결과

| 실행 | 결과 |
|---|---|
| 수정 전 `npm run test -- tests/upload-write-boundaries.test.ts` | 17개 중 8개 실패: 데모 차단·새 수집 경계 미구현 재현 |
| 수정 전 격리 SQL 하니스 | `Missing expected rejection`: member의 departments.org_id 변경이 거부되지 않음 |
| 신규 어댑터 구현 전 `npm run test -- tests/adapters/upload.test.ts` | 모듈 없음 실패 — 테스트 먼저 작성 |
| 최종 `npm run lint` | exit 0, 오류·경고 없음 |
| 최종 `npm run build` | exit 0, TypeScript 및 프로덕션 빌드 성공 |
| 최종 `npm run test` | 49파일 **773개 통과** (새 업로드/어댑터 테스트 19개 포함) |
| 격리 SQL 하니스 | **67개 통과**, 4조직·12부서·24사용자 읽기/검색 행렬 **2,016개 assertion** |
| `npm run e2e:trailer` | **6개 통과**, 1.4분. 실제 이동·3퀘스트·목록·모바일·비활성404 |
| 기존 guest + team-coverage E2E | **8개 통과**, 25.9초. 1440/390px, 기획·디자인·개발, 실부서 차단, 잘못된 서명 거부 |
| `git diff --check` | exit 0 (CRLF 변환 안내만) |

게스트 E2E는 로컬 새 프로덕션 서버(3112) + 설정된 Supabase의 **읽기 전용** 게스트 조회/행수 확인을 사용했다. 열람 전후 `llm_calls`, `jobs`, `items`, `answers`, `decisions`, `citations` 행 수 불변을 확인했다. 예고편 E2E는 자체 서버 3107/3108 및 메모리 합성 데이터만 사용했다.

SQL 재현 명령 (기존 임시 설치 재사용, 네트워크·env 로드 없음):

```powershell
node scripts/verify-security-sql.mjs 'C:/Users/이주호/AppData/Local/Temp/sasu-qa-db-331add36c77142e9b2e8f09b0ad3d79d'
$env:E2E_BASE_URL = 'http://127.0.0.1:3112'
npm run e2e -- tests/e2e/guest.spec.ts tests/e2e/team-coverage.spec.ts --output=test-results/security-guest
```

하니스 최종 출력:

```json
{"passed":67,"failed":0,"matrix":{"organizations":4,"departments":12,"actors":24,"items":72,"assertions":2016},"database":"isolated PGlite","excluded":["0004_worker_cron.sql (pg_cron/pg_net not available)"]}
```

증거: [게스트 데스크톱](security-guest-1440.png), [게스트 모바일](security-guest-390.png). 각 E2E의 세부 산출물은 `test-results/security-guest/`에 있다(ignored, 다음 실행 시 교체 가능).

## 쓰기 경계 표의 의미와 한계

모든 public 테이블을 열거해 anon/authenticated의 INSERT·UPDATE·DELETE에 대해 테이블/컬럼 GRANT와 허용 RLS 정책이 함께 열려 있는 표면을 고정했다. anon 쓰기 표면은 0개. authenticated의 기존 허용 표면은 다음과 같다:

| 명령 | 기존 허용 표면 |
|---|---|
| INSERT | agent_roles, answers, document_summaries, meetings, sources |
| UPDATE | agent_roles, document_summaries, members(동의·Slack 연결 3컬럼만), sources |
| DELETE | document_summaries, sources |

이는 **각 테이블의 모든 값 변경이 안전하다는 판정이 아니다**. 세부 RLS·트리거 검증은 기존 행위 테스트로 수행한다. 특히 document_summaries의 넓은 기존 쓰기 정책은 이번 두 건 수정 범위에 포함되지 않으며 후속 보안 검토 대상이다. 새 단계가 테이블을 추가하면 기대 표도 명시적으로 검토해야 한다.

## 다음 게이트 (step 0 시점 기록)

- `phases/8-security-hotfix/step1.md`: 사용자가 승인한 환경에서 실제 업로드·세로 슬라이스·권한·역할 E2E. 이들은 DB 쓰기와 LLM/워커 실행을 포함하므로 이번에는 실행하지 않았다.
- 승인 및 검증 후 **0025만** 운영 DB에 반영. 운영 적용 전 코드의 업로드 경로와 마이그레이션을 함께 점검한다.
- phase9~12는 아직 미구현이며 step 파일도 Claude에서 인계되지 않았다. phase7 기존 메타버스형 합성 체험은 그대로 유지한다.
- commit, push, 배포, 운영 마이그레이션, 실제 조직 예고편 발행은 수행하지 않았다.

→ 이후 경과: step 1(업로드 E2E 스펙)과 운영 게이트(O8)는 아래 절에 기록했다. phase 9~12 step 파일은 실행 플랜 `sasu-scope-expansion-2026-09-15`로 작성됐다.

## step 1 — 업로드 쓰기 경계 E2E 스펙 (2026-09-15)

- `tests/e2e/upload-boundaries.spec.ts` 6케이스 + 공용 로그인 `tests/e2e/support/auth.ts`.
- 실행 조건: `E2E_ALLOW_EXTERNAL_WRITES=1`(운영 쓰기·분류/요약 LLM). 마지막 두 케이스(직접 INSERT·`departments.org_id` 변경 거부)는 `E2E_EXPECT_0025=1`일 때만 돈다. 0025 적용 전에 직접 INSERT 케이스가 돌면 마스킹되지 않은 행이 실제로 들어가기 때문이다(성공 시 즉시 삭제하도록 작성).
- 로컬 확인: ESLint 0 · 프로젝트 전체 `tsc --noEmit` 오류 0 · env 없이 6 skipped.
- 작성 주체: Claude(메인). 위임한 서브에이전트가 세션 한도로 파일을 만들지 못해 직접 작성했다.

## R8 리뷰 (Claude, 2026-09-15)

차단 결함 없음.

- 0025: `departments` 정책을 같은 USING의 SELECT 전용으로 교체하고 anon·authenticated 쓰기를 회수했다. `items` INSERT를 회수했다(UPDATE·DELETE는 0015에서 회수됨). 게스트 읽기 정책과 service role은 그대로다.
- 두 업로드 라우트: 부서장 → 데모 여부(null·오류는 500) → 세션 RLS로 소스(·요약·회의) 생성 → `insertUploadedItems`(마스킹 후 service role insert) 순서. 전사는 동의한 멤버 표시 이름과 일치하는 발언만 넣는다.
- 세션 클라이언트로 `items`·`departments`에 쓰는 다른 앱 경로는 없다. 남은 `items` 쓰기는 워커 파이프라인(service role)과 service_role 전용 definer RPC(`ingest_slack_atomic`)뿐이다.
- 비차단 지적(후속): ① items 저장이 실패하면 빈 소스·요약 행이 남는다 ② 전사 라우트가 `meetings` 행보다 items를 먼저 넣어, 회의 행 저장이 실패하면 분류 job 없는 items가 남는다 ③ 소스 제목·파일명은 마스킹 대상이 아니다(기존 동작, 불변식 9는 `items.content` 대상) ④ `document_summaries`의 넓은 기존 쓰기 정책(위 절).

## 운영 반영 (O8, 2026-09-15 05:17~06:04 KST, 사용자 승인)

순서 원칙: 옛 코드는 세션으로 `items`에 insert하므로 **새 코드 배포 → 0025** 순서로 했다.

| 순서 | 작업 | 결과 | 근거 |
|---|---|---|---|
| 1 | 운영 권한 읽기 조회(PRD §10 #23, 적용 전) | 구멍 2건 실재 | anon·authenticated: `departments` INSERT·UPDATE·DELETE, `items` INSERT. `departments_member_access` cmd=ALL. 최신 적용 0024 |
| 2 | phase 8 커밋 `6812a3e` 스냅샷(Git 메타데이터 없음) 선빌드 | READY | `dpl_5coSV3pB9eqVyvPdFGtCASaCfqsC`. 첫 시도는 CLI 토큰 갱신 직후 "Not authorized", 재시도 성공. phase 7·9 코드는 스냅샷에 없음 |
| 3 | promote + 스모크 | PASS | `sasu-alpha.vercel.app` → `dpl_5coSV3…`(이전 `dpl_J4C4dgD4…`). `/demo` 200 · `/login` 200 · `/consent` 307 · `/api/jobs/run` 무시크릿 401 · `/api/slack/events` 무서명 401 |
| 4 | 적용 전 E2E — 읽기(`guest`·`team-coverage`) | 8/8 PASS | 기본 30초 제한에서는 게스트 완주 2건이 운영 지연으로 시간 초과(실측 36.6~39.3초). 120초로 재실행 PASS. 게스트 화면은 이번 배포와 무관 |
| 5 | 적용 전 E2E — `upload-boundaries` | 4 PASS · 2 skip(설계) | lead 문서 마스킹 · member 403 · 데모 부서 거부 · 전사 동의자 발언만 마스킹 |
| 6 | 적용 전 E2E — 쓰기(`agent-roles`·`ask-permission`·`vertical-slice`) | 3 PASS · 1 FAIL | 역할·ASK 권한 차등·세로 슬라이스 이벤트 흐름 PASS. **병합 1건 FAIL**: 회의 item은 업로드 202 → 분류 decision → 임베딩까지 정상이었고, 후보 카드에 `merge_confirm`(gpt-oss-20b) 1회 호출이 "같은 안건 아님"으로 판정해 새 카드가 생겼다(ADR-037의 확률적 경계, phase 8 경로와 무관). 테스트 정리에서 빠진 open 카드 `1de0d64d…`는 스펙과 같은 `decide_request(reject)`로 정리 |
| 7 | `supabase db push` | **0025만 적용** | dry-run 대상 0025 1건 확인 후 적용. 작업 트리의 미완성 0026이 섞이지 않게 phase 8 스냅샷 폴더에서 실행 |
| 8 | 운영 권한 읽기 조회(적용 후) | 회수 확인 | `departments`·`items`: REFERENCES·SELECT·TRIGGER·TRUNCATE만 남음(Supabase 기본 권한, PostgREST가 노출하지 않음). `departments_member_access` cmd=SELECT. 최신 적용 0025 |
| 9 | 적용 후 E2E — `upload-boundaries`(`E2E_EXPECT_0025=1`) | 6/6 PASS | 추가 확인: 부서장 토큰의 `items` 직접 INSERT → 42501 · 팀원의 `departments.org_id` UPDATE → 42501 |
| 10 | 적용 후 E2E — `guest` + 세로 슬라이스 이벤트 흐름 | 4 PASS · 1 FAIL → 재실행 PASS | 게스트 390px에서 카드 클릭 후 5초 안에 화면 전환이 끝나지 않음(대시보드는 anon 읽기로 정상 렌더). 단독 재실행 PASS(31.3초) |

남은 것:
- 병합 E2E는 재실행하지 않았다. LLM 확인 결과에 따라 통과·실패가 갈리고, 재실행하면 슬랙 발송·LLM 호출이 반복된다.
- 게스트 완주 스펙에 운영 지연을 반영했다(테스트 제한시간 120초, 클릭 뒤 URL 전환 대기).
- 운영 E2E가 남긴 데이터: 합성 업로드 소스는 스펙 정리(`remove_source`)로 본문이 삭제됐다. 병합 E2E 카드 2장은 rejected다.
