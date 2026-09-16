# 기간 제한 없는 후속 개발 검증 — 2026-09-16

사용자가 승인한 순서대로 phase 16 → 17 → 18 → 19를 구현했다. 브랜치는 `feat/product-continuity`이며 PRD §3·§8, ADR-052가 범위의 기준이다. 이 기록은 **개발 및 로컬 검증 시점**의 결과다. 이후 사용자 승인으로 운영 DB 마이그레이션·배포·실제 연동을 진행했으며 최신 상태는 [운영 반영 검증](continuity-production-2026-09-16.md)에 기록했다.

## 구현 결과

| 단계 | 구현과 확인 사항 |
|---|---|
| 16 원본 수정·삭제 | Slack 편집 순서·삭제 tombstone, 본문 삭제, 분류·임베딩 버전 조건부 완료, 오래된 카드 무효화와 기존 DM 수정 job. Notion 전체 읽기 성공 후 원자 반영, lease, 5분 자동 갱신 설정. |
| 17 결정 후속 | 최신 결정에만 append-only 정정, 최초 카드 근거까지 복제, 이전 이력 표시, Q&A·카드 선례에서 대체된 결정 제외. 담당자·부서장의 예약·취소와 마감 알림, 현재 담당자·동의 재검증, 세대·lease 기반 재시도. |
| 18 질문 대화 | 본인 웹·Slack 질문 기록과 커서 페이지, 웹 후속 질문·새 질문 전환, 같은 질문자·부서·Slack 스레드의 문맥 연결. 이전 질문 최대 6개만 문맥으로 사용하고 매 답변의 근거를 새로 검색·검증. |
| 19 고객사 Slack 설치 | 조직 관리자 OAuth 시작·콜백, 세션·cookie·단회 state, AES-256-GCM 암호화와 조직/team AAD, workspace별 이벤트·job·토큰 격리, 해지·재설치, 관리자 UI, 기존 수동 설치 이전 스크립트. |

## 실행 결과

| 검사 | 결과 | 원본 기록 |
|---|---|---|
| ESLint | 통과 | [lint.txt](product-continuity-2026-09-16/lint.txt) |
| Next.js 프로덕션 빌드 (`SASU_ORG_ADMIN_MODE=on`) | 통과 | [build.txt](product-continuity-2026-09-16/build.txt) |
| Vitest | 77 파일, **1,012개 통과** | [unit.txt](product-continuity-2026-09-16/unit.txt) |
| 격리 SQL 하니스 | **145개 통과**, 4조직·12부서·24사용자·72원문 권한 조합 **2,016개 assertion** | [sql.txt](product-continuity-2026-09-16/sql.txt) |
| Playwright 선택 회귀 | **36개 통과**, 실패·skip 0 | [e2e.txt](product-continuity-2026-09-16/e2e.txt) |
| 카드 선례 보완 | SQL RED → GREEN, 카드 단위 49개 통과 후 전체 단위 재실행 | [RED](product-continuity-2026-09-16/correction-precedent-red.txt), [카드 단위](product-continuity-2026-09-16/card-focused.txt) |
| 정적 확인 | `git diff --check` 통과, AGENTS.md·CLAUDE.md SHA-256 동일 | 아래 리뷰 항목 |

최종 lint → build → test는 순서대로 실행했다. SQL은 `.env`·운영 DB를 읽지 않는 PGlite에서 모든 migration을 적용하고 검사했다. `0004_worker_cron.sql`은 PGlite에 pg_cron/pg_net이 없어 제외되며, 실제 cron 실행을 검증한 것으로 간주하지 않는다. 기존 0026~0028 rollback 회귀도 통과했다.

브라우저 검사는 로컬 production 서버와 QA 로그인으로 실행했다. 새 기능의 쓰기 API와 OAuth 리디렉션은 합성 응답으로 가로챘다. 기존 화면·게스트 검사는 실제 읽기 경로를 이용하며 게스트의 DB 쓰기·LLM 호출 증가가 없음을 확인했다. 새 SQL 경계는 별도의 격리 DB 하니스로 검증했다. 브라우저 통과를 운영 DB를 연결한 새 기능의 전체 통합 검증이나 실제 Slack 설치 성공으로 해석하면 안 된다.

E2E 완료 후 마지막 카드 최근 선례 조회를 SQL RPC로 보완했다. 이 변경은 카드 단위·전체 단위·SQL 하니스·빌드로 다시 확인했다. 화면 코드는 바뀌지 않아 브라우저 검사는 반복하지 않았다.

### 재현 명령

```powershell
$env:SASU_ORG_ADMIN_MODE='on'
npm run lint
npm run build
npm run test
node scripts/verify-security-sql.mjs <PGlite 설치 경로>

# 별도 셸에서 실행
$env:SASU_ORG_ADMIN_MODE='on'
npm run start -- --port 3100

# 테스트 셸에서 실행
$env:E2E_BASE_URL='http://localhost:3100'
$env:E2E_CONTINUITY_ADMIN='1'
$env:E2E_ALLOW_EXTERNAL_WRITES='0'
npx playwright test tests/e2e/product-continuity.spec.ts tests/e2e/slack-onboarding.spec.ts tests/e2e/workspace-polish.spec.ts tests/e2e/slack-questions.spec.ts tests/e2e/guest.spec.ts tests/e2e/site.spec.ts tests/e2e/ui-refresh.spec.ts
```

로그는 Playwright가 정리하는 `test-results/` 외부인 이 기록의 하위 디렉터리에 보존한다. 저장 시 ANSI 색상 코드와 줄 끝 공백만 정리했다. QA 로그인용 기존 환경은 필요하며 `.env` 값은 기록하지 않는다. 로컬 검증 서버는 종료했다.

### 발견한 문제와 처리

- 관리자 기능을 끄고 빌드한 정적 `/demo/admin`은 서버 실행 시에만 플래그를 켜도 404였다. 관리자 기능을 켜고 재빌드한 뒤 두 회귀 검사를 통과했다.
- OAuth 화면의 `status` 역할이 두 곳이라 단일 locator가 실패했다. 확인할 안내 문구로 locator를 구체화했다.
- Notion UI 합성 응답에 로그인 멤버가 없어서 설정 오류 화면이 표시됐다. 동의한 멤버 fixture를 추가하고 데스크톱·모바일 켜기/중지 검사를 통과했다.
- 모바일 전체 화면 캡처에서 비활성 skip link가 보였다. 비활성 시 투명·클릭 불가로, 키보드 focus 시 표시되도록 수정했다.
- 최종 리뷰에서 카드의 최근 결정 fallback이 대체된 결정을 포함할 수 있음을 발견했다. `recent_decisions_for_card`에 대한 실패 검사를 먼저 실행하고, worker 전용 최신 선례 RPC로 교체했다. 기존 임베딩 선례 RPC는 이미 대체된 결정을 제외한다.

## 화면 증거

모든 새 기능 화면은 합성 업무 데이터이며 실제 고객사의 설치·발송 증거가 아니다. 390px 화면은 직접 이미지로 확인했고 가로 넘침 검사는 두 크기 모두 통과했다.

| 화면 | 데스크톱 1440px | 모바일 390px |
|---|---|---|
| Notion 자동 갱신 | [보기](product-continuity-2026-09-16/notion-sync-1440.png) | [보기](product-continuity-2026-09-16/notion-sync-390.png) |
| 결정 정정과 이력 | [보기](product-continuity-2026-09-16/correction-1440.png) | [보기](product-continuity-2026-09-16/correction-390.png) |
| 카드 알림 예약 | [보기](product-continuity-2026-09-16/reminder-1440.png) | [보기](product-continuity-2026-09-16/reminder-390.png) |
| 질문 기록·후속 질문 | [보기](product-continuity-2026-09-16/questions-1440.png) | [보기](product-continuity-2026-09-16/questions-390.png) |
| Slack 설치 상태 | [보기](product-continuity-2026-09-16/slack-installation-1440.png) | [보기](product-continuity-2026-09-16/slack-installation-390.png) |

## 코드·보안 리뷰

- 가시성은 SQL `can_see()`를 재사용한다. 웹의 정정·알림·질문 API는 세션 클라이언트와 멤버십을 사용하며 actor/dept를 본문에서 채택하지 않는다. 직접 DB 호출의 위조·다른 사용자·다른 부서도 SQL 검사에 포함했다.
- OAuth 완료의 service role은 세션·단회 state와 Slack 교환이 검증된 설치 자격 증명의 수집 저장에만 사용한다. 일반 설정은 세션 클라이언트를 유지한다. 설치/state 테이블·worker RPC의 브라우저 권한 거절과 두 조직의 동일 Slack ID·채널 ID 격리를 확인했다.
- LLM 호출은 기존 `llm.structured()`에 모이며 새 호출점·원문 로그를 추가하지 않았다. 이전 생성 답변을 후속 질문의 근거로 사용하지 않는다. 인용 0개에 대한 기존 거절·재검토 경계를 유지한다.
- 원문 편집·삭제, 지연된 분류/임베딩 성공·실패, tombstone 이전 도착, Notion 부분 실패·중복 완료, 카드 근거 변경과 원장 스냅샷 보존을 검사했다.
- 알림·Slack 전달은 job으로 실행하며 세대와 lease로 중복 작업을 막는다. 현재 담당자·동의·카드 상태를 다시 확인하고 알림에는 원문을 넣지 않는다. Slack 전송 성공과 DB 완료 사이의 장애로 인한 중복 발송 가능성은 남는다.
- 새 lib 모듈 `slack/change`, `pipeline/reminder`, `slack/installation`, `slack/workspace`는 실패 테스트를 먼저 실행한 후 구현했다. 기록된 최종 테스트 외에 실제 모델 호출 평가는 실행하지 않았다.

## 운영 반영 전 남은 작업 (개발 검증 당시)

아래는 배포 전 기록이다. 2026-09-16 운영 적용 결과와 아직 실행하지 않은 외부 검증은 [운영 반영 검증](continuity-production-2026-09-16.md)을 따른다.

구체적인 적용 순서는 [setup-guide §14](../setup-guide.md#14-후속-기능과-고객사-slack-설치-adr-052)에 있다. 로컬에는 `SLACK_CLIENT_ID`, `SLACK_CLIENT_SECRET`, `SLACK_TOKEN_ENCRYPTION_KEY`가 없으므로 실제 OAuth 설치는 미검증이다. 값의 존재 여부만 확인했으며 비밀값을 출력하거나 변경하지 않았다.

사용자 승인 후 백업·점검 창을 확보하여 `0030`~`0033` 마이그레이션, 기존 Slack 수동 설치 이전, 새 앱 반영, cron 재개와 실제 외부 서비스 검증을 진행해야 한다. 신규 코드에는 전역 `SLACK_BOT_TOKEN` fallback이 없으므로 **기존 설치 이전을 빠뜨린 채 앱을 반영하면 Slack 처리가 차단된다.** 운영 DB의 기존 정정 분기와 활성 채널 중복도 인덱스 적용 전에 확인한다.

조직 생성·가입 자동화, 결제, Slack token rotation, Enterprise Grid 조직 전체 설치는 이 단계의 범위가 아니다. 조직 관리자 계정과 조직당 하나의 Slack 워크스페이스를 전제로 한다. 실제 Notion 갱신, Slack 편집·삭제, 예약·마감 DM, OAuth 설치·해지·재설치의 배포 환경 검증은 아직 남아 있다.
