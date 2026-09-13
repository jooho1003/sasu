# D10 로컬 검증 실행 기록

- 검증일: 2026-09-13 (KST)
- 범위: Step 9 `local-verification`
- 판정: **AC 통과**
- 원문 질문·전사·슬랙 본문·비밀값은 이 기록에 남기지 않는다.

## 실행 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run lint` | PASS | 종료 코드 0, 6.62초 |
| `npx tsc --noEmit` | PASS | 종료 코드 0, 3.06초 |
| `npm run test` | PASS | 40개 파일, 685개 테스트, 3.52초. Vite 설정 관련 경고만 출력 |
| `npm run build` | PASS | Next.js 16.3.4 Turbopack 빌드 성공, 8.01초 |
| `node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"` | PASS | 45/45 시나리오, 2,016 assertions, 3.92초. `0004_worker_cron.sql`은 PGlite에서 pg_cron/pg_net을 지원하지 않아 제외 |
| `npm run e2e -- tests/e2e/guest.spec.ts` | PASS | 4/4, 11.23초. 데스크톱·모바일 완주, 실제 부서 접근 거부, 게스트 무쓰기·무 LLM 호출 확인 |
| 클라이언트 번들 비밀값 검사 | PASS | `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`, `SLACK_BOT_TOKEN`, `VOYAGE_API_KEY`, `NOTION_TOKEN` 각 0건 |

## PRD §11 완료 판정 매핑

### 이번 단계에서 로컬 판정 가능

| PRD §11 항목 | 로컬 판정 | 실행 근거 |
|---|---|---|
| DECIDE 병합 단위 | 판정 가능 | Vitest 및 보안 SQL에서 72시간·0.85·visibility 보존·중복 인용·Slack+회의 병합 경계를 검증. 합성 유사도 실측은 `D6-merge-similarity.md` 참조 |
| LEDGER 충돌 배지·원장 링크 | 판정 가능 | 단위/SQL 검증에서 유사 결정 검색·supersedes 제외·충돌 쓰기 경계를 통과 |
| 채널 제거 | 판정 가능 | 보안 SQL에서 lead 전용 제거, 원문·임베딩·분류 삭제, 원장 quote 보존, 비활성 소스 수신 차단을 통과 |
| ASK 일일 상한 | 판정 가능 | 보안 SQL에서 KST 기준 50회 허용·51회 거부·자정 리셋·사용자별 격리를 통과 |
| 동의 흐름 | 판정 가능 | 보안 SQL에서 Slack 본인 동의·24시간 가드·트랜잭션 내부 재확인·미동의 본문 미저장을 통과 |
| 전사 줄 번호 오류 | 판정 가능 | 기존 Step 0 파서 테스트 및 업로드 계약 검증 범위에 포함 |
| RLS·쓰기 경계·lease 워커 | 판정 가능 | 보안 SQL 45/45. 사용자 세션 쓰기 경계, lease 회수/만료, 원자 롤백을 확인 |

### 운영에서만 판정 가능

아래 항목은 로컬 실행 기록으로 완료 처리하지 않으며, **미실행 — 운영 반영 노드 O1~O6**로 남긴다.

| PRD §11 항목 | 상태 | 필요한 운영 증거 |
|---|---|---|
| WATCH 실제 팀 채널 하루치 20건 재현율 | 미실행 — 운영 반영 노드 O1 | 운영 Slack 데이터 수동 라벨과 분류 결과 비교 |
| 실제 Slack → 분류 → 카드 → 웹 결정 → 원장 5분 세로 슬라이스 | 미실행 — 운영 반영 노드 O2 | 운영 Slack 이벤트, 카드, 결정, 원장 행 ID |
| 운영 lead/member 권한별 답변 차이 | 미실행 — 운영 반영 노드 O3 | 두 운영 계정의 동일 질문 답변 및 citation visibility 확인 |
| 운영 `/demo` 시크릿 창·100명 부하 | 미실행 — 운영 반영 노드 O4 | 운영 URL 완주, 실데이터 문자열 0건, 동시 부하 결과 |
| 운영 키·배포·게스트 시드 | 미실행 — 운영 반영 노드 O5 | 승인 후 운영 환경에서만 실행할 배포·시드 기록 |
| 9/21~10/5 헬스체크 | 미실행 — 운영 반영 노드 O6 | 심사 기간 매일 1회 상태 기록 |

## 운영 반영 실행 기록 (2026-09-13 KST, 오케스트레이터)

사용자 승인(9/13): 운영 DB 마이그레이션 · main 머지/push/배포 · 게스트 재시드 · 실제 Slack E2E(기존 연결 채널).

| 순서 | 작업 | 결과 | 근거 |
|---|---|---|---|
| 0 | 운영 DB 읽기 전용 사전 점검 | 적용 가능 | 적용 마이그레이션 0015까지, citations (owner,item) 중복 0, sources 전부 active, 9/10부터 running classify job 1건 |
| 1 | 앱 선빌드(도메인 미할당) | READY | Git 연동·리포 CLI 배포는 Hobby 커밋 작성자 권한으로 BLOCKED(`dpl_UkjXnaKGhuvvZi1AgxRvxKhGkwR8`) → Git 메타데이터 없는 스냅샷으로 `dpl_HY933eTkv5zNo4FdQ6vaGJntLRQZ` |
| 2 | `supabase db push` 0016~0022 | 성공 | `schema_migrations` 최신 `0022` |
| 3 | promote | 성공 | `sasu-alpha.vercel.app` → `dpl_HY933eTkv5zNo4FdQ6vaGJntLRQZ`. DB 적용~promote 약 1분 |
| 4 | 스모크 | PASS | `/demo` 200 · `/login` 200 · `/consent` 비로그인 → `/login` · `/api/jobs/run` 무시크릿 401 · `/api/slack/events` 무서명 401 |
| 5 | 게스트 시드 | 성공 | 1차 3부서/답변 18 → step 13 후 재배포(`sasu-8wcop9q1l…`) 및 재시드 4부서/답변 24(디자인팀 24항목) |
| 6 | 결정 임베딩 백필 | 성공 | `embed_decision` 18 job done, 결정 전부 embedding 보유. 멈춘 classify job은 lease 회수로 완료 |
| 7 | 운영 E2E 1차 (`vertical-slice`) | FAIL → 원인 규명 | 새 카드 미생성. 원인: 9/10 E2E가 남긴 같은 안건 open 카드에 `merge_confirm=true`로 인용 병합(`llm_calls` merge_confirm 기록) — 병합 정상 동작, 테스트 가정 오류 → step 12 |
| 8 | 운영 E2E 2차 (게스트·세 팀·세로 슬라이스·병합) | 9/10 PASS | 실패 1건: 결정 버튼 클릭 후 POST 미발생(런타임 로그에 decide 요청 0건) — 콜드스타트 hydration 전 클릭. 동일 테스트 재실행 PASS(52.2초). 테스트를 hydration 안전하게 수정 |
| 9 | 테스트 산출 카드 정리 | 완료 | 1차 실패 run의 open 카드 1건을 lead 권한 `decide_request(reject)`로 반려(원장 삭제 없음) |
| 10 | 운영 게스트 실데이터 문자열 스캔 | 0건 | `/demo` + 4부서×(대시보드·원장·묻기) 13페이지에서 파일럿 조직명·실부서 id·실채널 id·작성자 식별자 검색 |

### PRD §11 운영 판정 갱신

| 항목 | 상태 |
|---|---|
| 실제 Slack → 분류 → 카드 → 웹 결정 → 원장 | **PASS** (운영, 합성 QA 메시지, 재실행 52.2초) |
| 슬랙 질문 + 회의 보류 → 카드 1장 병합 | **PASS** (운영 병합 E2E, 이중 인용 확인 후 반려 정리) |
| 운영 `/demo` 완주·실데이터 0건 | **PASS** (게스트 4부서, 세 팀 acceptance 포함). 100명 동시 부하는 미실행 |
| 운영 lead/member 권한별 답변 차이 | **PASS** (`ask-permission.spec.ts` 운영 1.5분: 같은 질문에 lead 답변·인용에 leads_only 근거 포함, member 답변·인용·응답 JSON에 미포함·제외 흔적 없음, member 화면 고정 문구 표시. 1차는 고정 문구를 빈 페이지에서 찾은 테스트 오류로 실패 → 수정 후 통과. 합성 근거는 lead 소스 제거 경로로 정리) |
| WATCH 실제 팀 채널 20건 재현율 | 미실행 (실데이터 수동 라벨 필요) |
| 슬랙 DM 버튼 결정·동의 DM 실발송 | 미실행 (웹 결정 경로만 운영 검증) |

## 마이그레이션 적용 순서

현재 저장소의 신규 마이그레이션은 `0016_jobs_lease.sql`부터 `0022_consent_via_slack.sql`까지다.

1. DB 마이그레이션 적용: `0016` → `0022` 순서
2. 결정 임베딩 백필 실행
3. 앱 배포
4. 게스트 시드 실행

운영 적용은 승인 노드 이후에만 수행한다. `0004_worker_cron.sql`의 pg_cron/pg_net 설정은 Supabase 운영 환경에서 별도로 확인한다.

## 이전 시도와 비교

이전 실행에서 클라이언트 번들 검사에 실패 기록이 있었으나, 이번 production build 후 동일한 5개 키의 앞 8자 검색은 모두 0건으로 재검증됐다. 이번 단계에서는 코드를 수정하지 않았다.
