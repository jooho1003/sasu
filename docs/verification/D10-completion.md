# D10 로컬 검증 실행 기록

- 검증일: 2026-09-13 (KST)
- 범위: Step 9 `local-verification`
- 판정: **AC 실패** — 클라이언트 번들에서 `SUPABASE_SERVICE_ROLE_KEY` 앞 8자가 1건 발견됨
- 원문 질문·전사·슬랙 본문·비밀값은 이 기록에 남기지 않는다.

## 실행 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run lint` | PASS | 종료 코드 0, 10.27초 |
| `npx tsc --noEmit` | PASS | 종료 코드 0, 6.25초 |
| `npm run test` | PASS | 40개 파일, 685개 테스트, 4.92초. Vite 설정 관련 경고만 출력 |
| `npm run build` | PASS | Next.js 16.3.4 Turbopack 빌드 성공, 8.43초 |
| `node scripts/verify-security-sql.mjs "D:/바이브코딩/.sasu-qa-db"` | PASS | 45/45 시나리오, 2,016 assertions. `0004_worker_cron.sql`은 PGlite에서 pg_cron/pg_net을 지원하지 않아 제외 |
| `npm run e2e -- tests/e2e/guest.spec.ts` | PASS | 4/4, 11.1초. 데스크톱·모바일 완주, 실제 부서 접근 거부, 게스트 무쓰기·무 LLM 호출 확인 |
| 클라이언트 번들 비밀값 검사 | **FAIL** | `GROQ_API_KEY`: 0건, `SLACK_BOT_TOKEN`: 0건, `VOYAGE_API_KEY`: 0건, `NOTION_TOKEN`: 0건. `SUPABASE_SERVICE_ROLE_KEY`: 1건 (`.next/static/chunks/3g7up9zty27uy.js`) |

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

## 마이그레이션 적용 순서

현재 저장소의 신규 마이그레이션은 `0016_jobs_lease.sql`부터 `0022_consent_via_slack.sql`까지다.

1. DB 마이그레이션 적용: `0016` → `0022` 순서
2. 결정 임베딩 백필 실행
3. 앱 배포
4. 게스트 시드 실행

운영 적용은 승인 노드 이후에만 수행한다. `0004_worker_cron.sql`의 pg_cron/pg_net 설정은 Supabase 운영 환경에서 별도로 확인한다.

## 실패 및 후속 조치

번들 검사 실패 원인은 `.next/static/chunks/3g7up9zty27uy.js`에 `SUPABASE_SERVICE_ROLE_KEY` 값의 앞 8자가 포함된 것이다. Step 9의 지시대로 이 단계에서는 코드를 수정하지 않았다. 해당 누출을 수정하고 빌드를 다시 만든 뒤 번들 검사를 재실행해야 한다. AC 실패로 Step 9는 `error`로 닫는다.
